
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Icon } from './Icon';
import { useToast } from '../hooks/useToast';
import { useTheme } from '../context/ThemeContext';
import { logAuditEvent } from '../lib/audit';

// ============================================================================
// CONSTANTS & TYPES
// ============================================================================

const ACCENT = '#783264';
const BLUE = '#005091';

// Beta mode: only login is available. Sign-up and password reset are admin-only.
type AuthView = 'login';
type ParticleShape = 'pixel' | 'cross' | 'diamond' | 'hollow' | 'dash';

interface Particle {
  x: number; y: number; vx: number; vy: number;
  size: number; baseAlpha: number; alpha: number;
  color: string; pulseOffset: number; shape: ParticleShape;
  layer: number; life: number; maxLife: number; isTrail: boolean;
}

// Shared mutable ref: BrandContent sets it, CyberDust reads it
const turbineState = { active: false, cx: 0, cy: 0 };

// Brand logo style — magenta blades, blue outer ring
const brandLogoStyle = {
  '--md-sys-color-primary': '120 50 100',
  '--md-sys-color-tertiary': '0 80 145',
} as React.CSSProperties;

// ============================================================================
// CYBERDUST — Canvas particle system
// ============================================================================

const CyberDust: React.FC<{ variant?: 'light' | 'dark' }> = ({ variant = 'light' }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: -1000, y: -1000 });
  const prevMouseRef = useRef({ x: -1000, y: -1000 });
  const trailQueueRef = useRef<Array<{ x: number; y: number }>>([]);
  const particlesRef = useRef<Particle[]>([]);
  const rafRef = useRef<number>(0);
  const isDark = variant === 'dark';
  const colorsRef = useRef<string[]>([]);

  const COLORS_DARK = ['#783264', '#783264', '#005091', '#005091', '#4D7C6F', '#ffffff', '#a855f7'];
  const COLORS_LIGHT = ['#783264', '#783264', '#005091', '#005091', '#4D7C6F', '#2d1b4e', '#0e4a6f'];
  const SHAPES: ParticleShape[] = ['pixel', 'pixel', 'pixel', 'cross', 'diamond', 'hollow', 'dash'];
  const MAX_PARTICLES = 500;

  const pickColor = () => colorsRef.current[Math.floor(Math.random() * colorsRef.current.length)];
  const pickShape = () => SHAPES[Math.floor(Math.random() * SHAPES.length)];

  const createParticle = useCallback((x: number, y: number, isTrail: boolean): Particle => {
    const layer = isTrail ? 2 : (Math.random() < 0.3 ? 0 : Math.random() < 0.6 ? 1 : 2);
    const angle = Math.random() * Math.PI * 2;
    // Trail: moderate scatter so particles spread like dust, not clump into lines
    const speed = isTrail ? (Math.random() * 0.6 + 0.2) : (Math.random() * 0.2 + 0.05);
    return {
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: isTrail ? (Math.random() * 2.5 + 1) : ([1.5, 2, 3][layer] + Math.random() * 0.5),
      // Ambient particles much more visible; trail bright
      baseAlpha: isTrail ? (Math.random() * 0.3 + 0.5) : ([0.25, 0.35, 0.5][layer] + Math.random() * 0.1),
      alpha: 0,
      color: pickColor(),
      pulseOffset: Math.random() * Math.PI * 2,
      shape: pickShape(),
      layer,
      life: 0,
      maxLife: isTrail ? (Math.random() * 80 + 40) : (Math.random() * 600 + 400),
      isTrail,
    };
  }, []);

  const initParticles = useCallback((w: number, h: number) => {
    colorsRef.current = isDark ? COLORS_DARK : COLORS_LIGHT;
    const count = Math.floor((w * h) / 2200);
    particlesRef.current = Array.from({ length: count }, () => {
      const p = createParticle(Math.random() * w, Math.random() * h, false);
      p.life = Math.random() * p.maxLife;
      return p;
    });
  }, [isDark, createParticle]);

  useEffect(() => {
    colorsRef.current = isDark ? COLORS_DARK : COLORS_LIGHT;
  }, [isDark]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let cw = 0, ch = 0;
    const resize = () => {
      const rect = canvas.parentElement!.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      cw = rect.width; ch = rect.height;
      canvas.width = cw * dpr;
      canvas.height = ch * dpr;
      canvas.style.width = cw + 'px';
      canvas.style.height = ch + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (particlesRef.current.length === 0) initParticles(cw, ch);
    };
    resize();
    window.addEventListener('resize', resize);

    let vortexStrength = 0;
    let time = 0;
    let spawnAccum = 0;

    const drawShape = (x: number, y: number, size: number, shape: ParticleShape, color: string, alpha: number) => {
      const s = size;
      switch (shape) {
        case 'cross':
          ctx.fillRect(x - s / 2, y - 0.5, s, 1);
          ctx.fillRect(x - 0.5, y - s / 2, 1, s);
          break;
        case 'diamond':
          ctx.beginPath();
          ctx.moveTo(x, y - s); ctx.lineTo(x + s * 0.7, y);
          ctx.lineTo(x, y + s); ctx.lineTo(x - s * 0.7, y);
          ctx.closePath(); ctx.fill();
          break;
        case 'hollow':
          ctx.strokeStyle = color; ctx.lineWidth = 0.6; ctx.globalAlpha = alpha;
          ctx.strokeRect(x - s / 2, y - s / 2, s, s);
          break;
        case 'dash':
          ctx.fillRect(x - s, y - 0.4, s * 2, 0.8);
          break;
        default:
          ctx.fillRect(x - s / 2, y - s / 2, s, s);
      }
    };

    const animate = () => {
      const w = cw, h = ch;
      ctx.clearRect(0, 0, w, h);
      time += 0.008;



      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;
      const attractRadius = 180;

      // Smooth vortex ramp
      const targetVortex = turbineState.active ? 1 : 0;
      vortexStrength += (targetVortex - vortexStrength) * 0.04;
      const tcx = turbineState.cx;
      const tcy = turbineState.cy;
      const vortexRadius = 300;

      // Spawn trail particles from mouse path — consume immediately
      const queue = trailQueueRef.current;
      if (queue.length > 0 && particlesRef.current.length < MAX_PARTICLES) {
        const points = queue.splice(0);
        for (const pt of points) {
          if (particlesRef.current.length >= MAX_PARTICLES) break;
          // 1 particle per point, scattered wide so it reads as dust not a line
          const px = pt.x + (Math.random() - 0.5) * 30;
          const py = pt.y + (Math.random() - 0.5) * 30;
          particlesRef.current.push(createParticle(px, py, true));
        }
      }
      // Static hover: spawn dust around cursor
      const mouseActive = mx > -500 && my > -500;
      if (mouseActive) {
        spawnAccum += 1;
        if (spawnAccum >= 2 && particlesRef.current.length < MAX_PARTICLES) {
          spawnAccum = 0;
          for (let j = 0; j < 2; j++) {
            const px = mx + (Math.random() - 0.5) * 30;
            const py = my + (Math.random() - 0.5) * 30;
            particlesRef.current.push(createParticle(px, py, true));
          }
        }
      }

      // Spawn ambient replacements
      const ambientCount = particlesRef.current.filter(p => !p.isTrail).length;
      const targetAmbient = Math.floor((w * h) / 2500);
      if (ambientCount < targetAmbient && Math.random() < 0.15) {
        particlesRef.current.push(createParticle(Math.random() * w, Math.random() * h, false));
      }

      const particles = particlesRef.current;
      const alive: Particle[] = [];
      const nearby: Array<{ x: number; y: number; color: string; intensity: number }> = [];

      for (const p of particles) {
        p.life++;
        const lifeRatio = p.life / p.maxLife;
        if (lifeRatio >= 1) continue;
        alive.push(p);

        const fadeIn = Math.min(1, p.life / 20);
        const fadeOut = p.isTrail ? (1 - lifeRatio) : (lifeRatio > 0.8 ? (1 - lifeRatio) / 0.2 : 1);
        const lifeFade = fadeIn * fadeOut;

        p.x += p.vx;
        p.y += p.vy;

        if (!p.isTrail) {
          if (p.x < -10) p.x = w + 10;
          if (p.x > w + 10) p.x = -10;
          if (p.y < -10) p.y = h + 10;
          if (p.y > h + 10) p.y = -10;
        }

        // Mouse attraction — gentle pull, enough to notice drift toward cursor
        const dx = mx - p.x;
        const dy = my - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        let boost = 0;
        if (dist < attractRadius && dist > 5) {
          const proximity = (attractRadius - dist) / attractRadius;
          const force = proximity * 0.025;
          p.vx += (dx / dist) * force;
          p.vy += (dy / dist) * force;
          boost = proximity * 0.5;
        }

        // Turbine vortex
        if (vortexStrength > 0.01) {
          const tdx = p.x - tcx;
          const tdy = p.y - tcy;
          const tdist = Math.sqrt(tdx * tdx + tdy * tdy);
          if (tdist < vortexRadius && tdist > 15) {
            const pull = (1 - tdist / vortexRadius) * vortexStrength;
            const angle = Math.atan2(tdy, tdx);
            const spinSpeed = 0.7 * pull * (p.layer === 0 ? 0.4 : p.layer === 1 ? 0.9 : 1.4);
            p.vx += -Math.sin(angle) * spinSpeed * 0.5 - Math.cos(angle) * pull * 0.06;
            p.vy += Math.cos(angle) * spinSpeed * 0.5 - Math.sin(angle) * pull * 0.06;
            boost = Math.max(boost, pull * 0.7);
          }
        }

        p.vx *= 0.985;
        p.vy *= 0.985;

        const pulse = Math.sin(time * 2.5 + p.pulseOffset) * 0.1;
        const vortexGlow = vortexStrength * 0.15;
        p.alpha = Math.min(1, (p.baseAlpha + pulse + boost + vortexGlow) * lifeFade);

        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        drawShape(Math.round(p.x), Math.round(p.y), p.size * (p.isTrail ? lifeFade * 0.8 + 0.2 : 1), p.shape, p.color, p.alpha);

        if (boost > 0.08 || (vortexStrength > 0.3 && p.alpha > 0.2)) {
          nearby.push({ x: p.x, y: p.y, color: p.color, intensity: Math.max(boost, vortexStrength * 0.4) });
        }
      }

      particlesRef.current = alive;

      // Connection mesh
      if (nearby.length > 1) {
        const maxConn = 80;
        for (let i = 0; i < nearby.length; i++) {
          for (let j = i + 1; j < nearby.length; j++) {
            const a = nearby[i], b = nearby[j];
            const d = Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
            if (d < maxConn) {
              ctx.globalAlpha = Math.min(a.intensity, b.intensity) * (1 - d / maxConn) * 0.3;
              ctx.strokeStyle = a.color;
              ctx.lineWidth = 0.5;
              ctx.beginPath();
              ctx.moveTo(a.x, a.y);
              ctx.lineTo(b.x, b.y);
              ctx.stroke();
            }
          }
        }
      }

      ctx.globalAlpha = 1;
      rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(rafRef.current);
    };
  }, [initParticles, isDark, createParticle]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const nx = e.clientX - rect.left;
    const ny = e.clientY - rect.top;
    const prev = prevMouseRef.current;

    // Interpolate between previous and current position for smooth trails
    if (prev.x > -500 && prev.y > -500) {
      const dx = nx - prev.x;
      const dy = ny - prev.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const step = 8; // spawn a point every ~8px along the path
      if (dist > step) {
        const steps = Math.floor(dist / step);
        for (let i = 1; i <= steps; i++) {
          const t = i / steps;
          trailQueueRef.current.push({
            x: prev.x + dx * t,
            y: prev.y + dy * t,
          });
        }
      }
    }

    prevMouseRef.current = { x: nx, y: ny };
    mouseRef.current = { x: nx, y: ny };
  }, []);

  const handleMouseLeave = useCallback(() => {
    mouseRef.current = { x: -1000, y: -1000 };
    prevMouseRef.current = { x: -1000, y: -1000 };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    />
  );
};

