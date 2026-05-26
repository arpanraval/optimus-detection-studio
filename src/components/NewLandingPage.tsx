import React, { useState, useEffect, useRef } from 'react';
import { Icon } from './Icon';
import './new-landing/tokens/landing.css';
import { PlatformShowcase } from './new-landing/PlatformShowcase';

// ============================================================================
// CONSTANTS & COLORS
// ============================================================================

const ACCENT = '#e040a6'; // Electric Magenta
const BLUE = '#00bcff';   // Cyber Cyan
const TEAL = '#00f0b5';   // Laser Mint

const logoStyle = {
  '--md-sys-color-primary': '224 64 166',
  '--md-sys-color-tertiary': '0 188 255',
} as React.CSSProperties;

const VENDOR_LOGOS = [
  { name: 'Splunk', path: '/logos/integrations/splunk.svg', lang: 'SPL', color: 'rgba(16, 185, 129, 0.25)', border: '#10b981' },     // Green
  { name: 'Microsoft Sentinel', path: '/logos/integrations/sentinel.svg', lang: 'KQL', color: 'rgba(0, 130, 200, 0.25)', border: '#0082c8' }, // Blue
  { name: 'Elastic', path: '/logos/integrations/elastic.svg', lang: 'EQL', color: 'rgba(245, 158, 11, 0.25)', border: '#f59e0b' },     // Amber
  { name: 'CrowdStrike', path: '/logos/integrations/crowdstrike.svg', lang: 'CQL', color: 'rgba(239, 68, 68, 0.25)', border: '#ef4444' },     // Red
  { name: 'Chronicle', path: '/logos/integrations/chronicle.svg', lang: 'YARA-L', color: 'rgba(139, 92, 246, 0.25)', border: '#8b5cf6' },  // Purple
  { name: 'Defender XDR', path: '/logos/integrations/defender-xdr.svg', lang: 'KQL', color: 'rgba(37, 99, 235, 0.25)', border: '#2563eb' },  // Royal Blue
];

const IMPORT_SOURCES = [
  { name: 'Sigma Rules', path: '/logos/integrations/sigma.svg', count: '3,200+ Core rules', color: 'rgba(0, 240, 181, 0.15)' },
  { name: 'Splunk ESCU', path: '/logos/integrations/splunk.svg', count: '1,100+ Detections', color: 'rgba(16, 185, 129, 0.15)' },
  { name: 'Elastic Rules', path: '/logos/integrations/elastic.svg', count: '900+ Threat alerts', color: 'rgba(245, 158, 11, 0.15)' },
  { name: 'Chronicle Rules', path: '/logos/integrations/chronicle.svg', count: '800+ Log parsers', color: 'rgba(139, 92, 246, 0.15)' },
];

// ============================================================================
// STYLES STUB (Loaded via landing.css import)
// ============================================================================

const LandingStyles: React.FC = () => null;

// ============================================================================
// UTILITIES: ScrollReveal with support for scale/perspective reveals
// ============================================================================

const ScrollReveal: React.FC<{ children: React.ReactNode; className?: string; delay?: number }> = ({ children, className = '', delay = 0 }) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        el.classList.add('visible');
      }
    }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return <div ref={ref} className={`reveal-up ${className}`} style={{ transitionDelay: `${delay}ms` }}>{children}</div>;
};

// ============================================================================
// MAIN PAGE COMPONENT
// ============================================================================

