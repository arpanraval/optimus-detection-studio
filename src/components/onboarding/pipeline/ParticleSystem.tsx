/**
 * ParticleSystem
 *
 * Canvas-based particle animation overlaid on the SVG pipeline visualization.
 * Particles travel along SVG path curves to create a data-flow effect.
 *
 * Key techniques:
 *   - Pre-samples SVG paths into cached point arrays
 *   - Coordinate transform from SVG viewBox space to canvas pixel space
 *   - Object-pool pattern for zero-allocation particle recycling
 *   - Respects prefers-reduced-motion (renders nothing)
 *   - Pauses when the tab is hidden (document.hidden)
 *   - HiDPI-aware via devicePixelRatio scaling
 */

import { useRef, useEffect, useCallback, useMemo } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ParticlePath {
  id: string;
  pathData: string;
  color: string;
  active: boolean;
}

interface ParticleSystemProps {
  width: number;
  height: number;
  paths: ParticlePath[];
  svgViewBox: { x: number; y: number; width: number; height: number };
}

interface Point {
  x: number;
  y: number;
}

interface Particle {
  pathIndex: number;
  progress: number; // 0..1 along the cached path
  speed: number; // progress increment per ms
  size: number; // radius in px
  opacity: number;
  color: string;
  alive: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_PARTICLES = 200;
const SPAWN_RATE = 3; // particles per active path per second
const SAMPLE_INTERVAL_PX = 2.5; // sample every ~2.5px along each path
const MIN_SPEED = 0.0000025; // progress per ms (~0.0025 per 1000ms frame-budget)
const MAX_SPEED = 0.000006;
const MIN_SIZE = 1.5;
const MAX_SIZE = 3;
const MIN_OPACITY = 0.6;
const MAX_OPACITY = 1.0;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/**
 * Parse a hex color (#rrggbb) into "r, g, b" for use in rgba().
 * Falls back to white on bad input.
 */
function hexToRgb(hex: string): string {
  const h = hex.replace('#', '');
  if (h.length < 6) return '255, 255, 255';
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `${r}, ${g}, ${b}`;
}

// ---------------------------------------------------------------------------
// Path sampling (runs in an offscreen SVG)
// ---------------------------------------------------------------------------

/**
 * Build an array of {x, y} points by sampling an SVG path at regular intervals.
 * Uses a temporary off-screen SVG to call getPointAtLength().
 */
function samplePath(pathData: string, sampleInterval: number): Point[] {
  // Create a temporary SVG + path in the DOM (must be in DOM for geometry APIs)
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.style.position = 'absolute';
  svg.style.visibility = 'hidden';
  svg.style.pointerEvents = 'none';

  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', pathData);
  svg.appendChild(path);
  document.body.appendChild(svg);

  const totalLength = path.getTotalLength();
  const points: Point[] = [];

  for (let d = 0; d <= totalLength; d += sampleInterval) {
    const pt = path.getPointAtLength(d);
    points.push({ x: pt.x, y: pt.y });
  }

  // Always include the very end point
  if (points.length > 0) {
    const endPt = path.getPointAtLength(totalLength);
    const last = points[points.length - 1];
    if (last.x !== endPt.x || last.y !== endPt.y) {
      points.push({ x: endPt.x, y: endPt.y });
    }
  }

  document.body.removeChild(svg);
  return points;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ParticleSystem({ width, height, paths, svgViewBox }: ParticleSystemProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const spawnAccRef = useRef<Map<number, number>>(new Map()); // accumulated spawn time per path
  const particlePoolRef = useRef<Particle[]>([]);
  const cachedPointsRef = useRef<Map<string, Point[]>>(new Map());

  // -------------------------------------------------------------------------
  // prefers-reduced-motion check
  // -------------------------------------------------------------------------
  const prefersReducedMotion = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  // -------------------------------------------------------------------------
  // Initialize particle pool once
  // -------------------------------------------------------------------------
  if (particlePoolRef.current.length === 0) {
    const pool: Particle[] = [];
    for (let i = 0; i < MAX_PARTICLES; i++) {
      pool.push({
        pathIndex: 0,
        progress: 0,
        speed: 0,
        size: 2,
        opacity: 0.8,
        color: '255, 255, 255',
        alive: false,
      });
    }
    particlePoolRef.current = pool;
  }

  // -------------------------------------------------------------------------
  // Sample paths when pathData changes
  // -------------------------------------------------------------------------
  useEffect(() => {
    const cache = cachedPointsRef.current;
    for (const p of paths) {
      if (!cache.has(p.id)) {
        cache.set(p.id, samplePath(p.pathData, SAMPLE_INTERVAL_PX));
      }
    }
    // Clean up old entries that are no longer in the paths list
    const currentIds = new Set(paths.map((p) => p.id));
    Array.from(cache.keys()).forEach((key) => {
      if (!currentIds.has(key)) cache.delete(key);
    });
  }, [paths]);

  // -------------------------------------------------------------------------
  // Coordinate transform: SVG viewBox -> canvas CSS pixels
  // -------------------------------------------------------------------------
  const toCanvas = useCallback(
    (pt: Point): Point => ({
      x: ((pt.x - svgViewBox.x) / svgViewBox.width) * width,
      y: ((pt.y - svgViewBox.y) / svgViewBox.height) * height,
    }),
    [svgViewBox.x, svgViewBox.y, svgViewBox.width, svgViewBox.height, width, height],
  );

  // -------------------------------------------------------------------------
  // Spawn a particle into the pool
  // -------------------------------------------------------------------------
  const spawnParticle = useCallback(
    (pathIndex: number, pathId: string, color: string) => {
      const pool = particlePoolRef.current;
      for (let i = 0; i < pool.length; i++) {
        if (!pool[i].alive) {
          pool[i].alive = true;
          pool[i].pathIndex = pathIndex;
          pool[i].progress = 0;
          pool[i].speed = rand(MIN_SPEED, MAX_SPEED);
          pool[i].size = rand(MIN_SIZE, MAX_SIZE);
          pool[i].opacity = rand(MIN_OPACITY, MAX_OPACITY);
          pool[i].color = hexToRgb(color);
          return;
        }
      }
      // Pool exhausted — skip
    },
    [],
  );

  // -------------------------------------------------------------------------
  // Main animation loop
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (prefersReducedMotion) return;
    if (!canvasRef.current) return;
    if (width === 0 || height === 0) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // HiDPI scaling
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    lastTimeRef.current = performance.now();

    const tick = (now: number) => {
      // Skip if tab hidden
      if (document.hidden) {
        lastTimeRef.current = now;
        animFrameRef.current = requestAnimationFrame(tick);
        return;
      }

      const dt = Math.min(now - lastTimeRef.current, 50); // cap delta at 50ms to avoid jumps
      lastTimeRef.current = now;

      // Clear
      ctx.clearRect(0, 0, width, height);

      const pool = particlePoolRef.current;
      const cache = cachedPointsRef.current;

      // --- Spawn new particles for active paths ---
      const spawnAcc = spawnAccRef.current;
      for (let pi = 0; pi < paths.length; pi++) {
        const p = paths[pi];
        if (!p.active) continue;
        if (!cache.has(p.id)) continue;

        const acc = (spawnAcc.get(pi) || 0) + dt;
        const spawnIntervalMs = 1000 / SPAWN_RATE;
        let remaining = acc;

        while (remaining >= spawnIntervalMs) {
          spawnParticle(pi, p.id, p.color);
          remaining -= spawnIntervalMs;
        }

        spawnAcc.set(pi, remaining);
      }

      // --- Update & draw particles ---
      ctx.save();
      for (let i = 0; i < pool.length; i++) {
        const particle = pool[i];
        if (!particle.alive) continue;

        // Advance progress
        particle.progress += particle.speed * dt;

        if (particle.progress >= 1) {
          // Check if the source path is still active — if so recycle, else kill
          const sourcePath = paths[particle.pathIndex];
          if (sourcePath && sourcePath.active) {
            // Recycle: pick a random active path
            const activeIndices: number[] = [];
            for (let ai = 0; ai < paths.length; ai++) {
              if (paths[ai].active) activeIndices.push(ai);
            }
            if (activeIndices.length > 0) {
              const newIdx = activeIndices[Math.floor(Math.random() * activeIndices.length)];
              particle.pathIndex = newIdx;
              particle.progress = 0;
              particle.speed = rand(MIN_SPEED, MAX_SPEED);
              particle.size = rand(MIN_SIZE, MAX_SIZE);
              particle.opacity = rand(MIN_OPACITY, MAX_OPACITY);
              particle.color = hexToRgb(paths[newIdx].color);
              continue; // skip drawing this frame
            }
          }
          particle.alive = false;
          continue;
        }

        // Look up position from cached points
        const pathObj = paths[particle.pathIndex];
        if (!pathObj) {
          particle.alive = false;
          continue;
        }
        const points = cache.get(pathObj.id);
        if (!points || points.length === 0) {
          particle.alive = false;
          continue;
        }

        const floatIndex = particle.progress * (points.length - 1);
        const idx0 = Math.floor(floatIndex);
        const idx1 = Math.min(idx0 + 1, points.length - 1);
        const frac = floatIndex - idx0;

        if (!points[idx0] || !points[idx1]) {
          particle.alive = false;
          continue;
        }

        const svgPt: Point = {
          x: points[idx0].x + (points[idx1].x - points[idx0].x) * frac,
          y: points[idx0].y + (points[idx1].y - points[idx0].y) * frac,
        };

        const canvasPt = toCanvas(svgPt);

        // Draw glowing particle
        ctx.beginPath();
        ctx.arc(canvasPt.x, canvasPt.y, particle.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${particle.color}, ${particle.opacity})`;
        ctx.shadowBlur = 6;
        ctx.shadowColor = `rgba(${particle.color}, ${particle.opacity * 0.8})`;
        ctx.fill();
      }
      ctx.restore();

      animFrameRef.current = requestAnimationFrame(tick);
    };

    animFrameRef.current = requestAnimationFrame(tick);

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = 0;
      }
    };
    // Re-create loop when dimensions or paths change
  }, [prefersReducedMotion, width, height, paths, toCanvas, spawnParticle]);

  // -------------------------------------------------------------------------
  // Render nothing for reduced-motion users
  // -------------------------------------------------------------------------
  if (prefersReducedMotion) return null;

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width,
        height,
        zIndex: 2,
        pointerEvents: 'none',
      }}
    />
  );
}
