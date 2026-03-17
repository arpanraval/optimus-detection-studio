import React, { useState, useRef, useEffect, useCallback } from 'react';
import { DesignSystemPage, Section } from '../shared';
import { Icon } from '../../Icon';
import { useTheme } from '../../../context/ThemeContext';

// ============================================================================
// SHARED
// ============================================================================

type AuthView = 'login' | 'signup' | 'forgot';
const ACCENT = '#783264';
const BLUE = '#005091';

const useAuthMockup = () => {
  const [view, setView] = useState<AuthView>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); setLoading(true); setTimeout(() => setLoading(false), 1800); };
  return { view, setView, email, setEmail, password, setPassword, confirmPassword, setConfirmPassword, name, setName, loading, handleSubmit, showPassword, setShowPassword, focusedField, setFocusedField };
};

// Social login buttons
const SocialButtons: React.FC<{ variant?: 'light' | 'dark' }> = ({ variant = 'light' }) => {
  const base = variant === 'dark'
    ? 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10 hover:border-white/20'
    : 'bg-transparent border-outline-variant/20 text-on-surface/70 hover:bg-surface-container-high hover:border-outline-variant/35';
  return (
    <div className="flex gap-3">
      <button type="button" className={`flex items-center justify-center gap-2.5 px-5 py-3 rounded-xl text-sm font-medium transition-all duration-200 flex-1 border ${base}`}>
        <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
        Google
      </button>
      <button type="button" className={`flex items-center justify-center gap-2.5 px-5 py-3 rounded-xl text-sm font-medium transition-all duration-200 flex-1 border ${base}`}>
        <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
        GitHub
      </button>
    </div>
  );
};

// Or divider
const OrDivider: React.FC<{ variant?: 'light' | 'dark' }> = ({ variant = 'light' }) => {
  const lineColor = variant === 'dark' ? 'border-white/10' : 'border-outline-variant/10';
  const textColor = variant === 'dark' ? 'text-white/20 bg-[#0d1117]' : 'text-on-surface-variant/25 bg-background';
  return (
    <div className="relative my-6">
      <div className="absolute inset-0 flex items-center"><div className={`w-full border-t ${lineColor}`} /></div>
      <div className="relative flex justify-center"><span className={`px-3 text-[10px] ${textColor}`}>or</span></div>
    </div>
  );
};

// Labeled input
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

// Decorative animated circles SVG
// Shared ref for turbine vortex state — set by BrandContent, read by CyberDust
const turbineState = { active: false, cx: 0, cy: 0 };

// Particle shape types for visual variety
type ParticleShape = 'pixel' | 'cross' | 'diamond' | 'hollow' | 'dash';

interface Particle {
  x: number; y: number; vx: number; vy: number;
  size: number; baseAlpha: number; alpha: number;
  color: string; pulseOffset: number; shape: ParticleShape;
  layer: number; life: number; maxLife: number; isTrail: boolean;
}

