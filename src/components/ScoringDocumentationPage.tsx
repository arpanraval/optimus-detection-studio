import React, { useState } from 'react';
import { Icon } from './Icon';
import { QualityWeightsPage } from './settings/QualityWeightsPage';

// =============================================================================
// TYPES
// =============================================================================

type TopTab = 'quality' | 'threat-impact';
type Section = 'overview' | 'taw' | 'tis' | 'impact' | 'gap';

interface ScoringDocumentationPageProps {
  onBack?: () => void;
}

// =============================================================================
// CURRENT WEIGHTS (as defined in materialized views)
// These are READ-ONLY - they reflect what's in the database calculations
// =============================================================================

const CURRENT_WEIGHTS = {
  // TAW calculation weights (from mv_threat_actor_weights)
  taw: {
    technique_count: 0.35,
    software_count: 0.25,
    campaign_count: 0.25,
    recency_bonus: 0.15,
  },
  // TIS calculation (from mv_technique_importance)
  tis: {
    group_taw_sum: 'Primary factor',
    software_usage: 'Secondary factor',
    campaign_usage: 'Tertiary factor',
  },
  // Impact calculation (from mv_mitigation_impact / mv_strategy_impact)
  impact: {
    taw_weighted_coverage: 'Primary (TAW sum of disrupted groups)',
    technique_breadth: 'Normalized by total techniques',
  },
};

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export const ScoringDocumentationPage: React.FC<ScoringDocumentationPageProps> = ({ onBack }) => {
  const [topTab, setTopTab] = useState<TopTab>('quality');
  const [activeSection, setActiveSection] = useState<Section>('overview');

  const navItems: { id: Section; label: string; icon: string }[] = [
    { id: 'overview', label: 'Overview', icon: 'file-text' },
    { id: 'taw', label: 'TAW Score', icon: 'users' },
    { id: 'tis', label: 'TIS Score', icon: 'target' },
    { id: 'impact', label: 'Impact Score', icon: 'trending-up' },
    { id: 'gap', label: 'Gap Score', icon: 'alert-triangle' },
  ];

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="flex-shrink-0 px-6 lg:px-8 py-5 border-b border-outline-variant/10">
        <div className="mx-auto flex items-center gap-4">
          {onBack && (
            <button
              onClick={onBack}
              className="p-2 rounded-lg text-on-surface-variant/60 hover:text-on-surface hover:bg-surface-container-highest transition-colors"
            >
              <Icon name="arrow-left" className="w-5 h-5" />
            </button>
          )}
          <div>
            <h1 className="text-xl font-semibold text-on-surface">Scoring & Intelligence</h1>
            <p className="text-sm text-on-surface-variant/60 mt-0.5">
              Configure quality scoring and review threat impact metrics
            </p>
          </div>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="flex-shrink-0 border-b border-outline-variant/10">
        <div className="px-6 lg:px-8 flex gap-1">
          <button
            onClick={() => setTopTab('quality')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              topTab === 'quality'
                ? 'border-on-surface text-on-surface'
                : 'border-transparent text-on-surface-variant/60 hover:text-on-surface hover:border-outline-variant/20'
            }`}
          >
            Quality Scoring
          </button>
          <button
            onClick={() => setTopTab('threat-impact')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              topTab === 'threat-impact'
                ? 'border-on-surface text-on-surface'
                : 'border-transparent text-on-surface-variant/60 hover:text-on-surface hover:border-outline-variant/20'
            }`}
          >
            Threat Impact (TAW/TIS/Gap)
          </button>
        </div>
      </div>

      {/* Content */}
      {topTab === 'quality' ? (
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto px-6 lg:px-8 py-6">
            <QualityWeightsPage />
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-hidden">
          <div className="h-full mx-auto px-6 lg:px-8 py-6 flex gap-6">
            {/* Sidebar Navigation */}
            <nav className="w-44 flex-shrink-0">
              <div className="space-y-1">
                {navItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setActiveSection(item.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                      activeSection === item.id
                        ? 'bg-primary/10 text-primary'
                        : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
                    }`}
                  >
                    <Icon name={item.icon} className="w-4 h-4" />
                    {item.label}
                  </button>
                ))}
              </div>
            </nav>

            {/* Main Content */}
            <div className="flex-1 overflow-y-auto pr-2">
              {activeSection === 'overview' && <OverviewSection />}
              {activeSection === 'taw' && <TAWSection />}
              {activeSection === 'tis' && <TISSection />}
              {activeSection === 'impact' && <ImpactSection />}
              {activeSection === 'gap' && <GapSection />}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// =============================================================================
// OVERVIEW SECTION
// =============================================================================

const OverviewSection: React.FC = () => (
  <div className="space-y-6">
    <div>
      <h2 className="text-lg font-semibold text-on-surface">Intelligence Overview</h2>
      <p className="text-sm text-on-surface-variant/60 mt-1">
        Optimus uses threat-weighted scoring to prioritize defenses based on real-world threat severity
      </p>
    </div>

    {/* Glossary */}
    <div className="bg-surface-container rounded-2xl border border-outline-variant/10 overflow-hidden">
      <div className="px-6 py-4 border-b border-outline-variant/10 bg-surface-container-high/30">
        <h3 className="text-base font-semibold text-on-surface">Key Terms</h3>
      </div>
      <div className="p-6 space-y-4">
        <GlossaryItem
          term="TAW"
          fullName="Threat Actor Weight"
          description="A normalized score (0-1) measuring how significant a threat group is based on their technique arsenal, associated software, and campaign activity. Higher TAW = more capable threat actor."
          color="primary"
        />
        <GlossaryItem
          term="TIS"
          fullName="Technique Importance Score"
          description="A normalized score (0-1) indicating how critical a MITRE technique is based on how many threat groups use it (weighted by their TAW), associated malware/tools, and campaign prevalence."
          color="warning"
        />
        <GlossaryItem
          term="Impact"
          fullName="Mitigation/Strategy Impact Score"
          description="A score (0-100) showing how effective a mitigation or detection strategy is at disrupting threat groups, weighted by TAW. Higher = defends against more dangerous threats."
          color="tertiary"
        />
        <GlossaryItem
          term="Gap"
          fullName="Coverage Gap Priority"
          description="Combines TIS with your current coverage status. High-TIS techniques without detections get high gap scores, helping prioritize what to build next."
          color="error"
        />
      </div>
    </div>

    {/* Flow Diagram */}
    <div className="bg-surface-container rounded-2xl border border-outline-variant/10 overflow-hidden">
      <div className="px-6 py-4 border-b border-outline-variant/10 bg-surface-container-high/30">
        <h3 className="text-base font-semibold text-on-surface">How Scores Connect</h3>
      </div>
      <div className="p-6">
        <div className="flex items-center justify-between gap-4 text-center">
          <FlowBox label="Threat Groups" sublabel="MITRE ATT&CK" color="primary" />
          <FlowArrow />
          <FlowBox label="TAW" sublabel="Group Weight" color="primary" />
          <FlowArrow />
          <FlowBox label="TIS" sublabel="Technique Priority" color="warning" />
          <FlowArrow />
          <FlowBox label="Gap Score" sublabel="What to Build" color="error" />
        </div>
        <div className="mt-6 flex items-center justify-center gap-4 text-center">
          <FlowBox label="Your Detections" sublabel="Coverage" color="tertiary" />
          <FlowArrow />
          <FlowBox label="Impact Score" sublabel="Effectiveness" color="tertiary" />
        </div>
      </div>
    </div>

    {/* Why This Matters */}
    <div className="bg-gradient-to-r from-primary/5 to-tertiary/5 rounded-2xl border border-outline-variant/10 p-6">
      <h3 className="text-base font-semibold text-on-surface mb-3">Why Weighted Scoring?</h3>
      <div className="space-y-3 text-sm text-on-surface-variant">
        <p>
          Not all threats are equal. A technique used by APT29 with extensive tooling 
          is more critical than one used by a single actor with no known campaigns.
        </p>
        <p>
          TAW-weighted scoring ensures your detection efforts prioritize real-world 
          threat severity, not just checkbox coverage.
        </p>
      </div>
    </div>
  </div>
);

// =============================================================================
// TAW SECTION
// =============================================================================

const TAWSection: React.FC = () => (
  <div className="space-y-6">
    <div>
      <h2 className="text-lg font-semibold text-on-surface">Threat Actor Weight (TAW)</h2>
      <p className="text-sm text-on-surface-variant/60 mt-1">
        How threat group significance is calculated
      </p>
    </div>

    {/* Explanation */}
    <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-6">
      <h3 className="text-sm font-semibold text-on-surface mb-3">What is TAW?</h3>
      <p className="text-sm text-on-surface-variant/60 mb-4">
        TAW scores each threat group from 0 to 1 based on their capabilities. Groups with 
        larger technique arsenals, more associated malware/tools, and active campaigns receive 
        higher scores. This weight influences all downstream calculations.
      </p>
      <div className="p-4 rounded-xl bg-surface-container-highest/50 border border-outline-variant/10">
        <p className="text-xs font-mono text-primary">
          TAW = normalize(techniques × 0.35 + software × 0.25 + campaigns × 0.25 + recency × 0.15)
        </p>
      </div>
    </div>

    {/* Component Weights */}
    <div className="bg-surface-container rounded-2xl border border-outline-variant/10 overflow-hidden">
      <div className="px-6 py-4 border-b border-outline-variant/10">
        <h3 className="text-base font-semibold text-on-surface">Component Weights</h3>
        <p className="text-xs text-on-surface-variant/50 mt-1">Current weights used in calculation</p>
      </div>
      <div className="p-6 space-y-4">
        <WeightDisplay
          label="Technique Count"
          description="Number of techniques the group uses"
          value={35}
        />
        <WeightDisplay
          label="Software Count"
          description="Associated malware and tools"
          value={25}
        />
        <WeightDisplay
          label="Campaign Count"
          description="Documented campaign activity"
          value={25}
        />
        <WeightDisplay
          label="Recency Bonus"
          description="Recent activity weighting"
          value={15}
        />
      </div>
    </div>

    {/* Examples */}
    <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-6">
      <h3 className="text-sm font-semibold text-on-surface mb-4">Example Groups</h3>
      <div className="space-y-3">
        <ExampleRow
          name="APT29 (Cozy Bear)"
          taw={0.92}
          reason="150+ techniques, 20+ tools, multiple campaigns"
        />
        <ExampleRow
          name="Lazarus Group"
          taw={0.88}
          reason="120+ techniques, extensive malware arsenal"
        />
        <ExampleRow
          name="FIN7"
          taw={0.75}
          reason="80+ techniques, focused toolset"
        />
      </div>
    </div>
  </div>
);

// =============================================================================
// TIS SECTION
// =============================================================================

const TISSection: React.FC = () => (
  <div className="space-y-6">
    <div>
      <h2 className="text-lg font-semibold text-on-surface">Technique Importance Score (TIS)</h2>
      <p className="text-sm text-on-surface-variant/60 mt-1">
        How technique criticality is calculated
      </p>
    </div>

    {/* Explanation */}
    <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-6">
      <h3 className="text-sm font-semibold text-on-surface mb-3">What is TIS?</h3>
      <p className="text-sm text-on-surface-variant/60 mb-4">
        TIS measures how important each MITRE technique is to defend against. Techniques 
        used by many high-TAW threat groups score higher than those used by few low-TAW groups.
      </p>
      <div className="p-4 rounded-xl bg-surface-container-highest/50 border border-outline-variant/10">
        <p className="text-xs font-mono text-primary">
          TIS = normalize(Σ TAW of all groups using technique)
        </p>
      </div>
    </div>

    {/* How It Works */}
    <div className="bg-surface-container rounded-2xl border border-outline-variant/10 overflow-hidden">
      <div className="px-6 py-4 border-b border-outline-variant/10">
        <h3 className="text-base font-semibold text-on-surface">Calculation Method</h3>
      </div>
      <div className="p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center flex-shrink-0">1</div>
          <div>
            <p className="text-sm font-medium text-on-surface">Sum TAW of all groups</p>
            <p className="text-xs text-on-surface-variant/60">For each technique, add up the TAW of every group that uses it</p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <div className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center flex-shrink-0">2</div>
          <div>
            <p className="text-sm font-medium text-on-surface">Factor in software usage</p>
            <p className="text-xs text-on-surface-variant/60">Techniques implemented by more malware/tools get bonus weight</p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <div className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center flex-shrink-0">3</div>
          <div>
            <p className="text-sm font-medium text-on-surface">Normalize to 0-1</p>
            <p className="text-xs text-on-surface-variant/60">Scale relative to highest-scoring technique</p>
          </div>
        </div>
      </div>
    </div>

    {/* Examples */}
    <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-6">
      <h3 className="text-sm font-semibold text-on-surface mb-4">High-TIS Techniques</h3>
      <div className="space-y-3">
        <ExampleRow
          name="T1059 - Command and Scripting Interpreter"
          taw={0.95}
          reason="Used by 140+ groups"
        />
        <ExampleRow
          name="T1082 - System Information Discovery"
          taw={0.89}
          reason="Used by 120+ groups"
        />
        <ExampleRow
          name="T1027 - Obfuscated Files or Information"
          taw={0.87}
          reason="Used by 110+ groups"
        />
      </div>
    </div>
  </div>
);

// =============================================================================
// IMPACT SECTION
// =============================================================================

const ImpactSection: React.FC = () => (
  <div className="space-y-6">
    <div>
      <h2 className="text-lg font-semibold text-on-surface">Impact Score</h2>
      <p className="text-sm text-on-surface-variant/60 mt-1">
        How mitigation and strategy effectiveness is measured
      </p>
    </div>

    {/* Explanation */}
    <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-6">
      <h3 className="text-sm font-semibold text-on-surface mb-3">What is Impact Score?</h3>
      <p className="text-sm text-on-surface-variant/60 mb-4">
        Impact Score (0-100) measures how effective a mitigation or detection strategy is 
        at defending your environment. It's based on how many threat groups you disrupt, 
        weighted by their TAW.
      </p>
      <div className="p-4 rounded-xl bg-surface-container-highest/50 border border-outline-variant/10">
        <p className="text-xs font-mono text-primary">
          Impact = (Σ TAW of disrupted groups / Σ TAW of all groups) × 100
        </p>
      </div>
    </div>

    {/* Mitigation vs Strategy */}
    <div className="grid grid-cols-2 gap-4">
      <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-5">
        <h3 className="text-sm font-semibold text-on-surface mb-2">Mitigation Impact</h3>
        <p className="text-xs text-on-surface-variant/60 mb-3">
          For MITRE mitigations (M1xxx), impact measures how many groups are affected 
          by implementing the control.
        </p>
        <div className="text-xs text-tertiary">
          Example: M1038 (Execution Prevention) → Impact 95
        </div>
      </div>
      <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-5">
        <h3 className="text-sm font-semibold text-on-surface mb-2">Strategy Impact</h3>
        <p className="text-xs text-on-surface-variant/60 mb-3">
          For detection strategies, impact measures how many groups you can detect 
          if you implement the strategy.
        </p>
        <div className="text-xs text-tertiary">
          Example: Process monitoring strategy → Impact 78
        </div>
      </div>
    </div>

    {/* Score Interpretation */}
    <div className="bg-surface-container rounded-2xl border border-outline-variant/10 overflow-hidden">
      <div className="px-6 py-4 border-b border-outline-variant/10">
        <h3 className="text-base font-semibold text-on-surface">Score Ranges</h3>
      </div>
      <div className="p-6 space-y-3">
        <ScoreRange range="90-100" label="Critical" color="error" description="Disrupts vast majority of threat landscape" />
        <ScoreRange range="75-89" label="High" color="warning" description="Major defensive improvement" />
        <ScoreRange range="50-74" label="Medium" color="primary" description="Solid coverage contribution" />
        <ScoreRange range="25-49" label="Low" color="on-surface-variant" description="Limited but useful coverage" />
        <ScoreRange range="0-24" label="Minimal" color="on-surface-variant/50" description="Narrow applicability" />
      </div>
    </div>
  </div>
);

// =============================================================================
// GAP SECTION
// =============================================================================

const GapSection: React.FC = () => (
  <div className="space-y-6">
    <div>
      <h2 className="text-lg font-semibold text-on-surface">Gap Score</h2>
      <p className="text-sm text-on-surface-variant/60 mt-1">
        How coverage gaps are prioritized
      </p>
    </div>

    {/* Explanation */}
    <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-6">
      <h3 className="text-sm font-semibold text-on-surface mb-3">What is Gap Score?</h3>
      <p className="text-sm text-on-surface-variant/60 mb-4">
        Gap Score helps you decide which techniques to build detections for first. 
        It combines technique importance (TIS) with your current coverage status.
      </p>
      <div className="p-4 rounded-xl bg-surface-container-highest/50 border border-outline-variant/10">
        <p className="text-xs font-mono text-primary">
          Gap Score = TIS × (1 - coverage_ratio)
        </p>
      </div>
    </div>

    {/* How It Works */}
    <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-6">
      <h3 className="text-sm font-semibold text-on-surface mb-4">Prioritization Logic</h3>
      <div className="space-y-4">
        <div className="flex items-start gap-4 p-4 rounded-xl bg-error/5 border border-error/10">
          <div className="text-2xl">🔴</div>
          <div>
            <p className="text-sm font-medium text-on-surface">High TIS + No Coverage = High Gap</p>
            <p className="text-xs text-on-surface-variant/60">Critical technique with zero detections → Build this first</p>
          </div>
        </div>
        <div className="flex items-start gap-4 p-4 rounded-xl bg-warning/5 border border-warning/10">
          <div className="text-2xl">🟡</div>
          <div>
            <p className="text-sm font-medium text-on-surface">High TIS + Partial Coverage = Medium Gap</p>
            <p className="text-xs text-on-surface-variant/60">Important technique with some detections → Consider expanding</p>
          </div>
        </div>
        <div className="flex items-start gap-4 p-4 rounded-xl bg-tertiary/5 border border-tertiary/10">
          <div className="text-2xl">🟢</div>
          <div>
            <p className="text-sm font-medium text-on-surface">Low TIS or Full Coverage = Low/No Gap</p>
            <p className="text-xs text-on-surface-variant/60">Either not critical or already covered → Lower priority</p>
          </div>
        </div>
      </div>
    </div>

    {/* Where You See It */}
    <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-6">
      <h3 className="text-sm font-semibold text-on-surface mb-3">Where Gap Scores Appear</h3>
      <ul className="space-y-2 text-sm text-on-surface-variant">
        <li className="flex items-center gap-2">
          <Icon name="chevron-right" className="w-4 h-4 text-primary" />
          <span><strong className="text-on-surface">Coverage Analytics</strong> → MITRE Intelligence tab</span>
        </li>
        <li className="flex items-center gap-2">
          <Icon name="chevron-right" className="w-4 h-4 text-primary" />
          <span><strong className="text-on-surface">Defensive Posture</strong> → Priority Gaps section</span>
        </li>
        <li className="flex items-center gap-2">
          <Icon name="chevron-right" className="w-4 h-4 text-primary" />
          <span><strong className="text-on-surface">Quick Wins</strong> → Recommended next detections</span>
        </li>
      </ul>
    </div>
  </div>
);

// =============================================================================
// HELPER COMPONENTS
// =============================================================================

const GlossaryItem: React.FC<{
  term: string;
  fullName: string;
  description: string;
  color: 'primary' | 'tertiary' | 'warning' | 'error';
}> = ({ term, fullName, description, color }) => {
  const colorClasses = {
    primary: 'bg-primary/10 text-primary border-primary/20',
    tertiary: 'bg-tertiary/10 text-tertiary border-tertiary/20',
    warning: 'bg-warning/10 text-warning border-warning/20',
    error: 'bg-error/10 text-error border-error/20',
  };

  return (
    <div className="flex gap-4 p-4 rounded-xl bg-surface-container-high/30 border border-outline-variant/5">
      <div className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-sm font-bold border ${colorClasses[color]}`}>
        {term}
      </div>
      <div>
        <p className="text-sm font-medium text-on-surface">{fullName}</p>
        <p className="text-sm text-on-surface-variant/60 mt-1">{description}</p>
      </div>
    </div>
  );
};

