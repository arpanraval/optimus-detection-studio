import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Icon } from './Icon';

// ============================================================================
// CONSTANTS
// ============================================================================

const ACCENT = '#783264';
const BLUE = '#005091';
const TEAL = '#4D7C6F';
const PURPLE = '#a855f7';

const logoStyle = {
  '--md-sys-color-primary': '120 50 100',
  '--md-sys-color-tertiary': '0 80 145',
} as React.CSSProperties;

// ============================================================================
// INLINE STYLES — injected once for animations & effects not possible in Tailwind
// ============================================================================

const LandingStyles: React.FC = () => (
  <style>{`
    /* ── Gradient text ── */
    .text-gradient {
      background: linear-gradient(135deg, #ffffff 0%, #ffffff 40%, ${ACCENT} 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }
    .text-gradient-accent {
      background: linear-gradient(135deg, ${ACCENT} 0%, ${PURPLE} 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    /* ── Dot grid background ── */
    .dot-grid {
      background-image: radial-gradient(circle, rgba(255,255,255,0.03) 1px, transparent 1px);
      background-size: 32px 32px;
    }

    /* ── Glow orbs ── */
    .orb {
      position: absolute;
      border-radius: 50%;
      filter: blur(120px);
      pointer-events: none;
      will-change: transform;
    }
    .orb-1 {
      width: 600px; height: 600px;
      background: radial-gradient(circle, ${ACCENT}25, transparent 70%);
      animation: orbFloat1 20s ease-in-out infinite;
    }
    .orb-2 {
      width: 500px; height: 500px;
      background: radial-gradient(circle, ${BLUE}20, transparent 70%);
      animation: orbFloat2 25s ease-in-out infinite;
    }
    .orb-3 {
      width: 400px; height: 400px;
      background: radial-gradient(circle, ${PURPLE}15, transparent 70%);
      animation: orbFloat3 18s ease-in-out infinite;
    }
    @keyframes orbFloat1 {
      0%, 100% { transform: translate(0, 0) scale(1); }
      33% { transform: translate(80px, -60px) scale(1.1); }
      66% { transform: translate(-40px, 40px) scale(0.95); }
    }
    @keyframes orbFloat2 {
      0%, 100% { transform: translate(0, 0) scale(1); }
      33% { transform: translate(-60px, 50px) scale(1.05); }
      66% { transform: translate(50px, -30px) scale(0.9); }
    }
    @keyframes orbFloat3 {
      0%, 100% { transform: translate(0, 0) scale(1); }
      50% { transform: translate(40px, -40px) scale(1.15); }
    }

    /* ── Glassmorphism card ── */
    .glass-card {
      background: linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid rgba(255,255,255,0.06);
      transition: all 0.4s cubic-bezier(0.2, 0, 0, 1);
    }
    .glass-card:hover {
      border-color: rgba(255,255,255,0.12);
      background: linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%);
      transform: translateY(-2px);
      box-shadow: 0 20px 60px -20px rgba(120,50,100,0.15), 0 0 0 1px rgba(255,255,255,0.05);
    }

    /* ── Glowing border card ── */
    .glow-card {
      position: relative;
      background: rgba(255,255,255,0.02);
      border: 1px solid rgba(255,255,255,0.06);
      overflow: hidden;
      transition: all 0.4s cubic-bezier(0.2, 0, 0, 1);
    }
    .glow-card::before {
      content: '';
      position: absolute;
      inset: 0;
      border-radius: inherit;
      padding: 1px;
      background: linear-gradient(135deg, ${ACCENT}00, ${ACCENT}30, ${BLUE}30, ${ACCENT}00);
      -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
      -webkit-mask-composite: xor;
      mask-composite: exclude;
      opacity: 0;
      transition: opacity 0.4s ease;
    }
    .glow-card:hover::before {
      opacity: 1;
    }
    .glow-card:hover {
      transform: translateY(-4px);
      box-shadow: 0 25px 60px -15px ${ACCENT}20;
    }

    /* ── Animated gradient border ── */
    .gradient-border {
      position: relative;
    }
    .gradient-border::after {
      content: '';
      position: absolute;
      inset: -1px;
      border-radius: inherit;
      background: linear-gradient(135deg, ${ACCENT}40, transparent 40%, transparent 60%, ${BLUE}40);
      z-index: -1;
    }

    /* ── Glow button ── */
    .glow-btn {
      position: relative;
      overflow: hidden;
    }
    .glow-btn::before {
      content: '';
      position: absolute;
      inset: -2px;
      background: linear-gradient(135deg, ${ACCENT}, ${PURPLE}, ${BLUE});
      border-radius: inherit;
      z-index: -1;
      opacity: 0;
      transition: opacity 0.3s ease;
      filter: blur(12px);
    }
    .glow-btn:hover::before {
      opacity: 0.6;
    }

    /* ── Horizontal glow line ── */
    .glow-line {
      height: 1px;
      background: linear-gradient(90deg, transparent, ${ACCENT}50, ${BLUE}50, transparent);
    }

    /* ── Floating animation ── */
    @keyframes float {
      0%, 100% { transform: translateY(0px); }
      50% { transform: translateY(-12px); }
    }
    .float { animation: float 6s ease-in-out infinite; }
    .float-delay-1 { animation: float 6s ease-in-out 1s infinite; }
    .float-delay-2 { animation: float 6s ease-in-out 2s infinite; }

    /* ── Pulse ring ── */
    @keyframes pulseRing {
      0% { transform: scale(0.8); opacity: 0.5; }
      50% { transform: scale(1.2); opacity: 0; }
      100% { transform: scale(0.8); opacity: 0.5; }
    }
    .pulse-ring {
      animation: pulseRing 3s ease-in-out infinite;
    }

    /* ── Scroll reveal ── */
    .reveal {
      opacity: 0;
      transform: translateY(30px);
      transition: opacity 0.8s cubic-bezier(0.2, 0, 0, 1), transform 0.8s cubic-bezier(0.2, 0, 0, 1);
    }
    .reveal.visible {
      opacity: 1;
      transform: translateY(0);
    }

    /* ── Noise texture overlay ── */
    .noise::after {
      content: '';
      position: fixed;
      inset: 0;
      pointer-events: none;
      z-index: 100;
      opacity: 0.015;
      background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
    }

    /* ── Shimmer line animation ── */
    @keyframes shimmerLine {
      0% { transform: translateX(-100%); }
      100% { transform: translateX(100%); }
    }

    /* ── Stat counter glow ── */
    .stat-glow {
      text-shadow: 0 0 40px ${ACCENT}40, 0 0 80px ${ACCENT}15;
    }

    /* ── Grid line pattern ── */
    .grid-lines {
      background-image:
        linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px);
      background-size: 80px 80px;
    }
  `}</style>
);

