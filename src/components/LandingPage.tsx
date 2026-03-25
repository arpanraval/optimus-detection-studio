import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Icon } from './Icon';
import { PlatformShowcase } from './landing/PlatformShowcase';

// ============================================================================
// CONSTANTS
// ============================================================================

const ACCENT = '#783264';
const BLUE = '#005091';
const TEAL = '#4D7C6F';

const logoStyle = {
  '--md-sys-color-primary': '120 50 100',
  '--md-sys-color-tertiary': '0 80 145',
} as React.CSSProperties;

const VENDOR_LOGOS = [
  { name: 'Splunk', path: '/logos/integrations/splunk.svg', lang: 'SPL' },
  { name: 'Microsoft Sentinel', path: '/logos/integrations/sentinel.svg', lang: 'KQL' },
  { name: 'Elastic', path: '/logos/integrations/elastic.svg', lang: 'EQL' },
  { name: 'CrowdStrike', path: '/logos/integrations/crowdstrike.svg', lang: 'CQL' },
  { name: 'Chronicle', path: '/logos/integrations/chronicle.svg', lang: 'YARA-L' },
  { name: 'Defender XDR', path: '/logos/integrations/defender-xdr.svg', lang: 'KQL' },
];

const IMPORT_SOURCES = [
  { name: 'Sigma', path: '/logos/integrations/sigma.svg', count: '3,200+' },
  { name: 'Splunk ESCU', path: '/logos/integrations/splunk.svg', count: '1,100+' },
  { name: 'Elastic Rules', path: '/logos/integrations/elastic.svg', count: '900+' },
  { name: 'Chronicle', path: '/logos/integrations/chronicle.svg', count: '800+' },
];

// ============================================================================
// STYLES
// ============================================================================

const LandingStyles: React.FC = () => (
  <style>{`
    .reveal{opacity:0;transform:translateY(20px);transition:opacity .6s ease,transform .6s ease}
    .reveal.visible{opacity:1;transform:translateY(0)}
    @keyframes blink{0%,100%{opacity:1}50%{opacity:0}}
    .cursor-blink{animation:blink 1s step-end infinite}
    .mono{font-family:'JetBrains Mono','SF Mono','Consolas',monospace}
    @keyframes hero-fade{from{opacity:0}to{opacity:1}}
    .hero-fade{animation:hero-fade 0.8s ease forwards}
    @keyframes cta-pulse{0%,100%{box-shadow:0 0 40px #78326450,0 0 80px #78326420}50%{box-shadow:0 0 60px #78326470,0 0 120px #78326430}}
    .cta-glow{animation:cta-pulse 3s ease-in-out infinite}
    @keyframes shimmer{0%{transform:translateX(-150%)}100%{transform:translateX(150%)}}
    .cta-shimmer{position:relative;overflow:hidden}
    .cta-shimmer::after{content:"";position:absolute;top:0;left:0;width:50%;height:100%;background:linear-gradient(to right,transparent,rgba(255,255,255,0.08),transparent);transform:skewX(-20deg);animation:shimmer 4s infinite ease-in-out}
    @property --angle{syntax:"<angle>";initial-value:0deg;inherits:false}
    @keyframes spin-border{to{--angle:360deg}}
    .conic-border{position:relative;border-radius:1rem;overflow:hidden;padding:1.5px;transition:transform 0.3s ease}
    .conic-border:hover{transform:scale(1.06)}
    .conic-border::before{content:"";position:absolute;inset:-50%;background:conic-gradient(from var(--angle),transparent 60%,#783264 78%,#78326480 82%,transparent 100%);animation:spin-border 3s linear infinite}
    .conic-border>*{position:relative;border-radius:calc(1rem - 1.5px);background:#09090b}
  `}</style>
);

// ============================================================================
// REVEAL (scroll-triggered fade-up)
// ============================================================================

const Reveal: React.FC<{ children: React.ReactNode; className?: string; delay?: number }> = ({
  children, className = '', delay = 0,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) el.classList.add('visible');
    }, { threshold: 0.08 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return <div ref={ref} className={`reveal ${className}`} style={{ transitionDelay: `${delay}ms` }}>{children}</div>;
};

