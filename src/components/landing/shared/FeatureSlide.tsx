import React from 'react';

const ACCENT = '#783264';

/**
 * Full-viewport feature slide layout.
 * Problem statement on top-left, mockup fills the rest.
 */
export const FeatureSlide: React.FC<{
  headline: string;
  description: string;
  children: React.ReactNode;
  className?: string;
}> = ({ headline, description, children, className = '' }) => (
  <div className={`min-h-[80vh] flex flex-col px-6 sm:px-10 lg:px-16 py-12 ${className}`}>
    {/* Problem statement */}
    <div className="mb-8 max-w-2xl">
      <h3 className="font-brand text-2xl sm:text-3xl lg:text-4xl font-bold text-white leading-tight mb-3">
        {headline}
      </h3>
      <p className="text-base sm:text-lg text-white/40 leading-relaxed">{description}</p>
    </div>

    {/* Mockup area — fills remaining space */}
    <div className="flex-1 min-h-0">
      {children}
    </div>
  </div>
);

/**
 * Mockup chrome wrapper — dark card with window dots and title bar.
 */
export const MockupFrame: React.FC<{
  title: string;
  children: React.ReactNode;
  className?: string;
  accent?: string;
}> = ({ title, children, className = '', accent }) => (
  <div className={`rounded-2xl overflow-hidden border border-white/[0.08] bg-[#0c0c11] shadow-2xl shadow-black/50 h-full ${className}`}>
    <div className="flex items-center gap-3 px-5 py-3 border-b border-white/[0.06]">
      <div className="flex gap-1.5">
        <div className="w-2.5 h-2.5 rounded-full bg-white/[0.08]" />
        <div className="w-2.5 h-2.5 rounded-full bg-white/[0.08]" />
        <div className="w-2.5 h-2.5 rounded-full bg-white/[0.08]" />
      </div>
      <span className="mono text-[11px] tracking-[0.15em] text-white/30 ml-2">{title}</span>
      {accent && <div className="ml-auto w-2 h-2 rounded-full" style={{ backgroundColor: accent, boxShadow: `0 0 8px ${accent}60` }} />}
    </div>
    <div className="p-5 sm:p-8">{children}</div>
  </div>
);

/**
 * Carousel within a feature section — horizontal slides with dots.
 */
export const FeatureCarousel: React.FC<{
  slides: { label: string; content: React.ReactNode }[];
  activeIndex: number;
  onSelect: (i: number) => void;
}> = ({ slides, activeIndex, onSelect }) => (
  <div className="h-full flex flex-col">
    {/* Slide selector pills */}
    <div className="flex flex-wrap gap-2 mb-6">
      {slides.map((slide, i) => (
        <button
          key={i}
          onClick={() => onSelect(i)}
          className={`mono text-[10px] sm:text-[11px] tracking-wider px-4 py-2 rounded-lg border transition-all duration-200 ${
            i === activeIndex
              ? 'text-white border-white/20 bg-white/[0.05]'
              : 'text-white/30 border-white/[0.06] hover:text-white/50 hover:border-white/10'
          }`}
          style={i === activeIndex ? { borderColor: `${ACCENT}50` } : undefined}
        >
          {slide.label}
        </button>
      ))}
    </div>

    {/* Active slide */}
    <div className="flex-1 min-h-0">
      {slides[activeIndex]?.content}
    </div>
  </div>
);