export const NewLandingPage: React.FC<{ onSignIn: () => void }> = ({ onSignIn }) => {
  const [scrolled, setScrolled] = useState(false);
  const [scrollPercent, setScrollPercent] = useState(0);
  const [showAccessModal, setShowAccessModal] = useState(false);
  const [modalShake, setModalShake] = useState(false);
  
  const [accessEmail, setAccessEmail] = useState('');
  const [accessMessage, setAccessMessage] = useState('');
  const [accessSent, setAccessSent] = useState(false);
  const [accessError, setAccessError] = useState('');
  const [accessLoading, setAccessLoading] = useState(false);

  // Parallax mouse coordinates for hero engine
  const [mouseCoords, setMouseCoords] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
      const totalHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (totalHeight > 0) {
        setScrollPercent((window.scrollY / totalHeight) * 100);
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleMouseMove = (e: React.MouseEvent) => {
    const { clientX, clientY } = e;
    const { innerWidth, innerHeight } = window;
    // Calculate off-center percentages (max shift: ~12 pixels)
    const x = (clientX / innerWidth - 0.5) * 16;
    const y = (clientY / innerHeight - 0.5) * 16;
    setMouseCoords({ x, y });
  };

  const FREE_DOMAINS = ['gmail.com','yahoo.com','hotmail.com','outlook.com','aol.com','icloud.com','mail.com','protonmail.com','zoho.com','yandex.com','live.com','msn.com','me.com','inbox.com','gmx.com'];

  const validateBusinessEmail = (email: string): string | null => {
    if (!email) return 'Business email is required';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Please enter a valid business email';
    const domain = email.split('@')[1]?.toLowerCase();
    if (FREE_DOMAINS.includes(domain)) return 'Please use your official company business email';
    return null;
  };

  const handleAccessRequest = async () => {
    const error = validateBusinessEmail(accessEmail);
    if (error) { 
      setAccessError(error); 
      setModalShake(true);
      setTimeout(() => setModalShake(false), 500);
      return; 
    }
    setAccessError('');
    setAccessLoading(true);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const res = await fetch(`${supabaseUrl}/functions/v1/demo-request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseAnonKey,
          'Authorization': `Bearer ${supabaseAnonKey}`,
        },
        body: JSON.stringify({ email: accessEmail, message: accessMessage }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAccessError(data.error || 'Something went wrong. Please try again.');
        setAccessLoading(false);
        setModalShake(true);
        setTimeout(() => setModalShake(false), 500);
        return;
      }
    } catch {
      setAccessError('Network error. Please try again.');
      setAccessLoading(false);
      setModalShake(true);
      setTimeout(() => setModalShake(false), 500);
      return;
    }
    setAccessLoading(false);
    setAccessSent(true);
    setTimeout(() => { 
      setShowAccessModal(false); 
      setAccessSent(false); 
      setAccessEmail(''); 
      setAccessMessage(''); 
    }, 2800);
  };

  return (
    <div className="landing-root min-h-screen relative overflow-x-hidden" onMouseMove={handleMouseMove}>
      <LandingStyles />

      {/* Glowing Neon Progress Bar */}
      <div className="scroll-progress" style={{ width: `${scrollPercent}%` }} />

      {/* Global Neon Ambiences */}
      <div className="glow-primary -top-40 -right-40 animate-pulse" style={{ animationDuration: '8s' }} />
      <div className="glow-secondary top-[60vh] -left-40" />

      {/* ━━━ NAV Floating Capsule ━━━ */}
      <nav className="fixed top-6 left-0 right-0 z-50 px-4 sm:px-8 flex justify-center pointer-events-none">
        <div 
          className={`w-full max-w-[1500px] flex items-center justify-between pointer-events-auto transition-all duration-500 rounded-full py-3 px-6 sm:px-10 border ${
            scrolled 
              ? 'bg-surface/85 backdrop-blur-3xl shadow-[0_12px_40px_-16px_rgba(0,0,0,0.12)] border-outline-variant/60 py-3.5' 
              : 'bg-transparent border-transparent py-5'
          }`}
        >
          <div className="flex items-center gap-3 cursor-pointer group">
            <div style={logoStyle}>
              <Icon name="optimus-logo" className="w-8 h-8 group-hover:rotate-[30deg] group-hover:scale-110 transition-all duration-500" />
            </div>
            <div className="flex flex-col leading-none">
              <span className="font-brand font-black text-sm tracking-[0.25em] text-on-surface uppercase text-gradient-white">OPTIMUS</span>
              <span className="mono text-[8px] tracking-[0.3em] text-on-surface-variant uppercase mt-1">Detection Studio</span>
            </div>
          </div>
          <button
            onClick={onSignIn}
            className="btn-outline px-6 py-2 text-[10px] font-bold mono tracking-widest uppercase hover:shadow-[0_0_15px_rgba(0,188,255,0.25)] hover:border-[#00bcff] transition-all"
          >
            Terminal Login
          </button>
        </div>
      </nav>

      {/* ━━━ HERO SECTION ━━━ */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-28 pb-16">
        <div className="max-w-[1500px] w-full mx-auto px-6 sm:px-12 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center relative z-10">
          
          {/* Column 1: Hero Interactive Text Panel (span 5) */}
          <div className="lg:col-span-5 flex flex-col justify-center">
            <ScrollReveal delay={50}>
              <div className="inline-flex items-center gap-2.5 px-3 py-1.5 rounded-full bg-surface-container-high border border-outline-variant/60 mono text-[9px] font-bold tracking-[0.25em] text-gradient-cyber uppercase mb-8 w-fit">
                <span className="w-2.5 h-2.5 rounded-full bg-primary animate-ping" />
                CYBERNETIC DETECTION HUB
              </div>
            </ScrollReveal>

            <ScrollReveal delay={150}>
              <h1 className="font-brand font-bold text-[clamp(2.5rem,6.5vw,5.5rem)] leading-[1.05] tracking-tight mb-8 max-w-4xl text-gradient-white">
                Detection content is <span className="text-gradient-cyber">abundant</span>.
                <span className="block text-on-surface-variant font-light text-[clamp(2rem,5.5vw,4.5rem)] mt-2">Everything around it is broken.</span>
              </h1>
            </ScrollReveal>

            <ScrollReveal delay={280}>
              <p className="text-base sm:text-lg text-on-surface-variant leading-relaxed max-w-2xl mb-12 font-light">
                Thousands of public rules exist — but selecting, parsing, translating, measuring 
                coverage, and evaluating rule quality is where programs fail.{' '}
                <span className="text-on-surface font-semibold">Optimus Detection Studio automates the full engineering lifecycle end-to-end.</span>
              </p>
            </ScrollReveal>

            <ScrollReveal delay={380}>
              <div className="flex flex-wrap gap-4 items-center">
                <button 
                  onClick={() => setShowAccessModal(true)} 
                  className="btn-primary px-10 py-4.5 text-xs font-bold uppercase tracking-[0.2em] hover:shadow-[0_0_24px_rgba(224,64,166,0.45)]"
                >
                  Access System Terminal
                </button>
                <a 
                  href="#features"
                  className="btn-outline px-8 py-4 text-xs font-bold uppercase tracking-[0.15em] mono flex items-center gap-2 group"
                >
                  Explore Features <span className="group-hover:translate-y-1 transition-transform duration-300">↓</span>
                </a>
              </div>
            </ScrollReveal>
          </div>

          {/* Column 2: Parallax Engine Visual Container (span 7) */}
          <div 
            className="lg:col-span-7 w-full flex items-center justify-center pointer-events-none select-none"
            style={{
              transform: `translate3d(${mouseCoords.x}px, ${mouseCoords.y}px, 0)`,
              transition: 'transform 0.15s cubic-bezier(0.25, 1, 0.5, 1)',
              opacity: 0.95
            }}
          >
            <svg viewBox="0 0 940 640" className="w-full h-auto max-h-[85vh]" fill="none">
              <defs>
                <filter id="glow-hero"><feGaussianBlur stdDeviation="3" /></filter>
                <filter id="hub-glow-hero"><feGaussianBlur stdDeviation="10" result="blur" /><feComposite in="SourceGraphic" in2="blur" operator="over" /></filter>
                <radialGradient id="blade-gradient-hero" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#e040a6" stopOpacity="0.85" />
                  <stop offset="60%" stopColor="#783264" stopOpacity="0.4" />
                  <stop offset="100%" stopColor="transparent" stopOpacity="0" />
                </radialGradient>
                <radialGradient id="blade-gradient-inner" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#00bcff" stopOpacity="0.8" />
                  <stop offset="70%" stopColor="#005091" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="transparent" stopOpacity="0" />
                </radialGradient>
              </defs>
   
              {/* ── SOURCE NODES (Left side) ── */}
              {[
                { name: 'Sigma Rules', count: '3,083 Active', y: 80, logo: '/logos/integrations/sigma.svg' },
                { name: 'Splunk ESCU', count: '1,500 Rules', y: 165, logo: '/logos/integrations/splunk.svg' },
                { name: 'Elastic Security', count: '1,200 Rules', y: 250, logo: '/logos/integrations/elastic.svg' },
                { name: 'Defender XDR', count: '500 Rules', y: 335, logo: '/logos/integrations/defender-xdr.svg' },
                { name: 'Google Chronicle', count: '400 Rules', y: 420, logo: '/logos/integrations/chronicle.svg' },
                { name: 'MS Sentinel', count: '800 Rules', y: 505, logo: '/logos/integrations/sentinel.svg' },
              ].map((src, i) => (
                <g key={src.name} className="opacity-95">
                  {/* Node Text */}
                  <text x="80" y={src.y} textAnchor="end" fill="rgb(18, 18, 20)" fillOpacity="0.9" fontSize="11" fontWeight="600" className="mono">{src.name}</text>
                  <text x="80" y={src.y + 13} textAnchor="end" fill="#00bcff" fillOpacity="0.8" fontSize="8" fontFamily="monospace" letterSpacing="1">{src.count}</text>
                  
                  {/* Node Ring */}
                  <circle cx="108" cy={src.y + 4} r="14" fill="rgba(255, 255, 255, 0.85)" stroke="rgba(0, 0, 0, 0.08)" strokeWidth="1.5" />
                  <circle cx="108" cy={src.y + 4} r="14" fill="transparent" stroke="#00bcff" strokeWidth="1" strokeOpacity="0.3" />
                  <image href={src.logo} x="99" y={src.y - 5} width="18" height="18" opacity="0.9" />
                  
                  {/* Bezier Flow Path Line */}
                  <path d={`M124,${src.y + 4} C250,${src.y + 4} 300,300 390,300`} stroke="url(#flow-gradient-in)" strokeOpacity="0.3" strokeWidth="1.5" strokeDasharray="4 6" />
                  
                  {/* Animated Bezier Tube */}
                  <path id={`in-hero-${i}`} d={`M124,${src.y + 4} C250,${src.y + 4} 300,300 390,300`} fill="none" />
                  
                  {/* Particle Packet */}
                  <circle r="2.5" fill="#00bcff" filter="url(#glow-hero)">
                    <animateMotion dur={`${2.2 + i * 0.3}s`} repeatCount="indefinite">
                      <mpath href={`#in-hero-${i}`} />
                    </animateMotion>
                  </circle>
                </g>
              ))}
              
              {/* Linear gradients for tubes */}
              <linearGradient id="flow-gradient-in" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#00bcff" stopOpacity="0.1" />
                <stop offset="100%" stopColor="#e040a6" stopOpacity="0.8" />
              </linearGradient>
              <linearGradient id="flow-gradient-out" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#e040a6" stopOpacity="0.8" />
                <stop offset="100%" stopColor="#00f0b5" stopOpacity="0.1" />
              </linearGradient>
    
              {/* ── CYBER ENGINE CORE (Center) ── */}
              <g transform="translate(450, 300)">
                {/* Outer Energy Field */}
                <circle r="120" fill="none" stroke="#e040a6" strokeWidth="1.5" strokeDasharray="5 15" strokeOpacity="0.25" className="spin-cw-slow" />
                <circle r="102" fill="none" stroke="rgba(0, 188, 255, 0.2)" strokeWidth="1" />
                
                {/* Main Rotating Mechanical Rings */}
                <g className="spin-cw-slow">
                  <circle r="90" fill="none" stroke="#e040a6" strokeWidth="4" strokeOpacity="0.75" />
                  <circle r="83" fill="none" stroke="rgba(0,0,0,0.05)" strokeWidth="1" />
                </g>
                
                {/* Inner Counter-Rotating Blades */}
                <g className="spin-ccw-medium">
                  {Array.from({ length: 12 }).map((_, i) => (
                    <path
                      key={i}
                      d="M0,-5 C12,-5 20,-12 20,-50 C20,-54 16,-54 13,-50 C5,-18 0,-12 0,-5 Z"
                      fill="url(#blade-gradient-hero)"
                      transform={`rotate(${i * 30})`}
                      stroke="rgba(0,0,0,0.1)"
                      strokeWidth="0.5"
                    />
                  ))}
                </g>
  
                {/* Central Dynamic Energy Core */}
                <g className="spin-cw-slow">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <path
                      key={i}
                      d="M0,-3 C6,-3 12,-8 12,-30 C12,-32 9,-32 7,-30 C3,-10 0,-8 0,-3 Z"
                      fill="url(#blade-gradient-inner)"
                      transform={`rotate(${i * 45 + 22.5})`}
                    />
                  ))}
                </g>
  
                <circle r="22" fill="#e040a6" filter="url(#hub-glow-hero)" className="pulse-glow" />
                <circle r="8" fill="#ffffff" />
              </g>
   
              {/* ── COMPILED TARGET NODES (Right side) ── */}
              {[
                { name: 'Splunk KQL/SPL', y: 80, logo: '/logos/integrations/splunk.svg', text: 'COMPILED ✓' },
                { name: 'Azure Sentinel', y: 165, logo: '/logos/integrations/sentinel.svg', text: 'COMPILED ✓' },
                { name: 'Elastic SIEM', y: 250, logo: '/logos/integrations/elastic.svg', text: 'COMPILED ✓' },
                { name: 'Google SecOps', y: 335, logo: '/logos/integrations/chronicle.svg', text: 'COMPILED ✓' },
                { name: 'CrowdStrike CQL', y: 420, logo: '/logos/integrations/crowdstrike.svg', text: 'COMPILED ✓' },
                { name: 'Defender XDR', y: 505, logo: '/logos/integrations/defender-xdr.svg', text: 'COMPILED ✓' },
              ].map((tgt, i) => (
                <g key={tgt.name} className="opacity-95">
                  {/* Node Text */}
                  <text x="820" y={tgt.y} textAnchor="start" fill="rgb(18, 18, 20)" fillOpacity="0.9" fontSize="11" fontWeight="600" className="mono">{tgt.name}</text>
                  <text x="820" y={tgt.y + 13} textAnchor="start" fill="#00f0b5" fillOpacity="0.85" fontSize="8" fontFamily="monospace" letterSpacing="1">{tgt.text}</text>
                  
                  {/* Node Ring */}
                  <circle cx="792" cy={tgt.y + 4} r="14" fill="rgba(255, 255, 255, 0.85)" stroke="rgba(0, 0, 0, 0.08)" strokeWidth="1.5" />
                  <circle cx="792" cy={tgt.y + 4} r="14" fill="transparent" stroke="#00f0b5" strokeWidth="1" strokeOpacity="0.3" />
                  <image href={tgt.logo} x="783" y={tgt.y - 5} width="18" height="18" opacity="0.9" />
                  
                  {/* Bezier Target Flow Line */}
                  <path d={`M510,300 C600,300 650,${tgt.y + 4} 776,${tgt.y + 4}`} stroke="url(#flow-gradient-out)" strokeOpacity="0.3" strokeWidth="1.5" strokeDasharray="4 6" />
                  
                  {/* Outgoing Motion Path */}
                  <path id={`out-hero-${i}`} d={`M510,300 C600,300 650,${tgt.y + 4} 776,${tgt.y + 4}`} fill="none" />
                  
                  {/* Target Neon Particle */}
                  <circle r="2.5" fill="#00f0b5" filter="url(#glow-hero)">
                    <animateMotion dur={`${1.8 + i * 0.3}s`} repeatCount="indefinite">
                      <mpath href={`#out-hero-${i}`} />
                    </animateMotion>
                  </circle>
                </g>
              ))}
            </svg>
          </div>

        </div>
      </section>

      {/* ━━━ FEATURES SECTION ━━━ */}
      <div className="relative z-20 bg-surface border-t border-outline-variant/60">
        <PlatformShowcase />
      </div>

      {/* ━━━ STACK INTEGRATIONS Bento grid ━━━ */}
      <section className="relative z-10 py-36 px-6 sm:px-12 max-w-[1500px] mx-auto border-t border-outline-variant/60">
        <ScrollReveal>
          <div className="text-center max-w-3xl mx-auto mb-24">
            <span className="mono text-[10px] font-bold text-primary tracking-[0.3em] uppercase block mb-4">UNIVERSAL TRANSLATION</span>
            <h2 className="font-brand text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-6 text-gradient-white">Interlock with your pipeline.</h2>
            <p className="text-base sm:text-lg text-on-surface-variant leading-relaxed font-light">
              Directly compile detection sources into 6 vendor-specific dialects, parse active Sigma objects across 14 platforms, and deploy logs instantly.
            </p>
          </div>
        </ScrollReveal>

        <div className="grid lg:grid-cols-12 gap-6 sm:gap-8 items-stretch">
          
          {/* Target Platforms */}
          <ScrollReveal delay={100} className="lg:col-span-7">
            <div className="bento-card h-full p-8 sm:p-10 flex flex-col justify-between">
              <div className="flex items-center justify-between mb-12">
                <span className="mono text-[11px] font-bold tracking-[0.25em] text-on-surface-variant uppercase">Deploy Systems</span>
                <span className="mono text-[10px] text-primary border border-primary/30 bg-primary/5 px-3 py-1 rounded-full">14+ Platforms</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 flex-1">
                {VENDOR_LOGOS.map((v) => (
                  <div 
                    key={v.name} 
                    className="flex flex-col items-center justify-center gap-4 p-6 rounded-2xl bg-surface-container-low border border-outline-variant/60 transition-all duration-300 group cursor-default hover:scale-[1.03] hover:border-transparent"
                    style={{
                      '--hover-glow': v.color,
                      '--hover-border': v.border,
                    } as React.CSSProperties}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.boxShadow = `0 10px 30px -10px ${v.color}`;
                      e.currentTarget.style.borderColor = v.border;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.boxShadow = '';
                      e.currentTarget.style.borderColor = '';
                    }}
                  >
                    <div className="p-3.5 rounded-xl bg-surface-container-high border border-outline-variant/60 group-hover:scale-115 transition-transform duration-300">
                      <img src={v.path} alt={v.name} className="w-8 h-8 object-contain opacity-70 group-hover:opacity-100 transition-opacity" />
                    </div>
                    <div className="text-center">
                      <div className="text-xs font-semibold text-on-surface-variant group-hover:text-on-surface transition-colors">{v.name}</div>
                      <div className="mono text-[8px] tracking-widest text-[#00bcff] mt-1.5 uppercase font-bold">{v.lang}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </ScrollReveal>

          {/* Import Sources */}
          <ScrollReveal delay={220} className="lg:col-span-5">
            <div className="bento-card h-full p-8 sm:p-10 flex flex-col justify-between">
              <div className="mb-10">
                <span className="mono text-[11px] font-bold tracking-[0.25em] text-on-surface-variant uppercase block mb-2">Ingestion Engines</span>
                <span className="text-xs text-outline font-light">Continuous telemetry mappings in near real-time.</span>
              </div>
              
              <div className="space-y-4 flex-1 flex flex-col justify-center">
                {IMPORT_SOURCES.map((src) => (
                  <div 
                    key={src.name} 
                    className="flex items-center justify-between p-4.5 rounded-2xl bg-surface-container-low border border-outline-variant/60 transition-all duration-300 group cursor-default hover:translate-x-1.5 hover:border-primary-container"
                    onMouseEnter={(e) => {
                      e.currentTarget.style.boxShadow = `0 8px 24px -10px rgba(224, 64, 166, 0.3)`;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.boxShadow = '';
                    }}
                  >
                    <div className="flex items-center gap-4">
                      <div className="p-2.5 rounded-lg bg-surface-container-high border border-outline-variant/60">
                        <img src={src.path} alt={src.name} className="w-5 h-5 object-contain opacity-80" />
                      </div>
                      <span className="text-sm font-medium text-on-surface-variant group-hover:text-on-surface transition-colors">{src.name}</span>
                    </div>
                    <span className="mono text-[9px] text-[#00f0b5] tracking-widest font-bold bg-[#00f0b5]/5 px-2.5 py-1 rounded-md border border-[#00f0b5]/15">{src.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </ScrollReveal>

        </div>
      </section>

      {/* ━━━ FINAL CTA ━━━ */}
      <section className="relative z-10 py-36 px-6 border-t border-outline-variant/60 overflow-hidden">
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[900px] bg-[radial-gradient(circle,rgba(224,64,166,0.12)_0%,transparent_60%)] filter blur-3xl pointer-events-none" />

        <div className="max-w-3xl mx-auto text-center relative z-10 flex flex-col items-center">
          <ScrollReveal>
            <span className="mono text-[9px] font-bold tracking-[0.3em] text-[#00bcff] uppercase block mb-6">SECURE PIPELINE SYSTEM</span>
            <h2 className="font-brand text-[clamp(2.5rem,5.5vw,4.5rem)] font-bold tracking-tight leading-[1.02] mb-6 text-gradient-white">
              Take complete control of your <span className="text-gradient-cyber">defensive shield</span>.
            </h2>
            <p className="text-base sm:text-lg text-on-surface-variant leading-relaxed max-w-xl mx-auto mb-12 font-light">
              Unify rules, orchestrate diagnostic simulations, and check your MITRE readiness logs.
            </p>
            <button 
              onClick={() => setShowAccessModal(true)} 
              className="btn-primary px-12 py-5 text-xs font-bold uppercase tracking-[0.2em] hover:shadow-[0_0_30px_rgba(224,64,166,0.5)]"
            >
              Initialize Early Access
            </button>
          </ScrollReveal>
        </div>
      </section>

      {/* ━━━ FOOTER ━━━ */}
      <footer className="relative z-10 border-t border-outline-variant/60 py-12 px-6 sm:px-12 bg-surface-container-low">
        <div className="max-w-[1500px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div style={logoStyle}>
              <Icon name="optimus-logo" className="w-6 h-6 text-primary" />
            </div>
            <span className="mono text-[10px] font-bold tracking-[0.25em] text-on-surface-variant uppercase">OPTIMUS DETECTION STUDIO</span>
          </div>
          <span className="mono text-[9px] text-outline tracking-wider uppercase font-medium">&copy; 2026 SYSTEM TERMINAL</span>
        </div>
      </footer>

      {/* ━━━ ACCESS REQUEST MODAL ━━━ */}
      {showAccessModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center px-4" onClick={() => setShowAccessModal(false)}>
          <div className="absolute inset-0 bg-[#040406]/75 backdrop-blur-md" />
          
          <div 
            className={`bento-card max-w-md w-full relative z-10 modal-spring glass-card ${modalShake ? 'shake-effect' : ''}`} 
            onClick={e => e.stopPropagation()}
          >
            <div className="p-8 sm:p-10">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h3 className="font-brand text-2xl font-bold tracking-tight text-gradient-white">Request Terminal Access</h3>
                  <p className="text-[10px] text-outline mono uppercase tracking-wider mt-1">Status: Ready to Ingest</p>
                </div>
                <button 
                  onClick={() => setShowAccessModal(false)} 
                  className="text-on-surface-variant hover:text-primary transition-colors text-2xl leading-none"
                >
                  &times;
                </button>
              </div>

              {accessSent ? (
                <div className="text-center py-10">
                  <div className="w-16 h-16 rounded-full mx-auto mb-6 flex items-center justify-center bg-[#00f0b5]/10 border border-[#00f0b5]/30">
                    <Icon name="check" className="w-8 h-8 text-[#00f0b5] animate-bounce" />
                  </div>
                  <p className="text-xl font-bold text-gradient-white mb-2">Ingestion Successful.</p>
                  <p className="text-on-surface-variant text-xs font-light">We will send credentials to <span className="text-[#00bcff] font-medium">{accessEmail}</span> shortly.</p>
                </div>
              ) : (
                <>
                  <div className="space-y-6">
                    <div>
                      <label className="mono text-[9px] font-bold tracking-[0.2em] text-on-surface-variant uppercase block mb-2.5">Corporate Domain Email</label>
                      <input
                        type="email"
                        value={accessEmail}
                        onChange={e => { setAccessEmail(e.target.value); setAccessError(''); }}
                        onBlur={() => { const err = validateBusinessEmail(accessEmail); if (err) setAccessError(err); }}
                        placeholder="identity@company.com"
                        className={`w-full px-5 py-4 rounded-xl bg-surface-container-low border text-on-surface text-sm placeholder:text-outline focus:outline-none transition-all ${
                          accessError 
                            ? 'border-red-500/50 focus:border-red-500 focus:bg-red-500/5' 
                            : 'border-outline-variant focus:border-primary focus:bg-surface-container-high focus:shadow-[0_0_15px_rgba(224,64,166,0.15)]'
                        }`}
                      />
                      {accessError && <p className="text-red-400 text-xs mt-2 font-medium mono">{`[!] ERROR: ${accessError}`}</p>}
                    </div>
                    <div>
                      <label className="mono text-[9px] font-bold tracking-[0.2em] text-on-surface-variant uppercase block mb-2.5">Defensive Scope Detail</label>
                      <textarea
                        value={accessMessage}
                        onChange={e => setAccessMessage(e.target.value)}
                        placeholder="Describe your security stack e.g. Ingestion via Splunk and Microsoft Sentinel..."
                        rows={3}
                        className="w-full px-5 py-4 rounded-xl bg-surface-container-low border border-outline-variant text-on-surface text-sm placeholder:text-outline focus:outline-none focus:border-primary focus:bg-surface-container-high transition-all resize-none focus:shadow-[0_0_15px_rgba(224,64,166,0.15)]"
                      />
                    </div>
                  </div>
                  <button
                    onClick={handleAccessRequest}
                    disabled={!accessEmail || accessLoading}
                    className="w-full mt-8 py-4.5 rounded-xl text-xs font-bold mono tracking-widest uppercase transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed hover:shadow-[0_0_20px_rgba(0,188,255,0.4)]"
                    style={{ backgroundColor: ACCENT, color: 'white' }}
                  >
                    {accessLoading ? 'Parsing Stream...' : 'Broadcast Request'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
