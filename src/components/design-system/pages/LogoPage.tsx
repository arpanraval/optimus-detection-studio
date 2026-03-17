import React from 'react';
import { DesignSystemPage, Section } from '../shared';

// ============================================================================
// BRAND COLORS
// ============================================================================

const BLUE = '#005091';
const MAGENTA = '#783264';
const TEAL = '#4D7C6F';

// ============================================================================
// LOGO VARIATION A: CURRENT — Turbine with thick blades
// The existing production logo — 14 wide blades, double ring, center hub
// ============================================================================

const LogoA: React.FC<{ size: number }> = ({ size }) => {
  const blades = Array.from({ length: 14 }).map((_, i) => (
    <path
      key={i}
      d="M12 12 L12 2 C13.5 2 14.5 3.5 14 5 L12 12 Z"
      fill={MAGENTA}
      transform={`rotate(${i * (360 / 14)} 12 12)`}
      opacity="0.85"
    />
  ));

  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" width={size} height={size}>
      <circle cx="12" cy="12" r="11" stroke={BLUE} strokeWidth="1.2" />
      <circle cx="12" cy="12" r="9" stroke={BLUE} strokeWidth="0.5" opacity="0.5" />
      <g>{blades}</g>
      <circle cx="12" cy="12" r="3" fill={BLUE} />
      <path d="M12 12 L12 9.5 A 2.5 2.5 0 0 1 14.5 12" stroke="rgba(255,255,255,0.5)" strokeWidth="0.5" fill="none" />
    </svg>
  );
};

// ============================================================================
// LOGO VARIATION B: REFINED TURBINE — Fewer, cleaner blades
// 10 blades with cleaner geometry, single outer ring, larger hub
// ============================================================================

const LogoB: React.FC<{ size: number }> = ({ size }) => {
  const blades = Array.from({ length: 10 }).map((_, i) => (
    <path
      key={i}
      d="M12 12 L11.2 3.5 C11.5 2.8 12.5 2.8 12.8 3.5 L12 12 Z"
      fill={MAGENTA}
      transform={`rotate(${i * 36} 12 12)`}
      opacity="0.9"
    />
  ));

  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" width={size} height={size}>
      <circle cx="12" cy="12" r="11" stroke={BLUE} strokeWidth="1" />
      <g>{blades}</g>
      <circle cx="12" cy="12" r="3.5" fill={BLUE} />
      <circle cx="12" cy="12" r="1.5" fill="white" opacity="0.2" />
    </svg>
  );
};

// ============================================================================
// LOGO VARIATION C: CURVED BLADES — More dynamic, turbine-like
// 12 curved blades that arc outward for a more realistic turbine feel
// ============================================================================

const LogoC: React.FC<{ size: number }> = ({ size }) => {
  const blades = Array.from({ length: 12 }).map((_, i) => (
    <path
      key={i}
      d="M12 12 Q10 6 12 2.5 Q14 6 12 12 Z"
      fill={MAGENTA}
      transform={`rotate(${i * 30} 12 12)`}
      opacity="0.85"
    />
  ));

  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" width={size} height={size}>
      <circle cx="12" cy="12" r="11" stroke={BLUE} strokeWidth="1" />
      <circle cx="12" cy="12" r="9.5" stroke={BLUE} strokeWidth="0.3" opacity="0.3" />
      <g>{blades}</g>
      <circle cx="12" cy="12" r="3" fill={BLUE} />
      <circle cx="12" cy="12" r="1.2" fill="white" opacity="0.15" />
    </svg>
  );
};

// ============================================================================
// LOGO VARIATION D: SWEPT BLADES — Asymmetric blade shape
// 8 wider swept blades with a more aggressive, engineered look
// ============================================================================

const LogoD: React.FC<{ size: number }> = ({ size }) => {
  const blades = Array.from({ length: 8 }).map((_, i) => (
    <path
      key={i}
      d="M12 12 L10.5 4 C11 2.5 12 2 12.5 2.5 L14 5 L12 12 Z"
      fill={MAGENTA}
      transform={`rotate(${i * 45} 12 12)`}
      opacity="0.85"
    />
  ));

  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" width={size} height={size}>
      <circle cx="12" cy="12" r="11" stroke={BLUE} strokeWidth="1" />
      <g>{blades}</g>
      <circle cx="12" cy="12" r="3.5" fill={BLUE} />
      <circle cx="12" cy="12" r="2" fill={MAGENTA} opacity="0.3" />
      <circle cx="12" cy="12" r="1" fill="white" opacity="0.2" />
    </svg>
  );
};