// ============================================================================
// SCROLL REVEAL HOOK
// ============================================================================

const useReveal = () => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) el.classList.add('visible'); },
      { threshold: 0.1, rootMargin: '0px 0px -60px 0px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return ref;
};

const Reveal: React.FC<{ children: React.ReactNode; className?: string; delay?: number }> = ({
  children, className = '', delay = 0,
}) => {
  const ref = useReveal();
  return (
    <div ref={ref} className={`reveal ${className}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
};

// ============================================================================
// ANIMATED COUNTER
// ============================================================================

const AnimatedNumber: React.FC<{ value: number; suffix?: string; duration?: number }> = ({
  value, suffix = '', duration = 1800,
}) => {
  const [displayed, setDisplayed] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const hasAnimated = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasAnimated.current) {
          hasAnimated.current = true;
          const start = performance.now();
          const animate = (now: number) => {
            const progress = Math.min((now - start) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            setDisplayed(Math.round(eased * value));
            if (progress < 1) requestAnimationFrame(animate);
          };
          requestAnimationFrame(animate);
        }
      },
      { threshold: 0.3 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [value, duration]);

  return <span ref={ref}>{displayed}{suffix}</span>;
};

// ============================================================================
// HERO CANVAS — Particles + connecting lines
// ============================================================================

interface Particle {
  x: number; y: number; vx: number; vy: number;
  size: number; alpha: number; color: string;
  life: number; maxLife: number;
}

const HeroCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const mouseRef = useRef({ x: -1000, y: -1000 });
  const rafRef = useRef<number>(0);

  const COLORS = [ACCENT, ACCENT, BLUE, BLUE, '#a855f7', '#ffffff'];

  const createParticle = useCallback((w: number, h: number): Particle => ({
    x: Math.random() * w,
    y: Math.random() * h,
    vx: (Math.random() - 0.5) * 0.12,
    vy: (Math.random() - 0.5) * 0.12,
    size: Math.random() * 2 + 0.8,
    alpha: Math.random() * 0.4 + 0.08,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    life: 0,
    maxLife: Math.random() * 1000 + 600,
  }), []);

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
      if (particlesRef.current.length === 0) {
        const count = Math.floor((cw * ch) / 3500);
        particlesRef.current = Array.from({ length: count }, () => {
          const p = createParticle(cw, ch);
          p.life = Math.random() * p.maxLife;
          return p;
        });
      }
    };
    resize();
    window.addEventListener('resize', resize);

    let time = 0;

    const animate = () => {
      ctx.clearRect(0, 0, cw, ch);
      time += 0.005;
      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;
      const alive: Particle[] = [];
      const nearMouse: Array<{ x: number; y: number; color: string; alpha: number }> = [];

      for (const p of particlesRef.current) {
        p.life++;
        if (p.life >= p.maxLife) { alive.push(createParticle(cw, ch)); continue; }

        const fadeIn = Math.min(1, p.life / 40);
        const fadeOut = p.life / p.maxLife > 0.8 ? (1 - p.life / p.maxLife) / 0.2 : 1;
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < -20) p.x = cw + 20;
        if (p.x > cw + 20) p.x = -20;
        if (p.y < -20) p.y = ch + 20;
        if (p.y > ch + 20) p.y = -20;

        // Mouse interaction
        const dx = mx - p.x, dy = my - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        let boost = 0;
        if (dist < 200 && dist > 5) {
          const prox = (200 - dist) / 200;
          p.vx += (dx / dist) * prox * 0.015;
          p.vy += (dy / dist) * prox * 0.015;
          boost = prox * 0.3;
          nearMouse.push({ x: p.x, y: p.y, color: p.color, alpha: p.alpha * fadeIn * fadeOut });
        }
        p.vx *= 0.99;
        p.vy *= 0.99;

        const pulse = Math.sin(time * 3 + p.life * 0.01) * 0.08;
        const finalAlpha = Math.min(1, (p.alpha + pulse + boost) * fadeIn * fadeOut);

        ctx.globalAlpha = finalAlpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        alive.push(p);
      }

      // Connection lines near mouse
      if (nearMouse.length > 1) {
        for (let i = 0; i < nearMouse.length; i++) {
          for (let j = i + 1; j < nearMouse.length; j++) {
            const a = nearMouse[i], b = nearMouse[j];
            const d = Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
            if (d < 120) {
              ctx.globalAlpha = (1 - d / 120) * 0.15;
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

      particlesRef.current = alive;
      ctx.globalAlpha = 1;
      rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(rafRef.current);
    };
  }, [createParticle]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (rect) mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full"
      onMouseMove={handleMouseMove}
      onMouseLeave={() => { mouseRef.current = { x: -1000, y: -1000 }; }}
    />
  );
};

// ============================================================================
// FEATURE CARD — Glassmorphism with glow border
// ============================================================================

const FeatureCard: React.FC<{
  icon: string; title: string; description: string; highlight?: string; delay?: number;
}> = ({ icon, title, description, highlight, delay = 0 }) => (
  <Reveal delay={delay}>
    <div className="glow-card rounded-2xl p-7 sm:p-8 h-full">
      <div className="relative">
        {/* Icon with glow */}
        <div className="relative w-12 h-12 mb-6">
          <div className="absolute inset-0 rounded-xl opacity-40 blur-lg" style={{ backgroundColor: ACCENT }} />
          <div className="relative w-12 h-12 rounded-xl flex items-center justify-center"
            style={{ background: `linear-gradient(135deg, ${ACCENT}25, ${BLUE}15)` }}>
            <Icon name={icon} className="w-5 h-5" style={{ color: ACCENT }} />
          </div>
        </div>
        <h3 className="text-lg font-semibold text-white mb-2.5">{title}</h3>
        <p className="text-sm text-white/40 leading-relaxed">{description}</p>
        {highlight && (
          <div className="mt-5 pt-4 border-t border-white/[0.06] flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: TEAL }} />
            <p className="text-xs font-medium" style={{ color: TEAL }}>{highlight}</p>
          </div>
        )}
      </div>
    </div>
  </Reveal>
);

// ============================================================================
// WORKFLOW STEP — With glowing connector
// ============================================================================

const WorkflowStep: React.FC<{
  number: number; title: string; description: string; isLast?: boolean; delay?: number;
}> = ({ number, title, description, isLast, delay = 0 }) => (
  <Reveal delay={delay}>
    <div className="flex gap-6">
      <div className="flex flex-col items-center">
        <div className="relative">
          {/* Outer glow ring */}
          <div className="absolute inset-[-6px] rounded-full pulse-ring"
            style={{ border: `1px solid ${ACCENT}30` }} />
          <div className="w-12 h-12 rounded-full flex items-center justify-center text-sm font-brand font-bold text-white relative z-10"
            style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT}cc)`, boxShadow: `0 0 30px ${ACCENT}30` }}>
            {number}
          </div>
        </div>
        {!isLast && (
          <div className="w-px flex-1 mt-4 mb-0"
            style={{ background: `linear-gradient(180deg, ${ACCENT}40, ${ACCENT}05)` }} />
        )}
      </div>
      <div className="pb-12">
        <h3 className="text-base font-semibold text-white mb-2">{title}</h3>
        <p className="text-sm text-white/40 leading-relaxed">{description}</p>
      </div>
    </div>
  </Reveal>
);