// ============================================================================
// ANIMATED NUMBER (counter)
// ============================================================================

const AnimNum: React.FC<{ value: number; suffix?: string; prefix?: string }> = ({ value, suffix = '', prefix = '' }) => {
  const [n, setN] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const done = useRef(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !done.current) {
        done.current = true;
        const t0 = performance.now();
        const go = (now: number) => {
          const p = Math.min((now - t0) / 1200, 1);
          setN(Math.round((1 - (1 - p) ** 3) * value));
          if (p < 1) requestAnimationFrame(go);
        };
        requestAnimationFrame(go);
      }
    }, { threshold: 0.3 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [value]);
  return <span ref={ref}>{prefix}{n.toLocaleString()}{suffix}</span>;
};

// ============================================================================
// TYPEWRITER (for AI Query mockup)
// ============================================================================

const Typewriter: React.FC<{ lines: React.ReactNode[]; rawLengths: number[] }> = ({ lines, rawLengths }) => {
  const [visibleChars, setVisibleChars] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const done = useRef(false);
  const total = rawLengths.reduce((a, b) => a + b, 0);

  useEffect(() => {
    const el = ref.current; if (!el) return;
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !done.current) {
        done.current = true;
        let i = 0;
        const go = () => {
          i += 2;
          setVisibleChars(i);
          if (i < total) setTimeout(go, 25);
        };
        go();
      }
    }, { threshold: 0.3 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [total]);

  let consumed = 0;
  return (
    <div ref={ref}>
      {lines.map((line, idx) => {
        const lineLen = rawLengths[idx];
        const lineStart = consumed;
        consumed += lineLen;
        const charsVisible = Math.max(0, Math.min(lineLen, visibleChars - lineStart));
        if (charsVisible === 0 && visibleChars < lineStart) return <div key={idx} className="h-7">&nbsp;</div>;
        return (
          <div key={idx} style={{ clipPath: charsVisible >= lineLen ? undefined : `inset(0 ${100 - (charsVisible / lineLen) * 100}% 0 0)` }}>
            {line}
            {charsVisible < lineLen && charsVisible > 0 && <span className="cursor-blink text-white/40">|</span>}
          </div>
        );
      })}
    </div>
  );
};

// ============================================================================
// SEQUENTIAL CHECKMARKS (for Threat Intel mockup)
// ============================================================================

const SequentialStages: React.FC<{ stages: { stage: string; result: string }[] }> = ({ stages }) => {
  const [revealed, setRevealed] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const done = useRef(false);

  useEffect(() => {
    const el = ref.current; if (!el) return;
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !done.current) {
        done.current = true;
        let i = 0;
        const go = () => {
          i++;
          setRevealed(i);
          if (i < stages.length) setTimeout(go, 300);
        };
        setTimeout(go, 200);
      }
    }, { threshold: 0.3 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [stages.length]);

  return (
    <div ref={ref} className="space-y-3">
      {stages.map((s, i) => (
        <div key={s.stage} className="flex items-center gap-3">
          {i < revealed ? (
            <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: `${TEAL}25` }}>
              <Icon name="check" className="w-3 h-3" style={{ color: TEAL }} />
            </div>
          ) : i === revealed ? (
            <div className="w-5 h-5 rounded-full border-2 border-t-transparent animate-spin shrink-0" style={{ borderColor: `${ACCENT} transparent ${ACCENT}40 ${ACCENT}40` }} />
          ) : (
            <div className="w-5 h-5 rounded-full border border-white/10 shrink-0" />
          )}
          <span className={`mono text-xs ${i > revealed ? 'text-white/20' : 'text-white/60'}`}>{s.stage}</span>
          <span className="text-xs text-white/35 ml-auto">{i <= revealed ? s.result : ''}</span>
        </div>
      ))}
    </div>
  );
};

// ============================================================================
// STAGGERED CELL REVEAL (for MITRE matrix)
// ============================================================================

