/**
 * Demo Request Edge Function
 *
 * Receives demo requests from the landing page and sends an email
 * notification to the Optimus team via Resend API.
 * Also stores the request in the access_requests table.
 *
 * Required env vars:
 *   RESEND_API_KEY - Resend API key (re_xxxxxxxxx)
 *   DEMO_NOTIFY_EMAIL - Email to receive notifications (e.g. optimus@detectionstudio.com)
 */

declare const Deno: {
  env: { get(key: string): string | undefined };
  serve(handler: (req: Request) => Promise<Response>): void;
};

// Public-facing function — permissive CORS (no auth required)
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

const FREE_DOMAINS = [
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com',
  'icloud.com', 'mail.com', 'protonmail.com', 'zoho.com', 'yandex.com',
  'live.com', 'msn.com', 'me.com', 'inbox.com', 'gmx.com',
];

function isBusinessEmail(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase();
  return !!domain && !FREE_DOMAINS.includes(domain);
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  try {
    const { email, message } = await req.json();

    // Validate
    if (!email || typeof email !== 'string') {
      return jsonResponse({ error: 'Email is required' }, 400);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return jsonResponse({ error: 'Invalid email format' }, 400);
    }
    if (!isBusinessEmail(email)) {
      return jsonResponse({ error: 'Please use a business email address' }, 400);
    }

    // Sanitize inputs to prevent HTML injection in email
    const sanitize = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const safeEmail = sanitize(email);
    const safeMessage = message ? sanitize(String(message)) : '';

    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    const NOTIFY_EMAIL = Deno.env.get('DEMO_NOTIFY_EMAIL') || 'optimus@detectionstudio.com';

    if (!RESEND_API_KEY) {
      console.error('RESEND_API_KEY not configured');
      return jsonResponse({ error: 'Email service not configured' }, 500);
    }

    // Send notification email to your mailbox
    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Optimus Detection Studio <noreply@detectionstudio.com>',
        to: NOTIFY_EMAIL,
        subject: `Demo Request from ${safeEmail}`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: #1a1a2e; color: #e0e0e0; padding: 24px; border-radius: 12px;">
              <h2 style="color: #c06090; margin-top: 0;">New Demo Request</h2>
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; color: #888; width: 120px;">Business Email</td>
                  <td style="padding: 8px 0; color: #fff; font-weight: bold;">${safeEmail}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #888; vertical-align: top;">Message</td>
                  <td style="padding: 8px 0; color: #ddd;">${safeMessage || '<em style="color: #666;">No message provided</em>'}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #888;">Submitted</td>
                  <td style="padding: 8px 0; color: #ddd;">${new Date().toISOString()}</td>
                </tr>
              </table>
              <hr style="border: none; border-top: 1px solid #333; margin: 16px 0;" />
              <p style="color: #666; font-size: 12px; margin-bottom: 0;">
                Reply directly to this email to respond to the requester.
              </p>
            </div>
          </div>
        `,
        reply_to: email,
      }),
    });

    if (!emailResponse.ok) {
      const err = await emailResponse.text();
      console.error('Resend error:', err);
      return jsonResponse({ error: 'Failed to send notification' }, 500);
    }

    // Also store in database (best-effort, don't fail if this errors)
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      if (supabaseUrl && supabaseKey) {
        await fetch(`${supabaseUrl}/rest/v1/access_requests`, {
          method: 'POST',
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ email, message }),
        });
      }
    } catch (dbErr) {
      console.warn('Failed to store in DB (non-fatal):', dbErr);
    }

    return jsonResponse({ success: true, message: 'Demo request submitted' });

  } catch (err) {
    console.error('Demo request error:', err);
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
});