// Cyber pixel dust — interactive canvas particles with attraction, trails, turbine vortex
const CyberDust: React.FC<{ variant?: 'light' | 'dark' }> = ({ variant = 'light' }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: -1000, y: -1000 });
  const particlesRef = useRef<Particle[]>([]);
  const rafRef = useRef<number>(0);
  const isDark = variant === 'dark';
  const colorsRef = useRef<string[]>([]);

  const COLORS_DARK = ['#783264', '#783264', '#005091', '#005091', '#4D7C6F', '#ffffff', '#a855f7'];
  const COLORS_LIGHT = ['#783264', '#783264', '#005091', '#005091', '#4D7C6F', '#2d1b4e', '#0e4a6f'];
  const SHAPES: ParticleShape[] = ['pixel', 'pixel', 'pixel', 'cross', 'diamond', 'hollow', 'dash'];
  const MAX_PARTICLES = 300;

  const pickColor = () => colorsRef.current[Math.floor(Math.random() * colorsRef.current.length)];
  const pickShape = () => SHAPES[Math.floor(Math.random() * SHAPES.length)];

  const createParticle = useCallback((x: number, y: number, isTrail: boolean): Particle => {
    const layer = isTrail ? 2 : (Math.random() < 0.3 ? 0 : Math.random() < 0.6 ? 1 : 2);
    const angle = Math.random() * Math.PI * 2;
    const speed = isTrail ? (Math.random() * 0.8 + 0.3) : (Math.random() * 0.2 + 0.05);
    return {
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: isTrail ? (Math.random() * 2 + 1) : ([1, 1.5, 2.5][layer] + Math.random() * 0.5),
      baseAlpha: isTrail ? (Math.random() * 0.4 + 0.4) : ([0.12, 0.22, 0.35][layer] + Math.random() * 0.1),
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
    const count = Math.floor((w * h) / 3500);
    particlesRef.current = Array.from({ length: count }, () => {
      const p = createParticle(Math.random() * w, Math.random() * h, false);
      p.life = Math.random() * p.maxLife; // stagger start so they don't all die together
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

      // Subtle grid
      ctx.strokeStyle = isDark ? '#ffffff' : '#000000';
      ctx.lineWidth = 0.5;
      ctx.globalAlpha = isDark ? 0.025 : 0.02;
      const gridSize = 50;
      for (let gx = gridSize; gx < w; gx += gridSize) {
        ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, h); ctx.stroke();
      }
      for (let gy = gridSize; gy < h; gy += gridSize) {
        ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(w, gy); ctx.stroke();
      }

      // Grid intersection dots
      ctx.globalAlpha = isDark ? 0.06 : 0.04;
      ctx.fillStyle = isDark ? '#ffffff' : '#000000';
      for (let gx = gridSize; gx < w; gx += gridSize) {
        for (let gy = gridSize; gy < h; gy += gridSize) {
          ctx.fillRect(gx - 0.5, gy - 0.5, 1, 1);
        }
      }
      ctx.globalAlpha = 1;

      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;
      const attractRadius = 180;

      // Smooth vortex ramp
      const targetVortex = turbineState.active ? 1 : 0;
      vortexStrength += (targetVortex - vortexStrength) * 0.04;
      const tcx = turbineState.cx;
      const tcy = turbineState.cy;
      const vortexRadius = 300;

      // Spawn trail particles near cursor
      const mouseActive = mx > -500 && my > -500;
      if (mouseActive) {
        spawnAccum += 1;
        if (spawnAccum >= 2 && particlesRef.current.length < MAX_PARTICLES) {
          spawnAccum = 0;
          for (let i = 0; i < 2; i++) {
            const px = mx + (Math.random() - 0.5) * 30;
            const py = my + (Math.random() - 0.5) * 30;
            particlesRef.current.push(createParticle(px, py, true));
          }
        }
      }

      // Spawn ambient replacements to keep density
      const ambientCount = particlesRef.current.filter(p => !p.isTrail).length;
      const targetAmbient = Math.floor((w * h) / 4000);
      if (ambientCount < targetAmbient && Math.random() < 0.08) {
        particlesRef.current.push(createParticle(Math.random() * w, Math.random() * h, false));
      }

      const particles = particlesRef.current;
      const alive: Particle[] = [];
      const nearby: Array<{ x: number; y: number; color: string; intensity: number }> = [];

      for (const p of particles) {
        // Age + lifecycle
        p.life++;
        const lifeRatio = p.life / p.maxLife;
        if (lifeRatio >= 1) continue; // dead
        alive.push(p);

        // Fade in/out envelope
        const fadeIn = Math.min(1, p.life / 20);
        const fadeOut = p.isTrail ? (1 - lifeRatio) : (lifeRatio > 0.8 ? (1 - lifeRatio) / 0.2 : 1);
        const lifeFade = fadeIn * fadeOut;

        // Movement
        p.x += p.vx;
        p.y += p.vy;

        // Wrap (ambient) or let trails drift off
        if (!p.isTrail) {
          if (p.x < -10) p.x = w + 10;
          if (p.x > w + 10) p.x = -10;
          if (p.y < -10) p.y = h + 10;
          if (p.y > h + 10) p.y = -10;
        }

        // Mouse attraction — particles pulled toward cursor
        const dx = mx - p.x;
        const dy = my - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        let boost = 0;
        if (dist < attractRadius && dist > 5) {
          const force = ((attractRadius - dist) / attractRadius) * 0.02;
          p.vx += (dx / dist) * force;
          p.vy += (dy / dist) * force;
          boost = (1 - dist / attractRadius) * 0.5;
        }

        // Turbine vortex — spiral around logo center
        if (vortexStrength > 0.01) {
          const tdx = p.x - tcx;
          const tdy = p.y - tcy;
          const tdist = Math.sqrt(tdx * tdx + tdy * tdy);
          if (tdist < vortexRadius && tdist > 15) {
            const pull = (1 - tdist / vortexRadius) * vortexStrength;
            const angle = Math.atan2(tdy, tdx);
            const spinSpeed = 0.7 * pull * (p.layer === 0 ? 0.4 : p.layer === 1 ? 0.9 : 1.4);
            // Tangential spin + inward attraction
            p.vx += -Math.sin(angle) * spinSpeed * 0.5 - Math.cos(angle) * pull * 0.06;
            p.vy += Math.cos(angle) * spinSpeed * 0.5 - Math.sin(angle) * pull * 0.06;
            boost = Math.max(boost, pull * 0.7);
          }
        }

        // Damping
        p.vx *= 0.985;
        p.vy *= 0.985;

        // Pulse
        const pulse = Math.sin(time * 2.5 + p.pulseOffset) * 0.1;
        const vortexGlow = vortexStrength * 0.15;
        p.alpha = Math.min(1, (p.baseAlpha + pulse + boost + vortexGlow) * lifeFade);

        // Draw
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        drawShape(Math.round(p.x), Math.round(p.y), p.size * (p.isTrail ? lifeFade * 0.8 + 0.2 : 1), p.shape, p.color, p.alpha);

        if (boost > 0.08 || (vortexStrength > 0.3 && p.alpha > 0.2)) {
          nearby.push({ x: p.x, y: p.y, color: p.color, intensity: Math.max(boost, vortexStrength * 0.4) });
        }
      }

      particlesRef.current = alive;

      // Connection mesh — between nearby active particles
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
    if (rect) {
      mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }
  }, []);

  const handleMouseLeave = useCallback(() => {
    mouseRef.current = { x: -1000, y: -1000 };
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
// FORM PANEL — Right side (shared by all variations)
// ============================================================================

const FormPanel: React.FC<{ m: ReturnType<typeof useAuthMockup>; prefix: string; variant?: 'light' | 'dark' }> = ({ m, prefix, variant = 'light' }) => {
  const isDark = variant === 'dark';
  const bg = isDark ? 'bg-[#0d1117]' : 'bg-background';
  const headingColor = isDark ? 'text-white' : 'text-on-surface';
  const subtextColor = isDark ? 'text-white/40' : 'text-on-surface-variant/50';
  const footerColor = isDark ? 'text-white/15' : 'text-on-surface-variant/20';
  const btnShadow = `0 8px 20px -5px ${ACCENT}50`;

  return (
    <div className={`flex flex-col p-8 lg:p-10 ${bg}`}>
      {/* Mobile logo */}
      <div className="lg:hidden flex items-center gap-2.5 mb-8">
        <Icon name="optimus-logo" className="w-7 h-7" />
        <span className={`font-brand font-bold text-xs tracking-widest ${headingColor}`}>OPTIMUS</span>
      </div>

      <div className="flex-1 flex flex-col justify-center">
        <div className="w-full max-w-xs mx-auto">
          <form onSubmit={m.handleSubmit}>
            {/* ── LOGIN ── */}
            {m.view === 'login' && (
              <>
                <div className="text-center mb-6">
                  <h2 className={`text-2xl font-bold mb-1 ${headingColor}`}>Welcome Back</h2>
                  <p className={`text-sm ${subtextColor}`}>Sign in to access Detection Studio</p>
                </div>

                <div className="space-y-4">
                  <LabeledInput id={`${prefix}-email`} type="email" label="Email" placeholder="Email address" value={m.email} onChange={m.setEmail} focusedField={m.focusedField} setFocusedField={m.setFocusedField} variant={variant} />
                  <LabeledInput id={`${prefix}-pass`} type="password" label="Password" placeholder="Password" value={m.password} onChange={m.setPassword} focusedField={m.focusedField} setFocusedField={m.setFocusedField} isPassword showPassword={m.showPassword} setShowPassword={m.setShowPassword} variant={variant} />
                </div>

                <div className="flex justify-end mt-3 mb-5">
                  <button type="button" onClick={() => m.setView('forgot')} className="text-xs font-semibold hover:underline transition-colors" style={{ color: ACCENT }}>Forgot Password?</button>
                </div>

                <button type="submit" disabled={m.loading} className="w-full py-3.5 rounded-xl text-white text-sm font-brand font-bold transition-all duration-200 hover:brightness-110 active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2.5 relative overflow-hidden group/btn" style={{ backgroundColor: ACCENT, boxShadow: btnShadow }}>
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-100%] group-hover/btn:translate-x-[100%] transition-transform duration-700 ease-in-out" />
                  {m.loading ? <Icon name="spinner" className="w-5 h-5 animate-spin" /> : (
                    <>
                      <span>ENTER STUDIO</span>
                      <Icon name="arrowRight" className="w-4 h-4 group-hover/btn:translate-x-0.5 transition-transform" />
                    </>
                  )}
                </button>

                <div className="text-center mt-6">
                  <span className={`text-sm ${subtextColor}`}>Don't have an account? </span>
                  <button type="button" onClick={() => m.setView('signup')} className="text-sm font-bold hover:underline transition-colors" style={{ color: ACCENT }}>Sign Up</button>
                </div>
              </>
            )}

            {/* ── SIGN UP ── */}
            {m.view === 'signup' && (
              <>
                <div className="text-center mb-6">
                  <h2 className={`text-2xl font-bold mb-1 ${headingColor}`}>Create Account</h2>
                  <p className={`text-sm ${subtextColor}`}>Join the Detection Engineering platform</p>
                </div>

                <div className="space-y-3.5">
                  <LabeledInput id={`${prefix}-name`} type="text" label="Full Name" placeholder="Full Name" value={m.name} onChange={m.setName} focusedField={m.focusedField} setFocusedField={m.setFocusedField} variant={variant} />
                  <LabeledInput id={`${prefix}-semail`} type="email" label="Email" placeholder="Email address" value={m.email} onChange={m.setEmail} focusedField={m.focusedField} setFocusedField={m.setFocusedField} variant={variant} />
                  <LabeledInput id={`${prefix}-spass`} type="password" label="Password" placeholder="Password" value={m.password} onChange={m.setPassword} focusedField={m.focusedField} setFocusedField={m.setFocusedField} isPassword showPassword={m.showPassword} setShowPassword={m.setShowPassword} variant={variant} />
                  <LabeledInput id={`${prefix}-cpass`} type="password" label="Confirm Password" placeholder="Confirm Password" value={m.confirmPassword} onChange={m.setConfirmPassword} focusedField={m.focusedField} setFocusedField={m.setFocusedField} variant={variant} />
                </div>

                <button type="submit" disabled={m.loading} className="w-full py-3.5 rounded-xl text-white text-sm font-brand font-bold transition-all duration-200 hover:brightness-110 active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2.5 mt-6 relative overflow-hidden group/btn" style={{ backgroundColor: ACCENT, boxShadow: btnShadow }}>
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-100%] group-hover/btn:translate-x-[100%] transition-transform duration-700 ease-in-out" />
                  {m.loading ? <Icon name="spinner" className="w-5 h-5 animate-spin" /> : (
                    <>
                      <span>CREATE ACCOUNT</span>
                      <Icon name="plus" className="w-4 h-4" />
                    </>
                  )}
                </button>

                <div className="text-center mt-6">
                  <span className={`text-sm ${subtextColor}`}>Already have an account? </span>
                  <button type="button" onClick={() => m.setView('login')} className="text-sm font-bold hover:underline transition-colors" style={{ color: ACCENT }}>Log In</button>
                </div>
              </>
            )}

            {/* ── FORGOT PASSWORD ── */}
            {m.view === 'forgot' && (
              <>
                <div className="text-center mb-6">
                  <h2 className={`text-2xl font-bold mb-1 ${headingColor}`}>Reset Password</h2>
                  <p className={`text-sm ${subtextColor}`}>Enter your email to receive reset instructions</p>
                </div>

                <div className="mb-4">
                  <LabeledInput id={`${prefix}-femail`} type="email" label="Email" placeholder="Email address" value={m.email} onChange={m.setEmail} focusedField={m.focusedField} setFocusedField={m.setFocusedField} variant={variant} />
                </div>

                <button type="submit" disabled={m.loading} className="w-full py-3.5 rounded-xl text-white text-sm font-brand font-bold transition-all duration-200 hover:brightness-110 active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2.5 relative overflow-hidden group/btn" style={{ backgroundColor: ACCENT, boxShadow: btnShadow }}>
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-100%] group-hover/btn:translate-x-[100%] transition-transform duration-700 ease-in-out" />
                  {m.loading ? <Icon name="spinner" className="w-5 h-5 animate-spin" /> : (
                    <>
                      <span>SEND RESET LINK</span>
                      <Icon name="send" className="w-4 h-4" />
                    </>
                  )}
                </button>

                <button type="button" onClick={() => m.setView('login')} className={`w-full py-4 text-sm font-bold ${subtextColor} hover:${headingColor} transition-colors flex items-center justify-center gap-2`}>
                  <Icon name="arrowLeft" className="w-4 h-4" />
                  Back to Login
                </button>
              </>
            )}
          </form>
        </div>
      </div>

      <div className={`text-[10px] mt-4 ${footerColor}`}>
        <span>&copy; 2026 Optimus Detection Studio</span>
      </div>
    </div>
  );
};

// ============================================================================
// BRAND PANEL CONTENT — Shared across variations
// ============================================================================

// Brand logo style — primary controls blades, tertiary controls outer ring + center
// Swap: magenta blades, blue outer ring (matching the intended brand look)
const brandLogoStyle = {
  '--md-sys-color-primary': '120 50 100',
  '--md-sys-color-tertiary': '0 80 145',
} as React.CSSProperties;

const BrandContent: React.FC<{ variant: 'light' | 'dark' }> = ({ variant }) => {
  const isDark = variant === 'dark';
  const headingColor = isDark ? 'text-white' : 'text-gray-900';
  const descColor = isDark ? 'text-white/40' : 'text-gray-500';
  const subDescColor = isDark ? 'text-white/30' : 'text-gray-400';
  const dividerColor = isDark ? 'bg-white/10' : 'bg-gray-300';

  // Soft glow behind logo to lift it visually
  const logoGlow = isDark
    ? 'drop-shadow-[0_0_40px_rgba(120,50,100,0.25)]'
    : 'drop-shadow-[0_0_35px_rgba(120,50,100,0.15)]';

  return (
    <div className="relative z-10 flex flex-col items-center text-center max-w-lg mx-auto">
      {/* Logo with ambient glow — hover triggers turbine vortex on particles */}
      <div
        className="mb-5 group cursor-default"
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
          <Icon name="optimus-logo" className="w-28 h-28 xl:w-32 xl:h-32" />
        </div>
      </div>

      <h1 className={`text-4xl xl:text-5xl font-brand font-bold tracking-tight leading-[1] mb-2 ${headingColor}`}>OPTIMUS</h1>
      <p className="text-sm font-semibold tracking-[0.25em] uppercase mb-10" style={{ color: ACCENT }}>Detection Studio</p>

      <div className={`w-10 h-px mb-8 ${dividerColor}`} />

      <h2 className={`text-2xl xl:text-3xl font-bold leading-tight mb-4 ${headingColor}`}>
        Detection Engineering,{' '}
        <span style={{ color: ACCENT }}>reimagined.</span>
      </h2>

      <p className={`text-sm leading-relaxed mb-4 max-w-md ${descColor}`}>
        The AI-powered, vendor-agnostic detection engineering suite. Build, validate, and operationalize detection content across 12 query languages and 14 SIEM platforms.
      </p>

      <p className={`text-xs leading-relaxed max-w-sm ${subDescColor}`}>
        Detection engineering at speed — from threat reports to operational detections in minutes, not hours.
      </p>
    </div>
  );
};

// ============================================================================
// VARIATION A: THEME-AWARE
// Responds to theme toggle — warm beige in light, dark in dark
// ============================================================================

const VariationA: React.FC = () => {
  const m = useAuthMockup();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const v = isDark ? 'dark' : 'light';
  return (
    <div className={`min-h-[750px] grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] rounded-2xl overflow-hidden border border-outline-variant/10 transition-colors duration-500 ${isDark ? 'bg-[#0d1117]' : 'bg-background'}`}>
      <div
        className="hidden lg:flex flex-col items-center justify-center p-12 xl:p-16 m-3 rounded-2xl relative overflow-hidden transition-colors duration-500"
        style={{ backgroundColor: isDark ? '#161b22' : '#f5f3f0' }}
      >
        <CyberDust variant={v} />
        <BrandContent variant={v} />
      </div>
      <FormPanel m={m} prefix="a" variant={v} />
    </div>
  );
};

// ============================================================================
// VARIATION B: DARK PANEL
// Deep dark brand panel, light form
// ============================================================================

const VariationB: React.FC = () => {
  const m = useAuthMockup();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  return (
    <div className="min-h-[750px] grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] rounded-2xl overflow-hidden bg-background border border-outline-variant/10 transition-colors duration-500">
      <div className="hidden lg:flex flex-col items-center justify-center p-12 xl:p-16 m-3 rounded-2xl relative overflow-hidden bg-[#0d1117]">
        <CyberDust variant="dark" />
        <BrandContent variant="dark" />
      </div>
      <FormPanel m={m} prefix="b" variant={isDark ? 'dark' : 'light'} />
    </div>
  );
};

// ============================================================================
// VARIATION C: GRADIENT ACCENT
// Dark gradient left panel with ambient glow, both panels dark
// ============================================================================

const VariationC: React.FC = () => {
  const m = useAuthMockup();
  return (
    <div className="min-h-[750px] grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] rounded-2xl overflow-hidden bg-background border border-outline-variant/10">
      <div className="hidden lg:flex flex-col items-center justify-center p-12 xl:p-16 m-3 rounded-2xl relative overflow-hidden" style={{ background: 'linear-gradient(160deg, #2a1520 0%, #0d1117 50%, #0a1628 100%)' }}>
        <CyberDust variant="dark" />
        <div className="absolute top-[30%] left-[20%] w-[400px] h-[400px] rounded-full blur-[120px] opacity-[0.06]" style={{ backgroundColor: ACCENT }} />
        <div className="absolute bottom-[20%] right-[15%] w-[250px] h-[250px] rounded-full blur-[100px] opacity-[0.04]" style={{ backgroundColor: BLUE }} />
        <BrandContent variant="dark" />
      </div>
      <FormPanel m={m} prefix="c" variant="dark" />
    </div>
  );
};

// ============================================================================
// VARIATION D: WARM LIGHT + DARK FORM
// Warm beige left, dark form for contrast
// ============================================================================

const VariationD: React.FC = () => {
  const m = useAuthMockup();
  return (
    <div className="min-h-[750px] grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] rounded-2xl overflow-hidden bg-[#0d1117] border border-outline-variant/10">
      <div className="hidden lg:flex flex-col items-center justify-center p-12 xl:p-16 m-3 rounded-2xl relative overflow-hidden" style={{ backgroundColor: '#f5f3f0' }}>
        <CyberDust variant="light" />
        <BrandContent variant="light" />
      </div>
      <FormPanel m={m} prefix="d" variant="dark" />
    </div>
  );
};

// ============================================================================
// VARIATION E: FULL DARK
// Dark panel, dark form — fully immersive dark mode
// ============================================================================

const VariationE: React.FC = () => {
  const m = useAuthMockup();
  return (
    <div className="min-h-[750px] grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] rounded-2xl overflow-hidden bg-[#0d1117] border border-outline-variant/10">
      <div className="hidden lg:flex flex-col items-center justify-center p-12 xl:p-16 m-3 rounded-2xl relative overflow-hidden bg-[#0d1117]">
        <CyberDust variant="dark" />
        <div className="absolute top-[25%] left-[30%] w-[350px] h-[350px] rounded-full blur-[120px] opacity-[0.05]" style={{ backgroundColor: ACCENT }} />
        <BrandContent variant="dark" />
      </div>
      <FormPanel m={m} prefix="e" variant="dark" />
    </div>
  );
};

// ============================================================================
// FULLSCREEN OVERLAY
// ============================================================================

// Theme toggle button used in fullscreen preview and showcase header
const ThemeToggle: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { theme, setTheme } = useTheme();
  return (
    <button
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      className={`p-2 rounded-lg bg-surface-container-high/80 backdrop-blur-sm border border-outline-variant/20 text-on-surface hover:bg-surface-container-highest transition-all hover:rotate-12 ${className}`}
      aria-label="Toggle theme"
    >
      <Icon name={theme === 'dark' ? 'sun' : 'moon'} className="w-5 h-5" />
    </button>
  );
};