const StaggerReveal: React.FC<{ children: React.ReactNode; index: number; totalMs?: number }> = ({ children, index, totalMs = 800 }) => {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const done = useRef(false);

  useEffect(() => {
    const el = ref.current; if (!el) return;
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !done.current) {
        done.current = true;
        setTimeout(() => setVisible(true), (index / 40) * totalMs);
      }
    }, { threshold: 0.05 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [index, totalMs]);

  return (
    <div ref={ref} style={{ opacity: visible ? 1 : 0, transition: 'opacity 0.15s ease' }}>
      {children}
    </div>
  );
};

// ============================================================================
// MOCKUP CHROME
// ============================================================================

const MockupChrome: React.FC<{ title: string; accent?: string; children: React.ReactNode; className?: string }> = ({ title, accent, children, className = '' }) => (
  <div className={`rounded-2xl overflow-hidden border border-white/[0.08] bg-[#0c0c11] shadow-2xl shadow-black/50 ${className}`}>
    <div className="flex items-center gap-3 px-5 py-3 border-b border-white/[0.06]">
      <div className="flex gap-1.5">
        <div className="w-2.5 h-2.5 rounded-full bg-white/[0.08]" />
        <div className="w-2.5 h-2.5 rounded-full bg-white/[0.08]" />
        <div className="w-2.5 h-2.5 rounded-full bg-white/[0.08]" />
      </div>
      <span className="mono text-[11px] tracking-[0.15em] text-white/30 ml-2">{title}</span>
      {accent && <div className="ml-auto w-2 h-2 rounded-full" style={{ backgroundColor: accent, boxShadow: `0 0 8px ${accent}60` }} />}
    </div>
    <div className="p-5 sm:p-6">{children}</div>
  </div>
);

// ============================================================================
// SECTION WRAPPER
// ============================================================================

const Section: React.FC<{ children: React.ReactNode; className?: string; id?: string }> = ({ children, className = '', id }) => (
  <section id={id} className={`py-24 sm:py-32 px-6 sm:px-10 lg:px-16 ${className}`}>
    {children}
  </section>
);

const SectionHeader: React.FC<{ headline: string; sub: string }> = ({ headline, sub }) => (
  <Reveal>
    <div className="text-center mb-14 max-w-2xl mx-auto">
      <h2 className="font-brand text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-white mb-4 leading-tight">
        {headline}
      </h2>
      <p className="text-base sm:text-lg text-white/55 leading-relaxed">{sub}</p>
    </div>
  </Reveal>
);

// ============================================================================
// FEATURE MOCKUPS (Command Center, MITRE, Threat Intel, AI Query, Library, Kanban, Quality)
// ============================================================================