// ============================================================================
// STAT CARD
// ============================================================================

const StatCard: React.FC<{
  value: number; suffix: string; label: string; delay?: number;
}> = ({ value, suffix, label, delay = 0 }) => (
  <Reveal delay={delay}>
    <div className="text-center p-6">
      <div className="text-4xl sm:text-5xl font-brand font-bold stat-glow mb-2"
        style={{ color: ACCENT }}>
        <AnimatedNumber value={value} suffix={suffix} />
      </div>
      <div className="text-sm text-white/30 font-medium">{label}</div>
    </div>
  </Reveal>
);

// ============================================================================
// COMPARISON TABLE
// ============================================================================

const ComparisonRow: React.FC<{
  label: string; without: string; withProduct: string; delay?: number;
}> = ({ label, without, withProduct, delay = 0 }) => (
  <Reveal delay={delay}>
    <div className="grid grid-cols-[1.2fr_1fr_1fr] gap-4 py-4 border-b border-white/[0.04] last:border-0 items-center">
      <div className="text-sm text-white/60 font-medium">{label}</div>
      <div className="text-sm text-white/25 flex items-center gap-2">
        <span className="w-1 h-1 rounded-full bg-white/20 shrink-0" />
        {without}
      </div>
      <div className="text-sm font-medium flex items-center gap-2" style={{ color: TEAL }}>
        <Icon name="check" className="w-3.5 h-3.5 shrink-0" style={{ color: TEAL }} />
        {withProduct}
      </div>
    </div>
  </Reveal>
);

