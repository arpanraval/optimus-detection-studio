import React, { useState } from 'react';
import { DetectionLibraryFeature } from './features/DetectionLibraryFeature';
import { ThreatIntelFeature } from './features/ThreatIntelFeature';
import { AIQueryFeature } from './features/AIQueryFeature';
import { OptimusPrimeFeature } from './features/OptimusPrimeFeature';
import { DashboardFeature } from './features/DashboardFeature';
import { MITREFeature } from './features/MITREFeature';

const ACCENT = '#783264';

const TABS = [
  { id: 'library', label: 'Detection Library' },
  { id: 'threat-intel', label: 'Threat Intel Digest' },
  { id: 'ai-query', label: 'AI Query Generator' },
  { id: 'agent', label: 'Optimus Prime Agent' },
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'mitre', label: 'MITRE ATT&CK' },
];

const FEATURE_COMPONENTS: Record<string, React.FC> = {
  'library': DetectionLibraryFeature,
  'threat-intel': ThreatIntelFeature,
  'ai-query': AIQueryFeature,
  'agent': OptimusPrimeFeature,
  'dashboard': DashboardFeature,
  'mitre': MITREFeature,
};

export const PlatformShowcase: React.FC = () => {
  const [activeTab, setActiveTab] = useState('library');
  // No auto-scroll — tab changes swap content in place

  const ActiveComponent = FEATURE_COMPONENTS[activeTab];

  return (
    <section id="features">
      {/* ── Sticky tab bar ── */}
      <div className="sticky top-16 z-40 bg-[#09090b]/90 backdrop-blur-xl border-b border-white/[0.06]">
        <div className="max-w-7xl mx-auto px-6 sm:px-10 lg:px-16">
          <div className="flex items-center gap-1 overflow-x-auto scrollbar-none py-1">
            <span className="mono text-[10px] tracking-[0.2em] text-white/20 mr-4 shrink-0 hidden sm:block">THE PLATFORM</span>
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`mono text-[10px] sm:text-[11px] tracking-wider px-4 py-3 transition-all duration-200 whitespace-nowrap border-b-2 shrink-0 ${
                  activeTab === tab.id
                    ? 'text-white'
                    : 'text-white/30 border-transparent hover:text-white/50'
                }`}
                style={activeTab === tab.id ? { borderBottomColor: ACCENT } : undefined}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Active feature section ── */}
      <div className="max-w-7xl mx-auto">
        {ActiveComponent && <ActiveComponent />}
      </div>
    </section>
  );
};