// ============================================================================
// LOGO VARIATION E: SLEEK MINIMAL — Thin blades, single ring
// 16 very thin blades radiating out, minimal clean look
// ============================================================================

const LogoE: React.FC<{ size: number }> = ({ size }) => {
  const blades = Array.from({ length: 16 }).map((_, i) => (
    <line
      key={i}
      x1="12" y1="12" x2="12" y2="3"
      stroke={MAGENTA}
      strokeWidth="0.8"
      strokeLinecap="round"
      transform={`rotate(${i * 22.5} 12 12)`}
      opacity="0.8"
    />
  ));

  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" width={size} height={size}>
      <circle cx="12" cy="12" r="11" stroke={BLUE} strokeWidth="0.8" />
      <g>{blades}</g>
      <circle cx="12" cy="12" r="3" fill={BLUE} />
      <circle cx="12" cy="12" r="1.5" fill={MAGENTA} opacity="0.4" />
    </svg>
  );
};

// ============================================================================
// LOGO VARIATION F: PROPELLER — 6 wide propeller blades
// Bolder, fewer blades with more surface area — like a jet engine fan
// ============================================================================

const LogoF: React.FC<{ size: number }> = ({ size }) => {
  const blades = Array.from({ length: 6 }).map((_, i) => (
    <path
      key={i}
      d="M12 12 L10 4 C10.5 2 13.5 2 14 4 L12 12 Z"
      fill={MAGENTA}
      transform={`rotate(${i * 60} 12 12)`}
      opacity="0.85"
    />
  ));

  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" width={size} height={size}>
      <circle cx="12" cy="12" r="11" stroke={BLUE} strokeWidth="1" />
      <g>{blades}</g>
      <circle cx="12" cy="12" r="4" fill={BLUE} />
      <circle cx="12" cy="12" r="2" fill="white" opacity="0.1" />
    </svg>
  );
};

// ============================================================================
// LOGO VARIATION G: DOUBLE RING — Two distinct rings
// Outer blue ring, gap, inner magenta ring, blades inside
// ============================================================================

const LogoG: React.FC<{ size: number }> = ({ size }) => {
  const blades = Array.from({ length: 12 }).map((_, i) => (
    <path
      key={i}
      d="M12 12 L11.4 4.5 C11.6 3.5 12.4 3.5 12.6 4.5 L12 12 Z"
      fill={MAGENTA}
      transform={`rotate(${i * 30} 12 12)`}
      opacity="0.85"
    />
  ));

  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" width={size} height={size}>
      <circle cx="12" cy="12" r="11" stroke={BLUE} strokeWidth="0.8" />
      <circle cx="12" cy="12" r="9" stroke={MAGENTA} strokeWidth="0.6" opacity="0.5" />
      <g>{blades}</g>
      <circle cx="12" cy="12" r="3" fill={BLUE} />
      <circle cx="12" cy="12" r="1.5" fill={MAGENTA} opacity="0.3" />
    </svg>
  );
};

// ============================================================================
// LOGO VARIATION H: GRADIENT FILL BLADES
// Blades transition from magenta to blue toward the tips
// ============================================================================

const LogoH: React.FC<{ size: number }> = ({ size }) => {
  const blades = Array.from({ length: 12 }).map((_, i) => (
    <path
      key={i}
      d="M12 12 L11.3 3.5 C11.5 2.5 12.5 2.5 12.7 3.5 L12 12 Z"
      fill={`url(#bladeGrad-${size})`}
      transform={`rotate(${i * 30} 12 12)`}
      opacity="0.9"
    />
  ));

  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" width={size} height={size}>
      <defs>
        <radialGradient id={`bladeGrad-${size}`} cx="50%" cy="50%" r="50%">
          <stop offset="30%" stopColor={MAGENTA} />
          <stop offset="100%" stopColor={BLUE} />
        </radialGradient>
      </defs>
      <circle cx="12" cy="12" r="11" stroke={BLUE} strokeWidth="1" />
      <g>{blades}</g>
      <circle cx="12" cy="12" r="3.2" fill={BLUE} />
      <circle cx="12" cy="12" r="1.5" fill={MAGENTA} opacity="0.3" />
    </svg>
  );
};

// ============================================================================
// PREVIEW CARD
// ============================================================================

interface LogoVariation {
  id: string;
  name: string;
  description: string;
  component: React.FC<{ size: number }>;
}