// ============================================================================
// SIEM CARD — with icon glow
// ============================================================================

const SiemCard: React.FC<{ name: string; lang: string; icon: string; delay?: number }> = ({
  name, lang, icon, delay = 0,
}) => (
  <Reveal delay={delay}>
    <div className="glass-card rounded-xl p-5 flex flex-col items-center gap-3 group cursor-default">
      <div className="w-10 h-10 rounded-lg flex items-center justify-center"
        style={{ background: `linear-gradient(135deg, ${BLUE}15, ${ACCENT}10)` }}>
        <Icon name={icon} className="w-5 h-5 text-white/50 group-hover:text-white/80 transition-colors" />
      </div>
      <div className="text-center">
        <div className="text-sm font-medium text-white/70 group-hover:text-white transition-colors">{name}</div>
        <div className="text-xs text-white/25 mt-0.5 font-mono">{lang}</div>
      </div>
    </div>
  </Reveal>
);

// ============================================================================
// MAIN LANDING PAGE
// ============================================================================

interface LandingPageProps {
  onSignIn: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onSignIn }) => {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className="min-h-screen bg-[#060608] text-white overflow-x-hidden noise">
      <LandingStyles />

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          NAVIGATION
          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        scrolled
          ? 'bg-[#060608]/80 backdrop-blur-2xl border-b border-white/[0.06] shadow-[0_4px_30px_rgba(0,0,0,0.3)]'
          : ''
      }`}>
        <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-12 h-[72px] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div style={logoStyle}>
              <Icon name="optimus-logo" className="w-8 h-8" />
            </div>
            <span className="font-brand font-bold text-sm tracking-[0.15em] text-white">OPTIMUS</span>
          </div>

          {/* Nav links — desktop */}
          <div className="hidden md:flex items-center gap-8">
            <a href="#platform" className="text-sm text-white/40 hover:text-white transition-colors duration-300">Platform</a>
            <a href="#workflow" className="text-sm text-white/40 hover:text-white transition-colors duration-300">How It Works</a>
            <a href="#integrations" className="text-sm text-white/40 hover:text-white transition-colors duration-300">Integrations</a>
            <a href="#security" className="text-sm text-white/40 hover:text-white transition-colors duration-300">Security</a>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onSignIn}
              className="px-5 py-2.5 text-sm font-medium text-white/50 hover:text-white transition-colors duration-300"
            >
              Sign In
            </button>
            <button
              onClick={onSignIn}
              className="glow-btn px-6 py-2.5 rounded-xl text-sm font-brand font-bold text-white transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
              style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT}dd)` }}
            >
              Get Started
            </button>
          </div>
        </div>
      </nav>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          HERO
          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section className="relative min-h-screen flex items-center justify-center px-6 sm:px-8 pt-[72px]">
        {/* Background layers */}
        <div className="absolute inset-0 dot-grid" />
        <HeroCanvas />

        {/* Floating orbs */}
        <div className="orb orb-1" style={{ top: '-10%', left: '-5%' }} />
        <div className="orb orb-2" style={{ top: '20%', right: '-10%' }} />
        <div className="orb orb-3" style={{ bottom: '5%', left: '15%' }} />

        {/* Radial vignette */}
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse 70% 60% at 50% 45%, transparent 30%, #060608 100%)' }} />

        {/* Content */}
        <div className="relative z-10 text-center max-w-5xl mx-auto">
          {/* Logo with animated rings */}
          <div className="relative inline-block mb-10">
            <div className="absolute inset-[-20px] rounded-full pulse-ring"
              style={{ border: `1px solid ${ACCENT}20` }} />
            <div className="absolute inset-[-40px] rounded-full pulse-ring"
              style={{ border: `1px solid ${ACCENT}10`, animationDelay: '1s' }} />
            <div style={logoStyle} className="relative">
              <Icon name="optimus-logo" className="w-24 h-24 sm:w-28 sm:h-28 mx-auto animate-spool-up" />
            </div>
            {/* Logo glow */}
            <div className="absolute inset-0 rounded-full blur-3xl opacity-30" style={{ backgroundColor: ACCENT }} />
          </div>

          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] mb-8 backdrop-blur-sm">
            <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: TEAL }} />
            <span className="text-xs font-medium text-white/50">AI-Powered Detection Engineering Platform</span>
          </div>

          <h1 className="text-5xl sm:text-6xl lg:text-7xl xl:text-[5.5rem] font-brand font-bold tracking-tight leading-[0.95] mb-6">
            <span className="text-gradient">Detection Engineering,</span>
            <br />
            <span className="text-gradient-accent">Reimagined.</span>
          </h1>

          <p className="text-lg sm:text-xl lg:text-2xl text-white/40 leading-relaxed max-w-3xl mx-auto mb-12 font-light">
            From threat intelligence to deployed SIEM rules in minutes — with MITRE ATT&CK coverage analytics, multi-SIEM support, and AI assistance built in.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-8">
            <button
              onClick={onSignIn}
              className="glow-btn px-10 py-4 rounded-2xl text-base font-brand font-bold text-white transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] flex items-center gap-3 group"
              style={{
                background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT}cc)`,
                boxShadow: `0 0 40px ${ACCENT}30, 0 20px 60px -20px ${ACCENT}40`,
              }}
            >
              <span>Start Building Detections</span>
              <Icon name="arrowRight" className="w-4 h-4 group-hover:translate-x-1 transition-transform duration-300" />
            </button>
            <a
              href="#platform"
              className="px-10 py-4 rounded-2xl text-base font-medium text-white/50 border border-white/[0.08] hover:border-white/[0.15] hover:text-white/70 hover:bg-white/[0.02] transition-all duration-300 backdrop-blur-sm"
            >
              Explore Platform
            </a>
          </div>

          {/* Stats row */}
          <div className="mt-20">
            <div className="glow-line mb-12 max-w-lg mx-auto" />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <StatCard value={12} suffix="" label="Query Languages" delay={0} />
              <StatCard value={14} suffix="" label="SIEM Platforms" delay={100} />
              <StatCard value={10} suffix="K+" label="Detection Rules" delay={200} />
              <StatCard value={201} suffix="" label="MITRE Techniques" delay={300} />
            </div>
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3">
          <div className="w-5 h-8 rounded-full border border-white/10 flex items-start justify-center p-1.5">
            <div className="w-1 h-2 rounded-full bg-white/30 animate-bounce" />
          </div>
        </div>
      </section>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          THE PROBLEM
          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section className="py-28 sm:py-36 px-6 sm:px-8 relative">
        <div className="max-w-6xl mx-auto">
          <Reveal>
            <div className="text-center mb-20">
              <p className="text-xs font-brand font-bold tracking-[0.35em] uppercase mb-5 text-gradient-accent inline-block">
                The Problem
              </p>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight leading-tight max-w-3xl mx-auto">
                Detection content is abundant.
                <span className="text-white/25"> Operationalizing it is broken.</span>
              </h2>
              <p className="text-base sm:text-lg text-white/35 leading-relaxed max-w-2xl mx-auto mt-6">
                10,000+ public detection rules exist. But knowing which matter for your environment, deploying them, and tracking coverage — that's where every team struggles.
              </p>
            </div>
          </Reveal>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { icon: 'search', title: 'Blind Spots Everywhere', description: 'Rules deployed but no picture of which MITRE techniques are covered — or which threats you can\'t detect at all.' },
              { icon: 'clock', title: 'Painfully Slow Cycle', description: 'Threat report to tested, deployed detection takes days. Threat actors move in hours.' },
              { icon: 'layers', title: 'Multi-SIEM Chaos', description: 'Different query languages, deployment workflows, rule formats. Every SIEM is its own silo.' },
              { icon: 'users', title: 'No Shared Context', description: 'Detection knowledge lives in analysts\' heads. When someone leaves, the reasoning walks out with them.' },
              { icon: 'target', title: 'Priority Paralysis', description: 'Thousands of rules to choose from but no way to know which ones matter for your environment.' },
              { icon: 'activity', title: 'Zero Feedback Loop', description: 'Rules deployed and forgotten. No drift detection, no health monitoring, no way to know they still work.' },
            ].map((item, i) => (
              <Reveal key={item.title} delay={i * 80}>
                <div className="glass-card rounded-xl p-6 h-full group">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-4 transition-all duration-300 group-hover:scale-110"
                    style={{ background: `linear-gradient(135deg, ${ACCENT}12, transparent)` }}>
                    <Icon name={item.icon} className="w-4.5 h-4.5 text-white/25 group-hover:text-white/50 transition-colors" />
                  </div>
                  <h3 className="text-sm font-semibold text-white/80 mb-2">{item.title}</h3>
                  <p className="text-sm text-white/30 leading-relaxed">{item.description}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          PLATFORM FEATURES
          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section id="platform" className="py-28 sm:py-36 px-6 sm:px-8 relative">
        {/* Background orb */}
        <div className="orb orb-1" style={{ top: '10%', left: '50%', transform: 'translateX(-50%)' }} />
        <div className="absolute inset-0 grid-lines pointer-events-none opacity-50" />

        <div className="max-w-6xl mx-auto relative">
          <Reveal>
            <div className="text-center mb-20">
              <p className="text-xs font-brand font-bold tracking-[0.35em] uppercase mb-5 text-gradient-accent inline-block">
                The Platform
              </p>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight leading-tight max-w-3xl mx-auto">
                Everything detection engineering needs.
                <span className="text-white/25"> Nothing it doesn't.</span>
              </h2>
              <p className="text-base sm:text-lg text-white/35 leading-relaxed max-w-2xl mx-auto mt-6">
                One platform replaces the spreadsheets, scripts, and context-switching — from threat intelligence ingestion to SIEM deployment.
              </p>
            </div>
          </Reveal>

          {/* Bento grid layout — varied sizes for visual interest */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <FeatureCard
              icon="brain" title="AI Detection Agent"
              description="Multi-model AI (Gemini, OpenAI, Anthropic) that understands your environment, suggests detections, generates queries in any SIEM language, and explains coverage in context."
              highlight="8 specialized agent tools" delay={0}
            />
            <FeatureCard
              icon="matrix" title="MITRE ATT&CK Analytics"
              description="Interactive technique matrix with real-time coverage mapping. See exactly which tactics you cover, where gaps exist, and what to prioritize next."
              highlight="201 techniques mapped" delay={80}
            />
            <FeatureCard
              icon="code" title="Multi-SIEM Query Support"
              description="Write once, deploy anywhere. SPL, KQL, EQL, Sigma, YARA, Snort, and more. Browser-based Sigma conversion to 14 target platforms via WebAssembly."
              highlight="12 query languages" delay={160}
            />
            <FeatureCard
              icon="download-cloud" title="Vendor Detection Import"
              description="One-click import from Sigma community rules, Splunk ESCU, Elastic detection rules, and Chronicle. Build your library in minutes, not months."
              highlight="10,000+ rules from 4 vendors" delay={0}
            />
            <FeatureCard
              icon="intelligence" title="Threat Intelligence Digest"
              description="Paste a threat report, get structured TTPs, IoCs, and MITRE mappings extracted by AI. Automatically surface detection gaps for threats that matter."
              delay={80}
            />
            <FeatureCard
              icon="pipeline" title="Detection Pipeline"
              description="Visual Kanban board for the entire detection lifecycle — from draft through peer review, testing, and production deployment. Real-time collaboration."
              delay={160}
            />
            <FeatureCard
              icon="integration" title="SIEM Integrations"
              description="Direct connections to Splunk, Sentinel, Elastic, CrowdStrike, Chronicle, and Defender XDR. Deploy rules, monitor health, detect drift — from one place."
              highlight="6 SIEM/XDR integrations" delay={0}
            />
            <FeatureCard
              icon="shield" title="Defensive Posture Scoring"
              description="Composite scoring combining threat-actor weighting, technique impact, and gap analysis. Know your actual defensive readiness — not just a rule count."
              delay={80}
            />
            <FeatureCard
              icon="users" title="Team Collaboration"
              description="5-tier RBAC with 47 permissions. Peer review workflows, threaded comments, assignment tracking, audit logging. Built for real security teams."
              delay={160}
            />
          </div>
        </div>
      </section>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          HOW IT WORKS
          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section id="workflow" className="py-28 sm:py-36 px-6 sm:px-8 relative">
        <div className="orb orb-2" style={{ top: '30%', right: '-15%' }} />

        <div className="max-w-6xl mx-auto relative">
          <div className="grid lg:grid-cols-2 gap-16 lg:gap-24 items-start">
            <div className="lg:sticky lg:top-32">
              <Reveal>
                <p className="text-xs font-brand font-bold tracking-[0.35em] uppercase mb-5 text-gradient-accent inline-block">
                  How It Works
                </p>
                <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight leading-tight">
                  Threat report to deployed detection.
                  <span className="text-white/25"> In minutes.</span>
                </h2>
                <p className="text-base sm:text-lg text-white/35 leading-relaxed mt-6 max-w-lg">
                  Optimus connects the dots between what you need to detect and what's running in your SIEMs — closing the gap most teams can't even measure.
                </p>
              </Reveal>
            </div>

            <div className="pt-4">
              <WorkflowStep number={1} title="Profile Your Environment"
                description="Industry, SIEMs, log sources, tools, crown jewels. This context drives everything — from prioritization to feasibility analysis."
                delay={0}
              />
              <WorkflowStep number={2} title="Build Your Detection Library"
                description="Import 10K+ rules from Sigma, Splunk ESCU, Elastic, Chronicle. Create custom detections with AI. Every rule is MITRE-mapped and impact-scored."
                delay={100}
              />
              <WorkflowStep number={3} title="Identify Gaps & Prioritize"
                description="MITRE coverage reveals blind spots. Threat intelligence scoring highlights what matters for your sector. The platform tells you what to build next."
                delay={200}
              />
              <WorkflowStep number={4} title="Review, Test & Deploy"
                description="Peer review ensures quality. Convert between SIEM formats instantly. Deploy directly to connected SIEMs and monitor for drift."
                isLast delay={300}
              />
            </div>
          </div>
        </div>
      </section>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          BEFORE / AFTER
          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section className="py-28 sm:py-36 px-6 sm:px-8 relative">
        <div className="orb orb-3" style={{ bottom: '10%', left: '5%' }} />

        <div className="max-w-4xl mx-auto relative">
          <Reveal>
            <div className="text-center mb-14">
              <p className="text-xs font-brand font-bold tracking-[0.35em] uppercase mb-5 text-gradient-accent inline-block">
                The Impact
              </p>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight leading-tight">
                Measurable impact on your detection program.
              </h2>
            </div>
          </Reveal>

          <Reveal delay={100}>
            <div className="glass-card rounded-2xl overflow-hidden">
              {/* Header */}
              <div className="grid grid-cols-[1.2fr_1fr_1fr] gap-4 px-6 sm:px-8 py-5 border-b border-white/[0.06]"
                style={{ background: `linear-gradient(135deg, ${ACCENT}06, transparent)` }}>
                <div />
                <div className="text-xs font-brand font-bold tracking-wider text-white/25 uppercase">Without</div>
                <div className="text-xs font-brand font-bold tracking-wider uppercase" style={{ color: ACCENT }}>With Optimus</div>
              </div>
              <div className="px-6 sm:px-8">
                <ComparisonRow label="Threat-to-Detection Time" without="Days to weeks" withProduct="Minutes to hours" delay={150} />
                <ComparisonRow label="Coverage Visibility" without="Spreadsheets & guesswork" withProduct="Real-time MITRE heatmap" delay={200} />
                <ComparisonRow label="Multi-SIEM Management" without="Manual per-platform work" withProduct="Write once, deploy anywhere" delay={250} />
                <ComparisonRow label="Detection Quality" without="No review process" withProduct="Structured peer review" delay={300} />
                <ComparisonRow label="Knowledge Retention" without="Lost on turnover" withProduct="Documented with context" delay={350} />
                <ComparisonRow label="Priority Setting" without="Gut feeling & news cycle" withProduct="Threat scores + gap analysis" delay={400} />
                <ComparisonRow label="Detection Drift" without="Unknown until breach" withProduct="Continuous SIEM monitoring" delay={450} />
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          BUILT FOR
          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section className="py-28 sm:py-36 px-6 sm:px-8 relative">
        <div className="absolute inset-0 grid-lines pointer-events-none opacity-30" />

        <div className="max-w-6xl mx-auto relative">
          <Reveal>
            <div className="text-center mb-20">
              <p className="text-xs font-brand font-bold tracking-[0.35em] uppercase mb-5 text-gradient-accent inline-block">
                Built For
              </p>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight leading-tight">
                Teams that take detection coverage seriously.
              </h2>
            </div>
          </Reveal>

          <div className="grid sm:grid-cols-3 gap-4">
            {[
              {
                icon: 'crosshair', title: 'Detection Engineers',
                points: ['Write detections in any SIEM language', 'Convert between formats instantly', 'AI assistance for query generation', 'Peer review before deployment'],
              },
              {
                icon: 'shield', title: 'SOC & Detection Leads',
                points: ['MITRE coverage gap analysis', 'Team workload & pipeline visibility', 'Defensive posture scoring', 'Audit trail for compliance'],
              },
              {
                icon: 'chart-bar', title: 'CISOs & Security Directors',
                points: ['Board-ready coverage metrics', 'ROI on detection investments', 'Cross-SIEM unified visibility', 'Threat-aligned prioritization'],
              },
            ].map(({ icon, title, points }, i) => (
              <Reveal key={title} delay={i * 100}>
                <div className="glow-card rounded-2xl p-7 sm:p-8 h-full">
                  <div className="relative w-12 h-12 mb-6">
                    <div className="absolute inset-0 rounded-xl opacity-30 blur-lg" style={{ backgroundColor: BLUE }} />
                    <div className="relative w-12 h-12 rounded-xl flex items-center justify-center"
                      style={{ background: `linear-gradient(135deg, ${BLUE}20, ${ACCENT}10)` }}>
                      <Icon name={icon} className="w-5 h-5" style={{ color: BLUE }} />
                    </div>
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-5">{title}</h3>
                  <ul className="space-y-3">
                    {points.map((point) => (
                      <li key={point} className="flex items-start gap-3 text-sm text-white/40">
                        <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: TEAL }} />
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          INTEGRATIONS
          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section id="integrations" className="py-28 sm:py-36 px-6 sm:px-8 relative">
        <div className="orb orb-1" style={{ top: '20%', right: '-10%' }} />

        <div className="max-w-5xl mx-auto relative">
          <Reveal>
            <div className="text-center mb-16">
              <p className="text-xs font-brand font-bold tracking-[0.35em] uppercase mb-5 text-gradient-accent inline-block">
                Integrations
              </p>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight leading-tight">
                One platform.
                <span className="text-gradient-accent"> Every SIEM.</span>
              </h2>
              <p className="text-base sm:text-lg text-white/35 leading-relaxed max-w-2xl mx-auto mt-6">
                Deploy rules, monitor health, and detect drift — directly from Optimus to your security stack.
              </p>
            </div>
          </Reveal>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <SiemCard name="Splunk" lang="SPL" icon="splunk" delay={0} />
            <SiemCard name="Sentinel" lang="KQL" icon="sentinel" delay={60} />
            <SiemCard name="Elastic" lang="EQL" icon="elastic" delay={120} />
            <SiemCard name="CrowdStrike" lang="CQL" icon="crowdstrike" delay={180} />
            <SiemCard name="Chronicle" lang="YARA-L" icon="globe" delay={240} />
            <SiemCard name="Defender XDR" lang="KQL" icon="shield" delay={300} />
          </div>

          <Reveal delay={200}>
            <div className="mt-10 text-center">
              <div className="inline-flex items-center gap-3 px-5 py-2.5 rounded-full border border-white/[0.06] bg-white/[0.02]">
                <span className="text-sm text-white/30">Also supports:</span>
                <span className="text-sm text-white/50 font-mono">Sigma &middot; YARA &middot; Snort &middot; SQL &middot; pySigma</span>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          SECURITY
          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section id="security" className="py-28 sm:py-36 px-6 sm:px-8 relative">
        <div className="absolute inset-0 grid-lines pointer-events-none opacity-30" />

        <div className="max-w-6xl mx-auto relative">
          <Reveal>
            <div className="text-center mb-16">
              <p className="text-xs font-brand font-bold tracking-[0.35em] uppercase mb-5 text-gradient-accent inline-block">
                Enterprise-Ready
              </p>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight leading-tight">
                Security built in,
                <span className="text-white/25"> not bolted on.</span>
              </h2>
            </div>
          </Reveal>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { icon: 'lock', title: 'AES-256-GCM', desc: 'Credentials encrypted at rest' },
              { icon: 'shield-check', title: 'Row-Level Security', desc: 'PostgreSQL RLS data isolation' },
              { icon: 'key', title: 'RBAC', desc: '5 roles, 47 permissions' },
              { icon: 'history', title: 'Audit Logging', desc: 'Full action audit trail' },
              { icon: 'user-circle', title: 'MFA', desc: 'TOTP two-factor auth' },
              { icon: 'server', title: 'Server-Side Keys', desc: 'API keys never in browser' },
              { icon: 'shield', title: 'CSP Headers', desc: 'Strict Content Security Policy' },
              { icon: 'globe', title: 'JWT Auth', desc: 'Secure session management' },
            ].map(({ icon, title, desc }, i) => (
              <Reveal key={title} delay={i * 60}>
                <div className="glass-card rounded-xl p-5 h-full group">
                  <div className="flex items-center gap-3 mb-2">
                    <Icon name={icon} className="w-4 h-4 text-white/20 group-hover:text-white/40 transition-colors" />
                    <h4 className="text-sm font-medium text-white/70">{title}</h4>
                  </div>
                  <p className="text-xs text-white/30 leading-relaxed">{desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          FINAL CTA
          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section className="py-32 sm:py-40 px-6 sm:px-8 relative">
        {/* Big central orb */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-[600px] h-[600px] rounded-full blur-[150px] opacity-20"
            style={{ background: `radial-gradient(circle, ${ACCENT}, transparent 70%)` }} />
        </div>

        <div className="max-w-3xl mx-auto text-center relative">
          <Reveal>
            {/* Logo */}
            <div className="relative inline-block mb-10">
              <div style={logoStyle}>
                <Icon name="optimus-logo" className="w-20 h-20 mx-auto" />
              </div>
              <div className="absolute inset-0 rounded-full blur-3xl opacity-25" style={{ backgroundColor: ACCENT }} />
            </div>

            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight leading-tight mb-6">
              Your detection program deserves
              <span className="text-gradient-accent"> better than spreadsheets.</span>
            </h2>
            <p className="text-base sm:text-lg text-white/35 leading-relaxed max-w-xl mx-auto mb-10">
              Build a detection engineering program that's measurable, repeatable, and connected to real threat intelligence.
            </p>

            <button
              onClick={onSignIn}
              className="glow-btn px-12 py-4.5 rounded-2xl text-base font-brand font-bold text-white transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] inline-flex items-center gap-3 group"
              style={{
                background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT}cc)`,
                boxShadow: `0 0 50px ${ACCENT}25, 0 20px 60px -20px ${ACCENT}40`,
              }}
            >
              <span>Get Started</span>
              <Icon name="arrowRight" className="w-4 h-4 group-hover:translate-x-1 transition-transform duration-300" />
            </button>

            <p className="text-xs text-white/15 mt-6">
              Currently in beta &middot; Access by invitation
            </p>
          </Reveal>
        </div>
      </section>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          FOOTER
          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <footer className="border-t border-white/[0.04] py-10 px-6 sm:px-8">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div style={logoStyle}>
              <Icon name="optimus-logo" className="w-5 h-5" />
            </div>
            <span className="font-brand text-xs tracking-[0.15em] text-white/25">OPTIMUS DETECTION STUDIO</span>
          </div>
          <p className="text-xs text-white/10">&copy; 2026 Optimus Detection Studio</p>
        </div>
      </footer>
    </div>
  );
};