// ============================================================================
// BRAND CONTENT — Logo + tagline overlay on top of CyberDust
// ============================================================================

const BrandContent: React.FC<{ variant: 'light' | 'dark' }> = ({ variant }) => {
  const isDark = variant === 'dark';
  const headingColor = isDark ? 'text-white' : 'text-gray-900';
  const descColor = isDark ? 'text-white/40' : 'text-gray-500';
  const subDescColor = isDark ? 'text-white/30' : 'text-gray-400';
  const dividerColor = isDark ? 'bg-white/10' : 'bg-gray-300';

  const logoGlow = isDark
    ? 'drop-shadow-[0_0_40px_rgba(120,50,100,0.25)]'
    : 'drop-shadow-[0_0_35px_rgba(120,50,100,0.15)]';

  return (
    <div className="relative z-10 flex flex-col items-center text-center max-w-xl mx-auto pointer-events-none">
      <div
        className="mb-8 group cursor-default pointer-events-auto"
        onMouseEnter={(e) => {
          const rect = e.currentTarget.closest('.relative')?.getBoundingClientRect();
          const logoRect = e.currentTarget.getBoundingClientRect();
          if (rect) {
            turbineState.active = true;
            turbineState.cx = logoRect.left + logoRect.width / 2 - rect.left;
            turbineState.cy = logoRect.top + logoRect.height / 2 - rect.top;
          }
        }}
        onMouseLeave={() => { turbineState.active = false; }}
      >
        <div className={`animate-spool-up group-hover:animate-spin-fast ${logoGlow}`} style={brandLogoStyle}>
          <Icon name="optimus-logo" className="w-36 h-36 xl:w-44 xl:h-44" />
        </div>
      </div>

      <h1 className={`text-6xl xl:text-7xl font-brand font-bold tracking-tight leading-[1] mb-3 ${headingColor}`}>OPTIMUS</h1>
      <p className="text-base font-semibold tracking-[0.3em] uppercase mb-12" style={{ color: ACCENT }}>Detection Studio</p>

      <div className={`w-12 h-px mb-10 ${dividerColor}`} />

      <h2 className={`text-3xl xl:text-4xl font-bold leading-tight mb-5 ${headingColor}`}>
        Detection Engineering,{' '}
        <span style={{ color: ACCENT }}>reimagined.</span>
      </h2>

      <p className={`text-base leading-relaxed mb-5 max-w-lg ${descColor}`}>
        The AI-powered, vendor-agnostic detection engineering suite. Build, validate, and operationalize detection content across 12 query languages and 14 SIEM platforms.
      </p>

      <p className={`text-sm leading-relaxed max-w-md ${subDescColor}`}>
        Detection engineering at speed — from threat reports to operational detections in minutes, not hours.
      </p>
    </div>
  );
};

