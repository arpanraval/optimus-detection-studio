import { defineConfig, loadEnv } from 'vite';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import * as https from 'node:https';
import * as http from 'node:http';

/**
 * Dev-only CORS proxy for local vendor API testing (Splunk, Elastic, etc.).
 * Accepts POST /dev-proxy with { url, method, headers, body } and forwards the request.
 * Uses node:http/https directly to support self-signed certs on local instances.
 * Only active in dev mode — never included in production builds.
 */
function devVendorProxy(): Plugin {
  return {
    name: 'dev-vendor-proxy',
    configureServer(server) {
      server.middlewares.use('/dev-proxy', async (req, res) => {
        if (req.method === 'OPTIONS') {
          res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
          });
          res.end();
          return;
        }

        if (req.method !== 'POST') {
          res.writeHead(405, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Method not allowed' }));
          return;
        }

        // Read request body
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(chunk as Buffer);
        const body = JSON.parse(Buffer.concat(chunks).toString());

        const { url: targetUrl, method, headers, body: vendorBody } = body as {
          url: string;
          method: string;
          headers: Record<string, string>;
          body?: string;
        };

        try {
          const parsed = new URL(targetUrl);

          // Block requests to private/internal networks (SSRF protection)
          const hostname = parsed.hostname;
          const isPrivate = /^(127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|0\.|localhost$|::1$|\[::1\]|169\.254\.)/.test(hostname)
            || hostname === 'metadata.google.internal'
            || hostname.endsWith('.internal');
          if (isPrivate) {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Requests to private/internal addresses are blocked' }));
            return;
          }

          const isHttps = parsed.protocol === 'https:';
          const transport = isHttps ? https : http;

          const result = await new Promise<{ status: number; ok: boolean; body: string }>((resolve, reject) => {
            const proxyReq = transport.request(
              targetUrl,
              {
                method: method || 'GET',
                headers: headers || {},
                // Dev-only: accept self-signed certs for local Splunk/Elastic
                ...(isHttps ? { rejectUnauthorized: false } : {}),
              },
              (proxyRes) => {
                const responseChunks: Buffer[] = [];
                proxyRes.on('data', (chunk: Buffer) => responseChunks.push(chunk));
                proxyRes.on('end', () => {
                  const responseText = Buffer.concat(responseChunks).toString();
                  const status = proxyRes.statusCode || 502;
                  resolve({ status, ok: status >= 200 && status < 300, body: responseText });
                });
              }
            );

            proxyReq.on('error', reject);
            if (vendorBody) proxyReq.write(vendorBody);
            proxyReq.end();
          });

          res.writeHead(result.status >= 200 ? 200 : result.status, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          });
          res.end(JSON.stringify(result));
        } catch (err: any) {
          res.writeHead(502, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          });
          res.end(JSON.stringify({
            status: 502,
            ok: false,
            body: JSON.stringify({ error: err.message || 'Proxy request failed' }),
          }));
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react(), devVendorProxy()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url))
      }
    },
    worker: {
      format: 'es',
      plugins: () => [react()],
    },
    build: {
      target: 'esnext',
      rollupOptions: {
        output: {
          manualChunks: {
            'monaco-editor': ['monaco-editor', '@monaco-editor/react'],
            'recharts': ['recharts'],
            'export-tools': ['exceljs', 'jspdf', 'jspdf-autotable'],
          },
        },
      },
    },
    server: {
      // Security headers for development server
      headers: {
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-XSS-Protection': '1; mode=block',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
      },
      // Note: COOP/COEP headers removed to allow CDN resources
      // If Pyodide SharedArrayBuffer is needed, consider using credentialless:
      // 'Cross-Origin-Embedder-Policy': 'credentialless',
    },
    preview: {
      // Security headers for preview/production builds
      headers: {
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-XSS-Protection': '1; mode=block',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
      },
    },
  };
});