const CommandCenterMockup: React.FC = () => (
  <MockupChrome title="COMMAND CENTER" accent={ACCENT}>
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
      {[
        { label: 'Coverage', value: '73%', sub: '\u21915%', color: TEAL },
        { label: 'Detections', value: '247', sub: 'total', color: BLUE },
        { label: 'Pipeline', value: '12', sub: 'active', color: ACCENT },
        { label: 'Quality', value: '91%', sub: 'score', color: TEAL },
      ].map(s => (
        <div key={s.label} className="border border-white/[0.06] rounded-lg p-4 bg-white/[0.02]">
          <div className="mono text-[10px] text-white/30 mb-1">{s.label}</div>
          <div className="font-brand text-2xl font-bold" style={{ color: s.color }}>{s.value}</div>
          <div className="mono text-[10px] text-white/25 mt-0.5">{s.sub}</div>
        </div>
      ))}
    </div>
    <div className="border border-white/[0.06] rounded-lg p-4 bg-white/[0.02] mb-5">
      <div className="mono text-[10px] text-white/30 mb-3">ATT&CK COVERAGE</div>
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
        {[
          { name: 'Recon', n: '4/6', pct: 67 },
          { name: 'Resource', n: '2/5', pct: 40 },
          { name: 'Init Access', n: '7/8', pct: 88 },
          { name: 'Execution', n: '5/9', pct: 56 },
          { name: 'Persist', n: '3/7', pct: 43 },
          { name: 'Priv Esc', n: '6/8', pct: 75 },
        ].map(t => (
          <div key={t.name}>
            <div className="mono text-[9px] text-white/35 mb-1">{t.name}</div>
            <div className="mono text-[10px] text-white/50 mb-1">{t.n}</div>
            <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${t.pct}%`, backgroundColor: t.pct > 70 ? TEAL : t.pct > 50 ? BLUE : ACCENT }} />
            </div>
          </div>
        ))}
      </div>
    </div>
    <div className="grid sm:grid-cols-2 gap-4">
      <div className="border border-white/[0.06] rounded-lg p-4 bg-white/[0.02]">
        <div className="mono text-[10px] text-white/30 mb-3">TOP THREATS</div>
        {[{ name: 'APT29', pct: 67 }, { name: 'APT41', pct: 89 }, { name: 'Lazarus', pct: 45 }, { name: 'Sandworm', pct: 78 }].map(t => (
          <div key={t.name} className="flex items-center gap-3 mb-2 last:mb-0">
            <span className="mono text-xs text-white/50 w-16">{t.name}</span>
            <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${t.pct}%`, backgroundColor: t.pct > 70 ? TEAL : t.pct > 50 ? BLUE : ACCENT }} />
            </div>
            <span className="mono text-[10px] text-white/35 w-8 text-right">{t.pct}%</span>
          </div>
        ))}
      </div>
      <div className="border border-white/[0.06] rounded-lg p-4 bg-white/[0.02]">
        <div className="mono text-[10px] text-white/30 mb-3">RECENT ACTIVITY</div>
        {[{ who: 'Amy', action: 'deployed T1566', time: '2h ago' }, { who: 'John', action: 'reviewed T1059', time: '3h ago' }, { who: 'You', action: 'created T1003', time: '5h ago' }, { who: 'Amy', action: 'imported 12 rules', time: '1d ago' }].map((a, i) => (
          <div key={i} className="flex items-center gap-2 mb-2 last:mb-0 text-xs">
            <span className="text-white/50 font-medium">{a.who}</span>
            <span className="text-white/35">{a.action}</span>
            <span className="mono text-[10px] text-white/20 ml-auto">{a.time}</span>
          </div>
        ))}
      </div>
    </div>
  </MockupChrome>
);

const AIQueryMockup: React.FC = () => (
  <MockupChrome title="AI QUERY GENERATOR" accent={BLUE}>
    <div className="flex flex-wrap items-center gap-3 mb-4">
      <span className="mono text-[10px] text-white/35 px-2.5 py-1 rounded-md border border-white/[0.06]">Gemini 2.5 Pro</span>
      <span className="mono text-[10px] text-white/35 px-2.5 py-1 rounded-md border border-white/[0.06]">Splunk SPL</span>
    </div>
    <div className="flex items-center gap-3 px-4 py-3 border border-white/[0.06] rounded-lg mb-5 bg-white/[0.03]">
      <span className="text-sm text-white/50 flex-1">Detect LSASS credential dumping via Mimikatz</span>
      <span className="cursor-blink text-white/40">|</span>
    </div>
    <div className="border border-white/[0.08] rounded-lg overflow-hidden mb-4">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.06] bg-white/[0.02]">
        <div className="flex gap-2">
          {['SPL', 'KQL', 'Sigma', 'EQL', 'YARA-L'].map((l, i) => (
            <span key={l} className={`mono text-[10px] px-2.5 py-1 rounded-md ${i === 0 ? 'bg-blue-500/15 text-blue-400/90 border border-blue-500/20' : 'text-white/30'}`}>{l}</span>
          ))}
        </div>
      </div>
      <div className="p-5 mono text-[13px] leading-[1.9] text-white/70">
        <Typewriter
          rawLengths={[30, 35, 40, 30]}
          lines={[
            <div key={0}><span className="text-blue-400">index</span>=<span className="text-green-400/80">wineventlog</span> <span className="text-blue-400">EventCode</span>=<span className="text-amber-400/80">10</span></div>,
            <div key={1}>| <span className="text-purple-400/80">where</span> <span className="text-blue-400">TargetImage</span>=<span className="text-amber-400/80">&quot;*lsass.exe&quot;</span></div>,
            <div key={2}>{'  '}AND <span className="text-blue-400">GrantedAccess</span> <span className="text-purple-400/80">IN</span> (<span className="text-amber-400/80">&quot;0x1010&quot;,&quot;0x1410&quot;</span>)</div>,
            <div key={3}>| <span className="text-purple-400/80">stats</span> <span className="text-blue-400">count</span> <span className="text-purple-400/80">by</span> <span className="text-blue-400">SourceImage</span>, <span className="text-blue-400">host</span></div>,
          ]}
        />
      </div>
    </div>
    <p className="text-sm text-white/40 leading-relaxed">Detects process access to lsass.exe with Mimikatz-style access rights (0x1010/0x1410).</p>
  </MockupChrome>
);