const FlowBox: React.FC<{ label: string; sublabel: string; color: string }> = ({ label, sublabel, color }) => (
  <div className={`px-4 py-3 rounded-xl bg-${color}/10 border border-${color}/20`}>
    <p className={`text-sm font-semibold text-${color}`}>{label}</p>
    <p className="text-xs text-on-surface-variant/50">{sublabel}</p>
  </div>
);

const FlowArrow: React.FC = () => (
  <Icon name="chevron-right" className="w-5 h-5 text-on-surface-variant/30" />
);

const WeightDisplay: React.FC<{
  label: string;
  description: string;
  value: number;
}> = ({ label, description, value }) => (
  <div className="flex items-center justify-between py-3 border-b border-outline-variant/5 last:border-0">
    <div>
      <p className="text-sm font-medium text-on-surface">{label}</p>
      <p className="text-xs text-on-surface-variant/50">{description}</p>
    </div>
    <div className="flex items-center gap-3">
      <div className="w-24 h-2 bg-surface-container-high rounded-full overflow-hidden">
        <div className="h-full bg-primary rounded-full" style={{ width: `${value}%` }} />
      </div>
      <span className="text-sm font-mono text-on-surface w-10 text-right">{value}%</span>
    </div>
  </div>
);

const ExampleRow: React.FC<{
  name: string;
  taw: number;
  reason: string;
}> = ({ name, taw, reason }) => (
  <div className="flex items-center justify-between p-3 rounded-xl bg-surface-container-high/30">
    <div>
      <p className="text-sm font-medium text-on-surface">{name}</p>
      <p className="text-xs text-on-surface-variant/50">{reason}</p>
    </div>
    <div className="text-right">
      <span className="text-lg font-bold text-primary">{taw.toFixed(2)}</span>
    </div>
  </div>
);

const ScoreRange: React.FC<{
  range: string;
  label: string;
  color: string;
  description: string;
}> = ({ range, label, color, description }) => (
  <div className="flex items-center gap-4">
    <span className="text-sm font-mono text-on-surface-variant w-16">{range}</span>
    <span className={`text-sm font-semibold text-${color} w-20`}>{label}</span>
    <span className="text-sm text-on-surface-variant/60">{description}</span>
  </div>
);

export default ScoringDocumentationPage;