// ============================================================================
// LABELED INPUT — Styled form input with focus states
// ============================================================================

const LabeledInput: React.FC<{
  id: string; type: string; label: string; placeholder: string;
  value: string; onChange: (v: string) => void;
  focusedField: string | null; setFocusedField: (v: string | null) => void;
  showPassword?: boolean; setShowPassword?: (v: boolean) => void; isPassword?: boolean;
  variant?: 'light' | 'dark';
}> = ({ id, type, label, placeholder, value, onChange, focusedField, setFocusedField, showPassword, setShowPassword, isPassword, variant = 'light' }) => {
  const isDark = variant === 'dark';
  const labelClass = isDark ? 'text-white/40' : 'text-on-surface-variant/50';
  const inputBase = isDark
    ? 'bg-white/5 text-white placeholder-white/25'
    : 'bg-surface-container-highest/50 text-on-surface placeholder-on-surface-variant/30';
  const inputFocus = isDark
    ? 'border-[#783264]/50 bg-white/8 shadow-[0_0_0_3px_rgba(120,50,100,0.1)]'
    : 'border-[#783264]/40 bg-surface-container shadow-[0_0_0_3px_rgba(120,50,100,0.06)]';
  const inputIdle = isDark
    ? 'border-white/10 hover:border-white/20'
    : 'border-outline-variant/15 hover:border-outline-variant/30';
  const eyeClass = isDark ? 'text-white/20 hover:text-white/40' : 'text-on-surface-variant/25 hover:text-on-surface-variant/50';

  return (
    <div className="space-y-1.5">
      <label className={`text-xs font-medium ${labelClass}`}>{label}</label>
      <div className="relative">
        <input
          type={isPassword && showPassword ? 'text' : type}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocusedField(id)}
          onBlur={() => setFocusedField(null)}
          className={`w-full rounded-xl px-4 py-3 text-sm ${inputBase} outline-none transition-all duration-300 border ${
            focusedField === id ? inputFocus : inputIdle
          }`}
          required
        />
        {isPassword && setShowPassword && (
          <button type="button" onClick={() => setShowPassword(!showPassword)} className={`absolute right-3 top-1/2 -translate-y-1/2 transition-colors ${eyeClass}`}>
            <Icon name={showPassword ? 'eye-off' : 'eye'} className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// AUTH PAGE — Split-panel login with real Supabase auth
// ============================================================================

export const AuthPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const { showToast } = useToast();
  const { theme, setTheme } = useTheme();

  const isDark = theme === 'dark';
  const v = isDark ? 'dark' : 'light';

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  // ── Auth handlers (identical to original) ──

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      // Log audit event at the actual point of login, not in onAuthStateChange
      // (which fires on every page refresh/token refresh too)
      if (data.session) {
        logAuditEvent({ action: 'user.login', entity_type: 'user', entity_id: data.session.user.id });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'An unexpected error occurred';
      showToast('error', 'Login Failed', message);
    } finally {
      setLoading(false);
    }
  };

  // ── Styling tokens ──

  const headingColor = isDark ? 'text-white' : 'text-on-surface';
  const subtextColor = isDark ? 'text-white/40' : 'text-on-surface-variant/50';
  const footerColor = isDark ? 'text-white/15' : 'text-on-surface-variant/20';
  const formBg = isDark ? 'bg-[#0a0a0a]' : 'bg-background';
  const cardBg = isDark ? 'bg-white/[0.03]' : 'bg-surface-container-low';
  const cardBorder = isDark ? 'border-white/10' : 'border-outline-variant/20';
  const btnShadow = `0 8px 20px -5px ${ACCENT}50`;

  return (
    <div className={`min-h-screen relative grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] transition-colors duration-500 ${isDark ? 'bg-[#0a0a0a]' : 'bg-background'}`}>

      {/* Theme toggle — absolute top-right */}
      <button
        onClick={toggleTheme}
        className="absolute top-5 right-5 z-50 p-2.5 rounded-full bg-surface-container-high/50 backdrop-blur-md border border-outline-variant/30 text-on-surface hover:bg-surface-container-highest transition-all shadow-lg"
        aria-label="Toggle theme"
      >
        <Icon name={theme === 'dark' ? 'sun' : 'moon'} className="w-5 h-5" />
      </button>

      {/* ── Brand Panel (hidden on mobile) ── */}
      <div
        className="hidden lg:flex flex-col items-center justify-center p-12 xl:p-16 m-6 rounded-3xl border-2 border-outline-variant/15 relative overflow-hidden transition-colors duration-500"
        style={{ backgroundColor: isDark ? '#141414' : '#f5f3f0' }}
      >
        <CyberDust variant={v} />
        <BrandContent variant={v} />
      </div>

      {/* ── Form Panel ── */}
      <div className={`flex flex-col p-8 lg:p-10 ${formBg}`}>


        {/* Mobile logo */}
        <div className="lg:hidden flex items-center gap-2.5 mb-8 relative z-10">
          <div style={brandLogoStyle}>
            <Icon name="optimus-logo" className="w-7 h-7" />
          </div>
          <span className={`font-brand font-bold text-xs tracking-widest ${headingColor}`}>OPTIMUS</span>
        </div>

        {/* Form content — vertically centered */}
        <div className="flex-1 flex flex-col justify-center relative z-10">
          <div className={`w-full max-w-md mx-auto rounded-2xl border ${cardBorder} ${cardBg} p-10 shadow-sm relative overflow-hidden`}>
            {/* Decorative accent line at top of card */}
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[#783264] via-[#005091] to-[#783264]" />
            <form onSubmit={handleSubmit} className="pt-2">

              {/* ── LOGIN (only view in beta mode) ── */}
              <div className="text-center mb-8">
                <h2 className={`text-2xl font-bold mb-1.5 ${headingColor}`}>Welcome Back</h2>
                <p className={`text-sm ${subtextColor}`}>Sign in to access Detection Studio</p>
              </div>

              <div className="space-y-5">
                <LabeledInput id="login-email" type="email" label="Email" placeholder="Email address" value={email} onChange={setEmail} focusedField={focusedField} setFocusedField={setFocusedField} variant={v} />
                <LabeledInput id="login-pass" type="password" label="Password" placeholder="Password" value={password} onChange={setPassword} focusedField={focusedField} setFocusedField={setFocusedField} isPassword showPassword={showPassword} setShowPassword={setShowPassword} variant={v} />
              </div>

              <div className="mt-3 mb-6" />

              <button type="submit" disabled={loading} className="w-full py-3.5 rounded-xl text-white text-sm font-brand font-bold transition-all duration-200 hover:brightness-110 active:scale-[0.98] disabled:opacity-50 disabled:cursor-wait flex items-center justify-center gap-2.5 relative overflow-hidden group/btn" style={{ backgroundColor: ACCENT, boxShadow: btnShadow }}>
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-100%] group-hover/btn:translate-x-[100%] transition-transform duration-700 ease-in-out" />
                {loading ? <Icon name="spinner" className="w-5 h-5 animate-spin" /> : (
                  <>
                    <span>ENTER STUDIO</span>
                    <Icon name="arrowRight" className="w-4 h-4 group-hover/btn:translate-x-0.5 transition-transform" />
                  </>
                )}
              </button>

              <div className="text-center mt-6">
                <p className={`text-xs ${subtextColor}`}>Beta access is invite-only. Contact your admin for access.</p>
              </div>

            </form>
          </div>

        </div>

        {/* Footer */}
        <div className={`text-[10px] mt-4 relative z-10 ${footerColor}`}>
          <span>&copy; 2026 Optimus Detection Studio</span>
        </div>
      </div>
    </div>
  );
};