const ThreatIntelMockup: React.FC = () => (
  <MockupChrome title="THREAT INTELLIGENCE DIGEST" accent={ACCENT}>
    <div className="border border-white/[0.06] rounded-lg px-4 py-3 mb-5 bg-white/[0.03]">
      <span className="mono text-[10px] text-white/25 block mb-1">ANALYZING</span>
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-white/80">APT29 Midnight Blizzard Campaign Analysis</span>
        <span className="mono text-[9px] px-2 py-0.5 rounded bg-red-500/15 text-red-400/80 border border-red-500/20">CRITICAL</span>
      </div>
    </div>
    <div className="mb-5">
      <SequentialStages stages={[
        { stage: 'Summary', result: 'Executive summary extracted' },
        { stage: 'TTPs', result: '12 techniques identified' },
        { stage: 'IoCs', result: '47 indicators extracted' },
        { stage: 'Gap Analysis', result: 'Mapping against your environment...' },
        { stage: 'Detection Rules', result: '' },
      ]} />
    </div>
  </MockupChrome>
);

// PlatformShowcase is imported from ./landing/PlatformShowcase
// Old inline implementation removed — now in separate files under ./landing/
// ============================================================================
// MAIN LANDING PAGE
// ============================================================================

interface LandingPageProps { onSignIn: () => void; }

