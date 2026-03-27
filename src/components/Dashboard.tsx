
import React, { useMemo } from 'react';
import { Detection, Status, Severity } from '../types';
import { useLibrary } from '../context/LibraryContext';
import { Icon } from './Icon';
import { Skeleton, EmptyState } from './ui';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

interface DashboardProps {
  detections: Detection[];
  onNavigate: (view: string, filter?: any) => void;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const TACTIC_ORDER = [
  { id: 'TA0043', name: 'Reconnaissance', shortname: 'reconnaissance' },
  { id: 'TA0042', name: 'Resource Dev', shortname: 'resource-development' },
  { id: 'TA0001', name: 'Initial Access', shortname: 'initial-access' },
  { id: 'TA0002', name: 'Execution', shortname: 'execution' },
  { id: 'TA0003', name: 'Persistence', shortname: 'persistence' },
  { id: 'TA0004', name: 'Priv Escalation', shortname: 'privilege-escalation' },
  { id: 'TA0005', name: 'Defense Evasion', shortname: 'defense-evasion' },
  { id: 'TA0006', name: 'Credential Access', shortname: 'credential-access' },
  { id: 'TA0007', name: 'Discovery', shortname: 'discovery' },
  { id: 'TA0008', name: 'Lateral Movement', shortname: 'lateral-movement' },
  { id: 'TA0009', name: 'Collection', shortname: 'collection' },
  { id: 'TA0011', name: 'C2', shortname: 'command-and-control' },
  { id: 'TA0010', name: 'Exfiltration', shortname: 'exfiltration' },
  { id: 'TA0040', name: 'Impact', shortname: 'impact' },
];

const COLORS = {
  production: '#10b981', // Emerald
  testing: '#0ea5e9',    // Sky
  development: '#f59e0b', // Amber
  draft: '#64748b',      // Slate
};

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

/**
 * Big Metric Card - Typography focused, no icons
 */
const MetricCard: React.FC<{
  label: string;
  value: number | string;
  sublabel?: string;
  onClick?: () => void;
  accentColor?: string;
}> = ({ label, value, sublabel, onClick, accentColor = 'text-primary' }) => (
  <div 
    onClick={onClick}
    className={`
      relative overflow-hidden bg-surface-container-low border border-outline-variant/30 rounded-2xl p-6
      transition-all duration-200 group
      ${onClick ? 'cursor-pointer hover:border-primary/30 hover:bg-surface-container' : ''}
    `}
  >
    <div className="relative z-10">
      <div className="flex items-baseline gap-1">
        <span className={`text-5xl font-brand font-bold tracking-tight ${accentColor} drop-shadow-sm`}>
          {value}
        </span>
      </div>
      <h3 className="text-sm font-bold text-on-surface uppercase tracking-wider mt-2">{label}</h3>
      {sublabel && <p className="text-xs text-on-surface-variant mt-1">{sublabel}</p>}
    </div>
    
    {/* Subtle Glow Effect */}
    <div className={`absolute -right-4 -bottom-4 w-24 h-24 rounded-full opacity-5 blur-2xl group-hover:opacity-10 transition-opacity bg-current ${accentColor}`} />
  </div>
);

/**
 * Sleek Tactic Card - Minimalist, heatmap indicator
 */
const TacticCard: React.FC<{
  name: string;
  count: number;
  maxCount: number;
  onClick: () => void;
}> = ({ name, count, maxCount, onClick }) => {
  // Calculate heat intensity (0.2 to 1.0 opacity)
  const intensity = maxCount > 0 ? 0.2 + (count / maxCount) * 0.8 : 0.1;
  const barColor = count === 0 ? 'bg-outline-variant/20' : 'bg-primary';
  const textColor = count === 0 ? 'text-on-surface-variant/50' : 'text-on-surface';

  return (
    <div 
      onClick={onClick}
      className="group flex flex-col bg-surface-container-low border border-outline-variant/20 rounded-lg overflow-hidden cursor-pointer hover:bg-surface-container transition-colors relative"
    >
      {/* Heat Strip */}
      <div className="h-1 w-full bg-surface-container-highest">
        <div 
          className={`h-full transition-all duration-500 ${barColor}`} 
          style={{ width: '100%', opacity: count > 0 ? intensity : 1 }} 
        />
      </div>
      
      <div className="p-4 flex flex-col justify-between h-full">
        <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-2 truncate">
          {name}
        </span>
        <div className="flex items-end justify-between">
          <span className={`text-2xl font-mono font-bold ${textColor}`}>
            {count}
          </span>
          {count > 0 && (
            <span className="text-[9px] text-primary font-medium bg-primary/10 px-1.5 py-0.5 rounded">
              Active
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

/**
 * Pipeline Status Bar - Single horizontal stack
 */
const PipelineStatusBar: React.FC<{ stats: Record<string, number>; total: number; onClick: (status: string) => void }> = ({ stats, total, onClick }) => {
  if (total === 0) return null;
  
  const getWidth = (count: number) => (count / total) * 100;

  return (
    <div className="w-full">
      <div className="flex h-8 w-full rounded-lg overflow-hidden cursor-pointer">
        {stats['Production'] > 0 && (
          <div onClick={() => onClick('Production')} style={{ width: `${getWidth(stats['Production'])}%`, background: COLORS.production }} className="h-full hover:brightness-110 transition-all group relative">
             <div className="opacity-0 group-hover:opacity-100 absolute inset-0 flex items-center justify-center text-[10px] font-bold text-black/60">Prod</div>
          </div>
        )}
        {stats['Testing'] > 0 && (
          <div onClick={() => onClick('Testing')} style={{ width: `${getWidth(stats['Testing'])}%`, background: COLORS.testing }} className="h-full hover:brightness-110 transition-all group relative">
             <div className="opacity-0 group-hover:opacity-100 absolute inset-0 flex items-center justify-center text-[10px] font-bold text-black/60">Test</div>
          </div>
        )}
        {stats['Development'] > 0 && (
          <div onClick={() => onClick('Development')} style={{ width: `${getWidth(stats['Development'])}%`, background: COLORS.development }} className="h-full hover:brightness-110 transition-all group relative">
             <div className="opacity-0 group-hover:opacity-100 absolute inset-0 flex items-center justify-center text-[10px] font-bold text-black/60">Dev</div>
          </div>
        )}
        {stats['Draft'] > 0 && (
          <div onClick={() => onClick('Draft')} style={{ width: `${getWidth(stats['Draft'])}%`, background: COLORS.draft }} className="h-full hover:brightness-110 transition-all group relative">
             <div className="opacity-0 group-hover:opacity-100 absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white/60">Draft</div>
          </div>
        )}
      </div>
      
      {/* Legend */}
      <div className="flex justify-between mt-3 text-xs text-on-surface-variant">
        <div className="flex gap-4">
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{background: COLORS.production}}></span>Production ({stats['Production'] || 0})</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{background: COLORS.testing}}></span>Testing ({stats['Testing'] || 0})</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{background: COLORS.development}}></span>Dev ({stats['Development'] || 0})</span>
        </div>
        <span className="font-mono">{total} Rules Total</span>
      </div>
    </div>
  );
};

/**
 * Quality Score Histogram
 */
const QualityHistogram: React.FC<{ distribution: { grade: string; count: number }[]; onClick: (grade: string) => void }> = ({ distribution, onClick }) => {
  const maxCount = Math.max(...distribution.map(d => d.count), 1);
  
  const getColor = (grade: string) => {
    if (grade === 'A') return '#10b981'; // Emerald
    if (grade === 'B') return '#3b82f6'; // Blue
    if (grade === 'C') return '#f59e0b'; // Amber
    if (grade === 'D') return '#f97316'; // Orange
    return '#ef4444'; // Red
  };

  return (
    <div className="flex items-end justify-between h-32 gap-2 pt-4">
      {distribution.map((d) => {
        const heightPercent = (d.count / maxCount) * 100;
        return (
          <div 
            key={d.grade} 
            className="flex-1 flex flex-col items-center group cursor-pointer"
            onClick={() => onClick(d.grade)}
          >
            <div className="w-full relative flex-1 flex items-end bg-surface-container-highest/30 rounded-t-sm">
                <div 
                    className="w-full transition-all duration-500 rounded-t-sm group-hover:brightness-110 relative"
                    style={{ height: `${heightPercent}%`, backgroundColor: getColor(d.grade) }}
                >
                    <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-xs font-bold text-on-surface opacity-0 group-hover:opacity-100 transition-opacity">
                        {d.count}
                    </span>
                </div>
            </div>
            <span className="mt-2 text-xs font-bold text-on-surface-variant font-mono">{d.grade}</span>
          </div>
        );
      })}
    </div>
  );
};

// ============================================================================
// SKELETON LOADING
// ============================================================================

const DashboardSkeleton: React.FC = () => (
  <div className="h-full overflow-y-auto bg-background p-6 md:p-10">
    <div className="max-w-[1920px] mx-auto space-y-10" role="status" aria-label="Loading dashboard">
      {/* Metric cards skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-surface-container-low border border-outline-variant/30 rounded-2xl p-6">
            <Skeleton variant="text" width="w-20" height="h-12" className="mb-3" />
            <Skeleton variant="text" width="w-32" height="h-4" className="mb-2" />
            <Skeleton variant="text" width="w-24" height="h-3" />
          </div>
        ))}
      </div>

      {/* Tactic ribbon skeleton */}
      <div className="space-y-4">
        <Skeleton variant="text" width="w-40" height="h-6" />
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="bg-surface-container-low border border-outline-variant/20 rounded-lg p-4">
              <Skeleton variant="text" width="w-full" height="h-3" className="mb-4" />
              <Skeleton variant="text" width="w-10" height="h-7" />
            </div>
          ))}
        </div>
      </div>

      {/* Analytics row skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-surface-container-low border border-outline-variant/30 rounded-2xl p-6">
            <Skeleton variant="text" width="w-32" height="h-5" className="mb-2" />
            <Skeleton variant="text" width="w-48" height="h-3" className="mb-6" />
            <Skeleton variant="rounded" width="w-full" height="h-24" />
          </div>
        ))}
      </div>
    </div>
  </div>
);

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const Dashboard: React.FC<DashboardProps> = ({ detections, onNavigate }) => {
  const { productionDetections, isLoading } = useLibrary();

  // 1. Calculate Statistics
  const stats = useMemo(() => {
    const total = detections.length;
    const production = detections.filter(d => d.status === 'Production').length;
    const validated = detections.filter(d => d.testedAndValidated).length;
    
    // Status breakdown
    const byStatus: Record<string, number> = {
        'Production': 0, 'Testing': 0, 'Development': 0, 'Draft': 0, 'Backlog': 0
    };
    
    // Tactic breakdown
    const byTactic: Record<string, number> = {};
    const coveredTechniques = new Set<string>();

    // Quality breakdown
    const gradeCount = { A: 0, B: 0, C: 0, D: 0, F: 0 };
    
    // Platform breakdown
    const byPlatform: Record<string, number> = {};

    detections.forEach(d => {
        // Status
        if (byStatus[d.status] !== undefined) byStatus[d.status]++;
        
        // Tactics & Techniques
        (d.mitreTactics || []).forEach(t => {
            // Normalize tactic name to match our constants
            const normalizedT = t.toLowerCase().replace(/ /g, '-');
            const tacticKey = TACTIC_ORDER.find(to => to.shortname === normalizedT || to.name === t)?.shortname || normalizedT;
            byTactic[tacticKey] = (byTactic[tacticKey] || 0) + 1;
        });
        (d.mitreAttackIds || []).forEach(id => coveredTechniques.add(id));

        // Quality
        const score = d.qualityScore || 0;
        if (score >= 90) gradeCount.A++;
        else if (score >= 75) gradeCount.B++;
        else if (score >= 60) gradeCount.C++;
        else if (score >= 40) gradeCount.D++;
        else gradeCount.F++;

        // Platform
        (d.platforms || []).forEach(p => {
            byPlatform[p] = (byPlatform[p] || 0) + 1;
        });
    });

    const totalTechniques = 648; // Enterprise ATT&CK approx
    const coveragePercent = Math.round((coveredTechniques.size / totalTechniques) * 100);

    const qualityDist = Object.entries(gradeCount).map(([grade, count]) => ({ grade, count }));
    const platformData = Object.entries(byPlatform)
        .map(([name, value]) => ({ name, value }))
        .sort((a,b) => b.value - a.value)
        .slice(0, 5);

    return {
        total,
        production,
        validated,
        coveragePercent,
        uniqueTechniques: coveredTechniques.size,
        byStatus,
        byTactic,
        qualityDist,
        platformData
    };
  }, [detections]);

  // Max count for tactic heat calculation
  const maxTacticCount = Math.max(...Object.values(stats.byTactic), 1);

  // Loading state
  if (isLoading && detections.length === 0) {
    return <DashboardSkeleton />;
  }

  // Empty state
  if (!isLoading && detections.length === 0) {
    return (
      <div className="h-full overflow-y-auto bg-background p-6 md:p-10">
        <div className="max-w-[1920px] mx-auto">
          <EmptyState
            icon="dashboard"
            title="No detections yet"
            description="Your dashboard will come to life once you start building detection content. Create your first detection or import existing rules."
            action={{ label: "New Detection", onClick: () => onNavigate('add_selection'), icon: "plus" }}
            secondaryAction={{ label: "Bulk Import", onClick: () => onNavigate('bulk_import') }}
            size="lg"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-background p-6 md:p-10">
      <div className="max-w-[1920px] mx-auto space-y-10">
        
        {/* ROW 1: HERO METRICS */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <MetricCard 
                label="Total Detections" 
                value={stats.total} 
                sublabel="Active across all libraries"
                onClick={() => onNavigate('library')}
                accentColor="text-primary"
            />
            <MetricCard 
                label="MITRE Coverage" 
                value={`${stats.coveragePercent}%`} 
                sublabel={`${stats.uniqueTechniques} / 648 Techniques`}
                onClick={() => onNavigate('coverage')}
                accentColor="text-tertiary"
            />
            <MetricCard 
                label="Production Ready" 
                value={stats.production} 
                sublabel="Deployed and active"
                onClick={() => onNavigate('library', { status: 'Production' })}
                accentColor="text-emerald-500"
            />
            <MetricCard
                label="Validated"
                value={stats.validated}
                sublabel={`${Math.round((stats.validated / (stats.total || 1)) * 100)}% of total`}
                onClick={() => onNavigate('library', { validated: true })}
                accentColor="text-blue-500"
            />
        </div>

        {/* ROW 2: TACTIC RIBBON */}
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-on-surface flex items-center gap-2">
                    ATT&CK Tactics
                    <span className="text-xs font-normal text-on-surface-variant bg-surface-container px-2 py-0.5 rounded-full">
                        Detection Density
                    </span>
                </h2>
                <button 
                    onClick={() => onNavigate('mitre')}
                    className="text-xs font-bold text-primary hover:text-primary/80 transition-colors uppercase tracking-wider"
                >
                    View Matrix →
                </button>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
                {TACTIC_ORDER.map(tactic => (
                    <TacticCard 
                        key={tactic.id}
                        name={tactic.name}
                        count={stats.byTactic[tactic.shortname] || 0}
                        maxCount={maxTacticCount}
                        onClick={() => onNavigate('library', { tactic: tactic.name })}
                    />
                ))}
            </div>
        </div>

        {/* ROW 3: ANALYTICS & HEALTH */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* 1. Pipeline Status */}
            <div className="bg-surface-container-low border border-outline-variant/30 rounded-2xl p-6 flex flex-col">
                <div className="mb-6">
                    <h3 className="text-base font-bold text-on-surface">Pipeline Status</h3>
                    <p className="text-xs text-on-surface-variant mt-1">Distribution by development lifecycle</p>
                </div>
                <div className="flex-1 flex items-center">
                    <PipelineStatusBar 
                        stats={stats.byStatus} 
                        total={stats.total} 
                        onClick={(status) => onNavigate('library', { status })}
                    />
                </div>
            </div>

            {/* 2. Platform Coverage */}
            <div className="bg-surface-container-low border border-outline-variant/30 rounded-2xl p-6">
                <div className="mb-4">
                    <h3 className="text-base font-bold text-on-surface">Platform Coverage</h3>
                    <p className="text-xs text-on-surface-variant mt-1">Top monitored environments</p>
                </div>
                <div className="space-y-3">
                    {stats.platformData.map((p, i) => (
                        <div
                            key={p.name}
                            className="flex items-center gap-3 cursor-pointer hover:bg-surface-container/50 -mx-2 px-2 py-1 rounded-lg transition-colors"
                            onClick={() => onNavigate('library', { platform: p.name })}
                        >
                            <span className="text-xs font-mono text-on-surface-variant w-4">{i+1}</span>
                            <div className="flex-1">
                                <div className="flex justify-between mb-1">
                                    <span className="text-xs font-medium text-on-surface">{p.name}</span>
                                    <span className="text-xs text-on-surface-variant">{p.value}</span>
                                </div>
                                <div className="h-1.5 w-full bg-surface-container-highest rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-secondary rounded-full"
                                        style={{ width: `${(p.value / stats.total) * 100}%` }}
                                    />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* 3. Quality Health */}
            <div className="bg-surface-container-low border border-outline-variant/30 rounded-2xl p-6 flex flex-col">
                <div className="mb-2">
                    <h3 className="text-base font-bold text-on-surface">Quality Health</h3>
                    <p className="text-xs text-on-surface-variant mt-1">Metadata completeness grades</p>
                </div>
                <div className="flex-1">
                    <QualityHistogram
                        distribution={stats.qualityDist}
                        onClick={(grade) => onNavigate('library', { qualityGrade: grade })}
                    />
                </div>
            </div>

        </div>

      </div>
    </div>
  );
};

export default Dashboard;
