import React, { useState, useEffect, useRef } from 'react';
import { Icon } from './Icon';
import './new-landing/tokens/landing.css';
import { PlatformShowcase } from './new-landing/PlatformShowcase';
import { LibraryViewMockup } from './new-landing/features/DetectionLibraryFeature';

// ============================================================================
// CONSTANTS & COLORS
// ============================================================================

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
    <div className="landing-root min-h-screen relative">
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
              ? 'bg-surface shadow-[0_12px_40px_-16px_rgba(0,0,0,0.12)] border-outline-variant/60 py-3.5'
              : 'bg-transparent border-transparent py-5'
          }`}
        >
          <div className="flex items-center gap-3 cursor-pointer group">
            <Icon name="optimus-logo" className="w-8 h-8 text-primary group-hover:rotate-[30deg] group-hover:scale-110 transition-all duration-500" />
            <div className="flex flex-col leading-none">
              <span className="font-brand font-black text-sm tracking-[0.25em] text-on-surface uppercase text-gradient-white">OPTIMUS</span>
              <span className="mono text-[8px] tracking-[0.3em] text-on-surface-variant uppercase mt-1">Detection Studio</span>
            </div>
          </div>
          <button
            onClick={onSignIn}
            className="btn-outline px-6 py-2 text-[11px] font-semibold tracking-wide transition-all"
          >
            Sign in
          </button>
        </div>
      </nav>

      {/* ━━━ HERO SECTION — Product-first ━━━ */}
      <section className="relative min-h-screen flex items-center pt-28 pb-20 overflow-hidden">
        <div className="max-w-[1600px] w-full mx-auto px-6 sm:px-10 grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-center relative z-10">

          {/* Left: copy column */}
          <div className="lg:col-span-5">
            <ScrollReveal>
              <div className="inline-flex items-center gap-2.5 px-3 py-1.5 rounded-full border border-outline-variant bg-surface-container-low mb-7">
                <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                <span className="mono text-[9px] font-bold tracking-[0.3em] text-primary uppercase">Detection Studio · Private Beta</span>
              </div>
            </ScrollReveal>

            <ScrollReveal delay={100}>
              <h1 className="font-brand font-bold leading-[1.02] tracking-tight mb-7">
                <span className="block text-[clamp(2.5rem,5.2vw,4.5rem)] text-on-surface">Detection content</span>
                <span className="block text-[clamp(2.5rem,5.2vw,4.5rem)] text-on-surface">is <span className="text-gradient-cyber">abundant.</span></span>
                <span className="block text-[clamp(2.5rem,5.2vw,4.5rem)] text-on-surface mt-2">Everything around</span>
                <span className="block text-[clamp(2.5rem,5.2vw,4.5rem)] text-on-surface">it is broken.</span>
              </h1>
            </ScrollReveal>

            <ScrollReveal delay={180}>
              <p className="text-base sm:text-lg text-on-surface-variant leading-relaxed mb-9 max-w-md font-light">
                One catalog for every rule you run. Continuous coverage checks against emerging threats. A conversational agent that knows your library. All the engineering glue your SOC has been duct-taping by hand.
              </p>
            </ScrollReveal>

            <ScrollReveal delay={260}>
              <div className="flex flex-wrap gap-4 items-center">
                <button
                  onClick={() => setShowAccessModal(true)}
                  className="btn-primary px-9 py-4 text-sm font-semibold tracking-wide"
                >
                  Request early access
                </button>
                <a
                  href="#features"
                  className="btn-outline px-7 py-4 text-sm font-semibold tracking-wide flex items-center gap-2 group"
                >
                  See it in action <span className="group-hover:translate-y-1 transition-transform duration-300">↓</span>
                </a>
              </div>
            </ScrollReveal>
          </div>

          {/* Right: product mockup anchor */}
          <div className="lg:col-span-7 relative">
            <ScrollReveal delay={140}>
              <div className="hero-mockup-shell">
                <LibraryViewMockup />
              </div>
            </ScrollReveal>
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
            <h2 className="font-brand text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-6 text-gradient-white">Translate between every SIEM you run.</h2>
            <p className="text-base sm:text-lg text-on-surface-variant leading-relaxed font-light">
              Ingest detections from public sources, translate Sigma into 14 SIEM dialects in the browser, and deploy directly into the platforms your team already uses.
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
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[900px] bg-[radial-gradient(circle,rgba(120,50,100,0.10)_0%,transparent_60%)] filter blur-3xl pointer-events-none" />

        <div className="max-w-3xl mx-auto text-center relative z-10 flex flex-col items-center">
          <ScrollReveal>
            <h2 className="font-brand text-[clamp(2.5rem,5.5vw,4.5rem)] font-bold tracking-tight leading-[1.02] mb-6 text-gradient-white">
              Bring order to your <span className="text-gradient-cyber">detection program</span>.
            </h2>
            <p className="text-base sm:text-lg text-on-surface-variant leading-relaxed max-w-xl mx-auto mb-12 font-light">
              Centralize your rules, close coverage gaps, and ship detections across every SIEM you run — in one workspace.
            </p>
            <button
              onClick={() => setShowAccessModal(true)}
              className="btn-primary px-12 py-5 text-sm font-semibold tracking-wide"
            >
              Request early access
            </button>
          </ScrollReveal>
        </div>
      </section>

      {/* ━━━ FOOTER ━━━ */}
      <footer className="relative z-10 border-t border-outline-variant/60 py-12 px-6 sm:px-12 bg-surface-container-low">
        <div className="max-w-[1500px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <Icon name="optimus-logo" className="w-6 h-6 text-primary" />
            <span className="mono text-[10px] font-bold tracking-[0.25em] text-on-surface-variant uppercase">Optimus Detection Studio</span>
          </div>
          <span className="mono text-[9px] text-outline tracking-wider font-medium">&copy; 2026 Optimus Detection Studio</span>
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
                  <h3 className="font-brand text-2xl font-bold tracking-tight text-gradient-white">Request early access</h3>
                  <p className="text-xs text-on-surface-variant mt-1.5">Tell us a bit about your team and we'll be in touch.</p>
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
                  <div className="w-16 h-16 rounded-full mx-auto mb-6 flex items-center justify-center bg-tertiary-container border border-tertiary/30">
                    <Icon name="check" className="w-8 h-8 text-tertiary" />
                  </div>
                  <p className="text-xl font-bold text-gradient-white mb-2">Request received.</p>
                  <p className="text-on-surface-variant text-sm font-light">We'll follow up at <span className="text-on-surface font-medium">{accessEmail}</span> shortly.</p>
                </div>
              ) : (
                <>
                  <div className="space-y-5">
                    <div>
                      <label className="text-xs font-semibold text-on-surface block mb-2">Work email</label>
                      <input
                        type="email"
                        value={accessEmail}
                        onChange={e => { setAccessEmail(e.target.value); setAccessError(''); }}
                        onBlur={() => { const err = validateBusinessEmail(accessEmail); if (err) setAccessError(err); }}
                        placeholder="you@company.com"
                        className={`w-full px-4 py-3 rounded-xl bg-surface-container-low border text-on-surface text-sm placeholder:text-outline focus:outline-none transition-all ${
                          accessError
                            ? 'border-red-500/50 focus:border-red-500 focus:bg-red-500/5'
                            : 'border-outline-variant focus:border-primary focus:bg-surface-container-high'
                        }`}
                      />
                      {accessError && <p className="text-red-500 text-xs mt-2 font-medium">{accessError}</p>}
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-on-surface block mb-2">What are you trying to fix? <span className="text-on-surface-variant font-normal">(optional)</span></label>
                      <textarea
                        value={accessMessage}
                        onChange={e => setAccessMessage(e.target.value)}
                        placeholder="Your SIEM stack, team size, and what's painful today (e.g. drowning in Sigma rules, coverage gaps, multi-SIEM translation)..."
                        rows={3}
                        className="w-full px-4 py-3 rounded-xl bg-surface-container-low border border-outline-variant text-on-surface text-sm placeholder:text-outline focus:outline-none focus:border-primary focus:bg-surface-container-high transition-all resize-none"
                      />
                    </div>
                  </div>
                  <button
                    onClick={handleAccessRequest}
                    disabled={!accessEmail || accessLoading}
                    className="btn-primary w-full mt-7 py-4 text-sm font-semibold tracking-wide transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {accessLoading ? 'Sending…' : 'Submit request'}
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