export const LandingPage: React.FC<LandingPageProps> = ({ onSignIn }) => {
  const [scrolled, setScrolled] = useState(false);
  const [showAccessModal, setShowAccessModal] = useState(false);
  const [accessEmail, setAccessEmail] = useState('');
  const [accessMessage, setAccessMessage] = useState('');
  const [accessSent, setAccessSent] = useState(false);
  const [accessError, setAccessError] = useState('');
  const [accessLoading, setAccessLoading] = useState(false);

  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', h, { passive: true });
    return () => window.removeEventListener('scroll', h);
  }, []);

  const FREE_DOMAINS = ['gmail.com','yahoo.com','hotmail.com','outlook.com','aol.com','icloud.com','mail.com','protonmail.com','zoho.com','yandex.com','live.com','msn.com','me.com','inbox.com','gmx.com'];

  const validateBusinessEmail = (email: string): string | null => {
    if (!email) return 'Email is required';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Enter a valid email address';
    const domain = email.split('@')[1]?.toLowerCase();
    if (FREE_DOMAINS.includes(domain)) return 'Please use your business email address';
    return null;
  };

  const handleAccessRequest = async () => {
    const error = validateBusinessEmail(accessEmail);
    if (error) { setAccessError(error); return; }
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
        return;
      }
    } catch {
      setAccessError('Network error. Please try again.');
      setAccessLoading(false);
      return;
    }
    setAccessLoading(false);
    setAccessSent(true);
    setTimeout(() => { setShowAccessModal(false); setAccessSent(false); setAccessEmail(''); setAccessMessage(''); }, 3000);
  };

  return (
    <div className="min-h-screen bg-[#09090b] text-white overflow-x-hidden">
      <LandingStyles />

      {/* ━━━ NAV ━━━ */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? 'bg-[#09090b]/80 backdrop-blur-xl border-b border-white/[0.06]' : ''}`}>
        <div className="w-full px-6 sm:px-10 lg:px-16 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div style={logoStyle}><Icon name="optimus-logo" className="w-7 h-7" /></div>
            <span className="font-brand font-bold text-sm tracking-[0.2em] text-white/80 hidden sm:block">OPTIMUS</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="conic-border">
              <button onClick={onSignIn}
                className="px-6 py-2.5 text-sm font-bold mono tracking-wider"
                style={{ color: ACCENT }}>
                LOG IN
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          HERO — Engine as background, text at bottom-left
          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section className="relative min-h-screen flex flex-col justify-end overflow-hidden">
        {/* ── Engine visual — positioned as background decoration ── */}
        <div className="absolute inset-0 flex items-center justify-end pointer-events-none -right-[10%]">
          <svg viewBox="0 0 800 600" className="h-full max-h-[85vh]" preserveAspectRatio="xMidYMid meet" fill="none" style={{ opacity: 0.6 }}>
            <defs>
              <filter id="glow"><feGaussianBlur stdDeviation="2" /></filter>
              <filter id="hub-glow"><feGaussianBlur stdDeviation="6" result="blur" /><feComposite in="SourceGraphic" in2="blur" operator="over" /></filter>
              <radialGradient id="blade-gradient" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#8b3d75" />
                <stop offset="100%" stopColor="#3d1230" />
              </radialGradient>
            </defs>

            {/* ── SOURCES (left side) ── */}
            {[
              { name: 'Sigma', count: '~3,083', y: 90, logo: '/logos/integrations/sigma.svg' },
              { name: 'Splunk', count: '~1,500', y: 165, logo: '/logos/integrations/splunk.svg' },
              { name: 'Elastic', count: '~1,200', y: 240, logo: '/logos/integrations/elastic.svg' },
              { name: 'Defender', count: '~500', y: 315, logo: '/logos/integrations/defender-xdr.svg' },
              { name: 'Chronicle', count: '~400', y: 390, logo: '/logos/integrations/chronicle.svg' },
              { name: 'Sentinel', count: '~800', y: 465, logo: '/logos/integrations/sentinel.svg' },
            ].map((src, i) => (
              <g key={src.name}>
                <text x="70" y={src.y} textAnchor="end" fill="white" fillOpacity="0.4" fontSize="11" fontWeight="700">{src.name}</text>
                <text x="70" y={src.y + 13} textAnchor="end" fill="white" fillOpacity="0.12" fontSize="8" fontFamily="monospace">{src.count}</text>
                <circle cx="92" cy={src.y + 2} r="13" fill="#09090b" stroke="white" strokeOpacity="0.08" />
                <image href={src.logo} x="83" y={src.y - 7} width="18" height="18" opacity="0.35" />
                <path d={`M110,${src.y + 2} C220,${src.y + 2} 270,300 350,300`} stroke="white" strokeOpacity="0.06" strokeWidth="1" strokeDasharray="4 6" />
                <path id={`in-${i}`} d={`M110,${src.y + 2} C220,${src.y + 2} 270,300 350,300`} fill="none" />
                <circle r="1.5" fill="white" filter="url(#glow)">
                  <animateMotion dur={`${3 + i * 0.4}s`} repeatCount="indefinite">
                    <mpath href={`#in-${i}`} />
                  </animateMotion>
                </circle>
              </g>
            ))}

            {/* ── TURBINE ENGINE (center) ── */}
            <g transform="translate(430, 300)">
              <circle r="85" fill="none" stroke={BLUE} strokeWidth="5" />
              <circle r="76" fill="none" stroke={BLUE} strokeWidth="1" strokeOpacity="0.3" />
              <g>
                <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="4s" repeatCount="indefinite" />
                {Array.from({ length: 16 }).map((_, i) => (
                  <path
                    key={i}
                    d="M0,-7 C10,-7 24,-17 24,-64 C24,-69 19,-69 15,-64 C7,-24 0,-17 0,-7 Z"
                    fill="url(#blade-gradient)"
                    transform={`rotate(${i * 22.5})`}
                    stroke="black"
                    strokeWidth="0.5"
                    strokeOpacity="0.2"
                  />
                ))}
              </g>
              <circle r="19" fill={BLUE} filter="url(#hub-glow)" />
            </g>

            {/* destinations removed */}
          </svg>

          {/* Fade overlay so text is readable over the visual */}
          <div className="absolute inset-0 bg-gradient-to-t from-[#09090b] via-[#09090b]/40 to-transparent" />
        </div>

        {/* ── Text content — bottom-left ── */}
        <div className="relative z-10 px-6 sm:px-10 lg:px-16 pb-16 sm:pb-20 hero-fade">
          <div className="mono text-sm sm:text-base tracking-[0.2em] text-white/50 mb-4 font-medium">DETECTION ENGINEERING PLATFORM</div>
          <h1 className="font-brand font-bold text-[clamp(2.8rem,6vw,5.5rem)] leading-[1.0] tracking-tight mb-4">
            <span className="text-white">Optimus</span><br />
            <span style={{ color: ACCENT }}>Detection Studio</span>
          </h1>
          <p className="text-lg sm:text-xl text-white/55 leading-snug max-w-xl mb-3 font-medium">
            Detection content is abundant. Everything around it is broken.
          </p>
          <p className="text-sm sm:text-base text-white/35 leading-relaxed max-w-xl mb-8">
            10,000+ public rules exist — but selecting, building, reviewing, measuring
            quality, and understanding coverage is where programs fail.
            Optimus manages the full detection lifecycle.
          </p>
          <div className="relative inline-block group">
            <div className="absolute -inset-6 rounded-[2rem] blur-3xl opacity-15 group-hover:opacity-35 transition-all duration-700" style={{ background: `radial-gradient(circle, ${ACCENT}, transparent 70%)` }} />
            <div className="conic-border">
              <button onClick={() => setShowAccessModal(true)}
                className="cta-shimmer inline-flex items-center gap-4 px-14 py-5 text-base font-black mono tracking-[0.2em] uppercase"
                style={{ color: ACCENT }}>
                Request Early Access
                <span style={{ color: ACCENT }} className="group-hover:translate-x-1 transition-transform duration-300">&rarr;</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ━━━ FEATURE SECTIONS ━━━ */}
      <PlatformShowcase />

      {/* ━━━ INTEGRATIONS ━━━ */}
      <Section className="border-t border-white/[0.06]">
        <div className="max-w-6xl mx-auto">
          <SectionHeader headline="Works with your stack." sub="Import from 6 vendor formats, convert Sigma rules across 14 target platforms, and deploy directly to your SIEM." />
          <Reveal><span className="mono text-[11px] tracking-[0.2em] text-white/30 block mb-5">DEPLOY TO</span></Reveal>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4 mb-14">
            {VENDOR_LOGOS.map((v, i) => (
              <Reveal key={v.name} delay={i * 50}>
                <div className="group border border-white/[0.06] rounded-xl p-5 flex flex-col items-center gap-3 hover:border-white/15 hover:bg-white/[0.03] transition-all duration-200 cursor-default">
                  <img src={v.path} alt={v.name} className="w-8 h-8 object-contain opacity-50 group-hover:opacity-80 transition-opacity" />
                  <div className="text-center">
                    <div className="text-sm text-white/60">{v.name}</div>
                    <div className="mono text-[10px] text-white/25 mt-1">{v.lang}</div>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
          <Reveal><span className="mono text-[11px] tracking-[0.2em] text-white/30 block mb-5">IMPORT FROM</span></Reveal>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-14">
            {IMPORT_SOURCES.map((src, i) => (
              <Reveal key={src.name} delay={i * 50}>
                <div className="border border-white/[0.06] rounded-xl p-4 sm:p-5 flex items-center gap-4 hover:border-white/15 hover:bg-white/[0.03] transition-all duration-200">
                  <img src={src.path} alt={src.name} className="w-6 h-6 object-contain opacity-50" />
                  <div>
                    <div className="text-sm text-white/60">{src.name}</div>
                    <div className="mono text-[11px] text-white/30">{src.count} rules</div>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
          <Reveal>
            <div className="flex flex-wrap justify-center gap-6 sm:gap-10 py-6 border-t border-white/[0.06] mono text-[10px] sm:text-[11px] tracking-wider text-white/25">
              <span>AES-256 ENCRYPTION</span>
              <span>ROW-LEVEL SECURITY</span>
              <span>5-TIER RBAC</span>
              <span>SOC2-READY AUDIT TRAIL</span>
            </div>
          </Reveal>
        </div>
      </Section>

      {/* ━━━ FINAL CTA ━━━ */}
      <section className="py-32 sm:py-40 px-6 sm:px-10 lg:px-16">
        <div className="max-w-3xl mx-auto text-center">
          <Reveal>
            <div style={logoStyle} className="mb-8"><Icon name="optimus-logo" className="w-14 h-14 mx-auto opacity-50" /></div>
            <h2 className="font-brand text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-white leading-tight mb-6">
              Your detection program<br />deserves an engine.
            </h2>
            <p className="text-base sm:text-lg text-white/45 leading-relaxed max-w-lg mx-auto mb-10">
              Not spreadsheets. Not scripts. An intelligent platform that manages the full detection lifecycle.
            </p>
            <div className="conic-border inline-block">
              <button onClick={() => setShowAccessModal(true)}
                className="cta-shimmer px-10 py-4 text-sm font-bold mono tracking-[0.15em] uppercase transition-all hover:scale-[1.03] hover:bg-white/[0.03]"
                style={{ color: ACCENT }}>
                Request Early Access &rarr;
              </button>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ━━━ FOOTER ━━━ */}
      <footer className="border-t border-white/[0.06] py-8 px-6 sm:px-10 lg:px-16">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div style={logoStyle}><Icon name="optimus-logo" className="w-5 h-5 opacity-40" /></div>
            <span className="mono text-[10px] tracking-[0.2em] text-white/25">OPTIMUS DETECTION STUDIO</span>
          </div>
          <span className="mono text-[10px] text-white/15">&copy; 2026</span>
        </div>
      </footer>

      {/* ━━━ ACCESS REQUEST MODAL ━━━ */}
      {showAccessModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center px-4" onClick={() => setShowAccessModal(false)}>
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div className="conic-border max-w-md w-full" onClick={e => e.stopPropagation()}>
            <div className="p-8">
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-brand text-xl font-bold text-white">Request Early Access</h3>
                <button onClick={() => setShowAccessModal(false)} className="text-white/30 hover:text-white/60 transition-colors text-xl">&times;</button>
              </div>

              {accessSent ? (
                <div className="text-center py-8">
                  <div className="w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ backgroundColor: `${TEAL}20` }}>
                    <Icon name="check" className="w-6 h-6" style={{ color: TEAL }} />
                  </div>
                  <p className="text-white/70 font-medium mb-1">Request sent!</p>
                  <p className="text-white/35 text-sm">We'll reach out to <span className="text-white/50">{accessEmail}</span> shortly.</p>
                </div>
              ) : (
                <>
                  <div className="space-y-4">
                    <div>
                      <label className="mono text-[10px] tracking-wider text-white/30 uppercase block mb-2">Business Email *</label>
                      <input
                        type="email"
                        value={accessEmail}
                        onChange={e => { setAccessEmail(e.target.value); setAccessError(''); }}
                        onBlur={() => { const err = validateBusinessEmail(accessEmail); if (err) setAccessError(err); }}
                        placeholder="you@company.com"
                        className={`w-full px-4 py-3 rounded-lg bg-white/[0.04] border text-white text-sm placeholder:text-white/20 focus:outline-none transition-colors ${accessError ? 'border-red-500/50 focus:border-red-500/70' : 'border-white/[0.08] focus:border-white/20'}`}
                      />
                      {accessError && <p className="text-red-400/80 text-xs mt-1.5">{accessError}</p>}
                    </div>
                    <div>
                      <label className="mono text-[10px] tracking-wider text-white/30 uppercase block mb-2">Tell us about your use case</label>
                      <textarea
                        value={accessMessage}
                        onChange={e => setAccessMessage(e.target.value)}
                        placeholder="e.g. We're a SOC team of 5 managing Splunk and Sentinel..."
                        rows={3}
                        className="w-full px-4 py-3 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white text-sm placeholder:text-white/20 focus:outline-none focus:border-white/20 transition-colors resize-none"
                      />
                    </div>
                  </div>
                  <button
                    onClick={handleAccessRequest}
                    disabled={!accessEmail || accessLoading}
                    className="w-full mt-6 py-3.5 rounded-lg text-sm font-bold mono tracking-wider uppercase transition-all duration-300 hover:brightness-125 disabled:opacity-30 disabled:cursor-not-allowed"
                    style={{ backgroundColor: ACCENT, color: 'white' }}>
                    {accessLoading ? 'Sending...' : 'Send Request'}
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