const variations: LogoVariation[] = [
  { id: 'a', name: 'A — Current (14 Wide Blades)', description: 'The existing production logo. 14 wide blades, double ring, solid hub. Dense and detailed.', component: LogoA },
  { id: 'b', name: 'B — Refined (10 Clean Blades)', description: '10 blades with cleaner tapered geometry. Single ring. Reads better at small sizes.', component: LogoB },
  { id: 'c', name: 'C — Curved Blades', description: '12 blades that arc outward with a leaf/petal shape. More organic, dynamic feel.', component: LogoC },
  { id: 'd', name: 'D — Swept (8 Blades)', description: '8 wider swept blades with an aggressive, engineered look. Bolder at large sizes.', component: LogoD },
  { id: 'e', name: 'E — Sleek Minimal (Thin Lines)', description: '16 thin line blades radiating out. Ultra-minimal, works well as a monogram or favicon.', component: LogoE },
  { id: 'f', name: 'F — Propeller (6 Wide)', description: '6 wide propeller blades. Bold and simple — reads clearly even at very small sizes.', component: LogoF },
  { id: 'g', name: 'G — Double Ring', description: 'Blue outer ring + magenta inner ring with 12 tapered blades. Two-tone ring adds depth.', component: LogoG },
  { id: 'h', name: 'H — Gradient Blades', description: '12 blades with a radial gradient from magenta (center) to blue (tips). Adds dimensionality.', component: LogoH },
];

const PreviewCard: React.FC<{ variation: LogoVariation }> = ({ variation }) => {
  const Logo = variation.component;
  return (
    <div className="bg-surface-container rounded-2xl border border-outline-variant/20 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-outline-variant/10">
        <h3 className="text-base font-bold text-on-surface">{variation.name}</h3>
        <p className="text-xs text-on-surface-variant/60 mt-0.5">{variation.description}</p>
      </div>

      {/* Size previews on dark + light */}
      <div className="flex">
        <div className="flex-1 flex items-center justify-center gap-5 py-8 px-4 bg-[#08080A]">
          <Logo size={28} />
          <Logo size={48} />
          <Logo size={72} />
          <Logo size={104} />
        </div>
        <div className="flex-1 flex items-center justify-center gap-5 py-8 px-4 bg-[#FAFCFF]">
          <Logo size={28} />
          <Logo size={48} />
          <Logo size={72} />
          <Logo size={104} />
        </div>
      </div>

      {/* In-context: with brand name */}
      <div className="border-t border-outline-variant/10 px-6 py-5 flex items-center gap-10">
        <div className="flex items-center gap-3 bg-[#08080A] px-5 py-3 rounded-xl">
          <Logo size={36} />
          <div>
            <span className="font-brand font-bold text-white text-sm tracking-widest block leading-tight">OPTIMUS</span>
            <span className="text-[8px] tracking-[0.15em] uppercase text-white/30">Detection Studio</span>
          </div>
        </div>
        <div className="flex items-center gap-3 bg-[#f5f3f0] px-5 py-3 rounded-xl">
          <Logo size={36} />
          <div>
            <span className="font-brand font-bold text-gray-900 text-sm tracking-widest block leading-tight">OPTIMUS</span>
            <span className="text-[8px] tracking-[0.15em] uppercase text-gray-400">Detection Studio</span>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// PAGE
// ============================================================================

export const LogoPage: React.FC = () => {
  return (
    <DesignSystemPage
      title="Logo Variations"
      description="8 turbine logo variations exploring blade count, shape, and style. All use the brand palette — blue #005091 (ring/hub) and magenta #783264 (blades). Shown at 4 sizes on dark and light backgrounds, plus in-context with the brand name."
    >
      <Section title="Color Reference" description="Brand colors used across all variations">
        <div className="flex flex-wrap gap-4 mb-2">
          {[
            { color: BLUE, label: 'Blue (Ring/Hub)', hex: '#005091' },
            { color: MAGENTA, label: 'Magenta (Blades)', hex: '#783264' },
            { color: TEAL, label: 'Teal (Secondary)', hex: '#4D7C6F' },
          ].map((c) => (
            <div key={c.hex} className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg shadow-sm" style={{ backgroundColor: c.color }} />
              <div>
                <p className="text-xs font-semibold text-on-surface">{c.label}</p>
                <p className="text-[10px] font-mono text-on-surface-variant/50">{c.hex}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Variations" description="Click any variation to compare. Each shown at 28px, 48px, 72px, and 104px.">
        <div className="space-y-6">
          {variations.map((v) => (
            <PreviewCard key={v.id} variation={v} />
          ))}
        </div>
      </Section>
    </DesignSystemPage>
  );
};