const FullscreenPreview: React.FC<{ children: React.ReactNode; onClose: () => void; label: string }> = ({ children, onClose, label }) => (
  <div className="fixed inset-0 z-[9999] bg-background">
    <div className="absolute top-4 right-4 z-10 flex items-center gap-3">
      <span className="text-xs text-on-surface-variant/50 font-medium bg-surface-container/80 backdrop-blur-sm px-3 py-1.5 rounded-lg">{label}</span>
      <ThemeToggle />
      <button onClick={onClose} className="p-2 rounded-lg bg-surface-container-high/80 backdrop-blur-sm border border-outline-variant/20 text-on-surface hover:bg-surface-container-highest transition-colors">
        <Icon name="x" className="w-5 h-5" />
      </button>
    </div>
    <div className="h-full overflow-auto">{children}</div>
  </div>
);

// ============================================================================
// SHOWCASE PAGE
// ============================================================================

const designs = [
  { id: 'a', label: 'Variation A — Warm Light', description: 'Warm beige brand panel with centered logo and copy. Light form on the right.', component: VariationA },
  { id: 'b', label: 'Variation B — Dark Brand', description: 'Dark brand panel with centered logo. Light form on the right for contrast.', component: VariationB },
  { id: 'c', label: 'Variation C — Gradient Accent', description: 'Dark gradient panel with subtle magenta-to-blue ambient glow. Both sides dark.', component: VariationC },
  { id: 'd', label: 'Variation D — Warm + Dark Form', description: 'Warm beige brand panel paired with a dark form panel for a split contrast look.', component: VariationD },
  { id: 'e', label: 'Variation E — Full Dark', description: 'Fully dark — dark brand panel with subtle accent glow, dark form. Maximum immersion.', component: VariationE },
];

export const LoginShowcasePage: React.FC = () => {
  const [fullscreen, setFullscreen] = useState<string | null>(null);
  const fullscreenDesign = designs.find(d => d.id === fullscreen);

  return (
    <>
      {fullscreenDesign && (
        <FullscreenPreview label={fullscreenDesign.label} onClose={() => setFullscreen(null)}>
          <fullscreenDesign.component />
        </FullscreenPreview>
      )}

      <DesignSystemPage
        title="Login Page Redesign"
        description="5 variations around the clean split layout. Each pairs a 60% brand panel (left) with a 40% form panel (right). Click 'Full Screen' to preview at actual size."
      >
        <div className="flex items-center gap-3 mb-2 -mt-2">
          <ThemeToggle />
          <span className="text-xs text-on-surface-variant/50">Toggle theme to preview designs in light and dark mode</span>
        </div>
        {designs.map((design) => (
          <Section key={design.id} title={design.label} description={design.description}>
            <div className="relative rounded-xl border border-outline-variant/15 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 bg-surface-container border-b border-outline-variant/10">
                <div className="flex items-center gap-2">
                  <div className="flex gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-400/60" />
                    <div className="w-2.5 h-2.5 rounded-full bg-yellow-400/60" />
                    <div className="w-2.5 h-2.5 rounded-full bg-green-400/60" />
                  </div>
                  <span className="text-[10px] text-on-surface-variant/30 font-mono ml-2">optimus.app/auth</span>
                </div>
                <button
                  onClick={() => setFullscreen(design.id)}
                  className="flex items-center gap-1.5 text-xs text-on-surface-variant/50 hover:text-primary transition-colors px-2.5 py-1 rounded-md hover:bg-primary/5"
                >
                  <Icon name="external-link" className="w-3.5 h-3.5" />
                  Full Screen
                </button>
              </div>
              <div className="overflow-hidden" style={{ maxHeight: '650px' }}>
                <design.component />
              </div>
            </div>
          </Section>
        ))}
      </DesignSystemPage>
    </>
  );
};
