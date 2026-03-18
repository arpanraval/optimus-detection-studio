import React, { useState, useEffect, useMemo } from 'react';
import { Detection, Status } from '../../types';
import { supabase } from '../../lib/supabaseClient';
import { Icon } from '../Icon';
import { Skeleton } from '../ui';
import { ScopeToggle } from '../common/ScopeToggle';
import { StrategyGapAnalysis, DetectionPrefill } from './StrategyGapAnalysis';

// ============================================================================
// TYPES
// ============================================================================

interface TacticData {
  id: string;
  name: string;
  shortname: string;
  techniqueCount: number;
  coveredCount: number;
  coverage: number;
  color: string;
}

interface TechniqueData {
  id: string;
  name: string;
  tactic: string;
  tacticId: string;
  platforms: string[];
  groupCount: number;
  softwareCount: number;
  campaignCount: number;
  isCovered: boolean;
  detectionCount: number;
  priorityScore: number;
  priorityTier: 'critical' | 'high' | 'medium' | 'low';
}

interface PlatformData {
  name: string;
  techniqueCount: number;
  coveredCount: number;
  coverage: number;
}

interface GroupData {
  id: string;
  name: string;
  techniqueCount: number;
  softwareCount: number;
  coveredTechniques: number;
  coverage: number;
}

interface SoftwareData {
  id: string;
  name: string;
  type: 'malware' | 'tool';
  techniqueCount: number;
  groupCount: number;
  coveredTechniques: number;
}

interface CoverageAnalyticsProps {
  detections?: Detection[];
  scope?: 'production' | 'all';
  onScopeChange?: (includeMyLab: boolean) => void;
  onNavigate?: (view: string, filter?: any) => void;
  onNavigateToLibrary?: (techniqueId: string) => void;  // Navigate to library with technique filter
  onNavigateToStrategy?: (strategyStixId: string) => void;  // Navigate to strategy detail
  onCreateDetection?: (prefill: DetectionPrefill) => void;  // Create detection from strategy
}

// ============================================================================
// CONSTANTS
// ============================================================================

const TACTIC_ORDER = [
  { id: 'TA0043', name: 'Reconnaissance', shortname: 'reconnaissance', color: '#ef4444' },
  { id: 'TA0042', name: 'Resource Development', shortname: 'resource-development', color: '#f97316' },
  { id: 'TA0001', name: 'Initial Access', shortname: 'initial-access', color: '#f59e0b' },
  { id: 'TA0002', name: 'Execution', shortname: 'execution', color: '#eab308' },
  { id: 'TA0003', name: 'Persistence', shortname: 'persistence', color: '#84cc16' },
  { id: 'TA0004', name: 'Privilege Escalation', shortname: 'privilege-escalation', color: '#22c55e' },
  { id: 'TA0005', name: 'Defense Evasion', shortname: 'defense-evasion', color: '#10b981' },
  { id: 'TA0006', name: 'Credential Access', shortname: 'credential-access', color: '#14b8a6' },
  { id: 'TA0007', name: 'Discovery', shortname: 'discovery', color: '#06b6d4' },
  { id: 'TA0008', name: 'Lateral Movement', shortname: 'lateral-movement', color: '#0ea5e9' },
  { id: 'TA0009', name: 'Collection', shortname: 'collection', color: '#3b82f6' },
  { id: 'TA0011', name: 'Command & Control', shortname: 'command-and-control', color: '#6366f1' },
  { id: 'TA0010', name: 'Exfiltration', shortname: 'exfiltration', color: '#8b5cf6' },
  { id: 'TA0040', name: 'Impact', shortname: 'impact', color: '#a855f7' },
];

const PLATFORM_COLORS: Record<string, string> = {
  'Windows': '#0ea5e9',
  'Linux': '#f59e0b',
  'macOS': '#8b5cf6',
  'Azure AD': '#3b82f6',
  'Office 365': '#ef4444',
  'Google Workspace': '#22c55e',
  'SaaS': '#14b8a6',
  'IaaS': '#f97316',
  'Containers': '#06b6d4',
  'Network': '#6366f1',
  'PRE': '#9ca3af',
};

// ============================================================================
// CUSTOM CHART COMPONENTS (SVG Based)
// ============================================================================

const SimpleAreaChart: React.FC<{ data: any[]; dataKey: string; color: string; height?: number }> = ({ data, dataKey, color, height = 300 }) => {
    if (!data || data.length === 0) return <div className="h-full w-full flex items-center justify-center text-on-surface-variant text-sm">No Data</div>;

    const width = 1000;
    const maxValue = Math.max(...data.map(d => Number(d[dataKey]) || 0), 1) * 1.1; // 10% headroom

    const points = data.map((d, i) => {
        const x = (i / (data.length - 1)) * width;
        const val = Number(d[dataKey]) || 0;
        const y = height - (val / maxValue) * height;
        return `${x},${y}`;
    }).join(' ');

    const fillPath = `M 0,${height} ${points.split(' ').map((p, i) => `L ${p}`).join(' ')} L ${width},${height} Z`;
    const linePath = `M ${points.split(' ').map(p => p).join(' L ')}`;

    return (
        <div className="w-full h-full relative group flex flex-col">
            <div className="flex-1 w-full relative">
                <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible" preserveAspectRatio="none">
                    {/* Grid lines */}
                    <line x1="0" y1={height * 0.25} x2={width} y2={height * 0.25} stroke="currentColor" strokeOpacity="0.05" vectorEffect="non-scaling-stroke" />
                    <line x1="0" y1={height * 0.5} x2={width} y2={height * 0.5} stroke="currentColor" strokeOpacity="0.05" vectorEffect="non-scaling-stroke" />
                    <line x1="0" y1={height * 0.75} x2={width} y2={height * 0.75} stroke="currentColor" strokeOpacity="0.05" vectorEffect="non-scaling-stroke" />

                    <path d={fillPath} fill={color} fillOpacity="0.15" />
                    <path d={linePath} fill="none" stroke={color} strokeWidth="3" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
                    
                    {/* Interaction Points */}
                    {data.map((d, i) => {
                        const x = (i / (data.length - 1)) * width;
                        const val = Number(d[dataKey]) || 0;
                        const y = height - (val / maxValue) * height;
                        return (
                            <g key={i} className="opacity-0 group-hover:opacity-100 hover:!opacity-100 transition-opacity cursor-crosshair">
                                <line x1={x} y1={0} x2={x} y2={height} stroke="currentColor" strokeOpacity="0.1" vectorEffect="non-scaling-stroke" strokeDasharray="4 4"/>
                                <circle cx={x} cy={y} r={4} fill={color} stroke="white" strokeWidth={2} />
                                <rect x={Math.min(x, width - 120)} y={0} width="120" height="50" rx="8" fill="var(--surface-container-high)" className="text-surface-container-high" fillOpacity="0" /> 
                                {/* Simple title tooltip */}
                                <title>{`${d.name}: ${val} ${dataKey}`}</title>
                            </g>
                        );
                    })}
                </svg>
            </div>
            <div className="flex justify-between text-[10px] text-on-surface-variant/60 font-mono mt-2 uppercase tracking-widest">
                <span>{data[0]?.name}</span>
                <span>{data[data.length - 1]?.name}</span>
            </div>
        </div>
    );
};

const SimpleStackedAreaChart: React.FC<{ data: any[]; keys: { key: string; color: string }[]; height?: number }> = ({ data, keys, height = 300 }) => {
    if (!data || data.length === 0) return <div className="h-full w-full flex items-center justify-center text-on-surface-variant text-sm">No Data</div>;

    const width = 1000;
    
    // Calculate max value for stack
    const maxValue = Math.max(...data.map(d => {
        return keys.reduce((sum, k) => sum + (Number(d[k.key]) || 0), 0);
    }), 1) * 1.1;

    // Generate paths for each layer
    // We process from bottom layer up
    const layers = [];
    let previousPoints = new Array(data.length).fill(height); // Start at bottom

    for (const { key, color } of keys) {
        const currentPoints = data.map((d, i) => {
            const val = Number(d[key]) || 0;
            const heightVal = (val / maxValue) * height;
            // Current Y is previous Y minus height (going up)
            return previousPoints[i] - heightVal;
        });

        // Build path: Start bottom-left, line to bottom-right (based on prev layer), line to top-right (current), line to top-left (current), close
        let pathD = '';
        
        // Bottom edge (left to right) - using previousPoints
        const bottomEdge = previousPoints.map((y: number, i: number) => {
            const x = (i / (data.length - 1)) * width;
            return `${i === 0 ? 'M' : 'L'} ${x},${y}`;
        }).join(' ');

        // Top edge (right to left) - using currentPoints
        const topEdge = currentPoints.map((y: number, i: number) => {
            const x = (i / (data.length - 1)) * width;
            return `L ${x},${y}`;
        }).reverse().join(' ');

        pathD = `${bottomEdge} ${topEdge} Z`;
        
        layers.push({ key, color, path: pathD });
        previousPoints = currentPoints;
    }

    return (
        <div className="w-full h-full relative group flex flex-col">
            <div className="flex-1 w-full relative">
                <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible" preserveAspectRatio="none">
                    <line x1="0" y1={height * 0.25} x2={width} y2={height * 0.25} stroke="currentColor" strokeOpacity="0.05" vectorEffect="non-scaling-stroke" />
                    <line x1="0" y1={height * 0.5} x2={width} y2={height * 0.5} stroke="currentColor" strokeOpacity="0.05" vectorEffect="non-scaling-stroke" />
                    <line x1="0" y1={height * 0.75} x2={width} y2={height * 0.75} stroke="currentColor" strokeOpacity="0.05" vectorEffect="non-scaling-stroke" />

                    {layers.map((layer, idx) => (
                        <path key={idx} d={layer.path} fill={layer.color} fillOpacity="0.8" stroke="white" strokeOpacity="0.1" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
                    ))}

                    {/* Hover Line */}
                    {data.map((d, i) => {
                        const x = (i / (data.length - 1)) * width;
                        const tooltipText = keys.map(k => `${k.key}: ${d[k.key]}`).join(', ');
                        return (
                            <g key={i} className="opacity-0 group-hover:opacity-100 transition-opacity">
                                <line x1={x} y1={0} x2={x} y2={height} stroke="currentColor" strokeOpacity="0.2" vectorEffect="non-scaling-stroke" strokeDasharray="2 2" />
                                <title>{`${d.name}\n${tooltipText}`}</title>
                            </g>
                        )
                    })}
                </svg>
            </div>
            <div className="flex justify-between text-[10px] text-on-surface-variant/60 font-mono mt-2 uppercase tracking-widest">
                <span>{data[0]?.name}</span>
                <span>{data[data.length - 1]?.name}</span>
            </div>
        </div>
    );
};

// ============================================================================
// COMPONENT HELPERS
// ============================================================================

const BigStat: React.FC<{
  value: string | number;
  label: string;
  sublabel?: string;
  color?: string;
  size?: 'normal' | 'large' | 'huge';
}> = ({ value, label, sublabel, color = 'var(--md-sys-color-primary)', size = 'normal' }) => {
  const sizeClasses = {
    normal: 'text-4xl',
    large: 'text-5xl',
    huge: 'text-6xl'
  };
  
  return (
    <div className="text-center">
      <div className={`${sizeClasses[size]} font-bold tracking-tight`} style={{ color }}>
        {value}
      </div>
      <div className="text-sm text-on-surface mt-1">{label}</div>
      {sublabel && <div className="text-xs text-on-surface-variant">{sublabel}</div>}
    </div>
  );
};

const HorizontalBar: React.FC<{
  data: { label: string; value: number; color?: string; sublabel?: string }[];
  title: string;
  subtitle?: string;
  maxBars?: number;
  onClick?: (label: string) => void;
  showRank?: boolean;
}> = ({ data, title, subtitle, maxBars = 15, onClick, showRank = true }) => {
  const displayData = data.slice(0, maxBars);
  const maxValue = Math.max(...displayData.map(d => d.value), 1);

  return (
    <div className="h-full flex flex-col">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-on-surface">{title}</h3>
        {subtitle && <p className="text-xs text-on-surface-variant mt-0.5">{subtitle}</p>}
      </div>
      <div className="flex-1 space-y-1.5 overflow-y-auto custom-scrollbar">
        {displayData.map((item, index) => (
          <div 
            key={item.label}
            className={`group flex items-center gap-2 ${onClick ? 'cursor-pointer' : ''}`}
            onClick={() => onClick?.(item.label)}
          >
            {showRank && (
              <span className="text-xs text-on-surface-variant/70 w-5 text-right font-mono">{index + 1}</span>
            )}
            <span className="text-xs text-on-surface w-28 truncate group-hover:text-primary transition-colors" title={item.label}>
              {item.label}
            </span>
            <div className="flex-1 h-4 bg-surface-container-highest rounded overflow-hidden">
              <div 
                className="h-full rounded transition-all duration-300 group-hover:brightness-125 flex items-center"
                style={{ 
                  width: `${Math.max((item.value / maxValue) * 100, 2)}%`,
                  backgroundColor: item.color || 'var(--md-sys-color-primary)'
                }}
              >
                {(item.value / maxValue) > 0.15 && (
                  <span className="text-[10px] font-medium text-white/90 pl-2">{item.value}</span>
                )}
              </div>
            </div>
            {(item.value / maxValue) <= 0.15 && (
              <span className="text-xs font-mono text-on-surface-variant w-8">{item.value}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

const StackedBar: React.FC<{
  data: { label: string; segments: { name: string; value: number; color: string }[] }[];
  title: string;
  subtitle?: string;
  legend: { name: string; color: string }[];
  onClick?: (label: string) => void;
}> = ({ data, title, subtitle, legend, onClick }) => {
  const maxTotal = Math.max(...data.map(d => d.segments.reduce((s, seg) => s + seg.value, 0)), 1);

  return (
    <div className="h-full flex flex-col">
      <div className="mb-3">
        <h3 className="text-lg font-semibold text-on-surface">{title}</h3>
        {subtitle && <p className="text-xs text-on-surface-variant mt-0.5">{subtitle}</p>}
      </div>
      {/* Legend */}
      <div className="flex flex-wrap gap-4 mb-4">
        {legend.map(item => (
          <div key={item.name} className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: item.color }} />
            <span className="text-xs text-on-surface-variant">{item.name}</span>
          </div>
        ))}
      </div>
      <div className="flex-1 space-y-1.5 overflow-y-auto custom-scrollbar">
        {data.map((item) => (
          <div 
            key={item.label}
            className={`group flex items-center gap-2 ${onClick ? 'cursor-pointer' : ''}`}
            onClick={() => onClick?.(item.label)}
          >
            <span className="text-xs text-on-surface w-32 truncate group-hover:text-primary">
              {item.label}
            </span>
            <div className="flex-1 h-4 bg-surface-container-highest rounded overflow-hidden flex">
              {item.segments.map((seg) => (
                <div 
                  key={seg.name}
                  className="h-full transition-all duration-300 group-hover:brightness-125 flex items-center justify-center"
                  style={{ 
                    width: `${(seg.value / maxTotal) * 100}%`,
                    backgroundColor: seg.color
                  }}
                  title={`${seg.name}: ${seg.value}`}
                >
                  {seg.value > 0 && (seg.value / maxTotal) > 0.06 && (
                    <span className="text-[10px] font-medium text-white/90">{seg.value}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const CoverageRing: React.FC<{
  percentage: number;
  covered: number;
  total: number;
  label: string;
  color?: string;
  size?: number;
}> = ({ percentage, covered, total, label, color = 'var(--md-sys-color-primary)', size = 140 }) => {
  const strokeWidth = 12;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="transform -rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--md-sys-color-surface-container-highest)"
            strokeWidth={strokeWidth}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className="transition-all duration-500"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold text-on-surface">{percentage.toFixed(1)}%</span>
          <span className="text-xs text-on-surface-variant">{covered}/{total}</span>
        </div>
      </div>
      <span className="text-sm text-on-surface mt-2">{label}</span>
    </div>
  );
};

const GapTable: React.FC<{
  gaps: TechniqueData[];
  onTechniqueClick?: (id: string) => void;
}> = ({ gaps, onTechniqueClick }) => {
  const getPriorityColor = (tier: string) => {
    switch (tier) {
      case 'critical': return '#ef4444';
      case 'high': return '#f97316';
      case 'medium': return '#f59e0b';
      default: return '#6b7280';
    }
  };

  return (
    <div className="overflow-x-auto custom-scrollbar">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-on-surface-variant border-b border-outline-variant/30">
            <th className="pb-2 font-medium">Technique</th>
            <th className="pb-2 font-medium">Tactic</th>
            <th className="pb-2 font-medium text-center">Groups</th>
            <th className="pb-2 font-medium text-center">Software</th>
            <th className="pb-2 font-medium text-center">Score</th>
            <th className="pb-2 font-medium">Priority</th>
          </tr>
        </thead>
        <tbody>
          {gaps.map(gap => (
            <tr 
              key={gap.id}
              className="border-b border-outline-variant/10 hover:bg-surface-container-highest cursor-pointer transition-colors"
              onClick={() => onTechniqueClick?.(gap.id)}
            >
              <td className="py-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-primary">{gap.id}</span>
                  <span className="text-on-surface truncate max-w-[200px]">{gap.name}</span>
                </div>
              </td>
              <td className="py-2 text-on-surface-variant">{gap.tactic}</td>
              <td className="py-2 text-center text-on-surface">{gap.groupCount}</td>
              <td className="py-2 text-center text-on-surface">{gap.softwareCount}</td>
              <td className="py-2 text-center font-mono text-on-surface">{gap.priorityScore}</td>
              <td className="py-2">
                <span 
                  className="px-2 py-0.5 rounded text-xs font-medium uppercase"
                  style={{ 
                    backgroundColor: `${getPriorityColor(gap.priorityTier)}20`,
                    color: getPriorityColor(gap.priorityTier)
                  }}
                >
                  {gap.priorityTier}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const TabSelector: React.FC<{
  tabs: { id: string; label: string; count?: number }[];
  activeTab: string;
  onChange: (tabId: string) => void;
}> = ({ tabs, activeTab, onChange }) => (
  <div className="flex gap-1 bg-surface-container-high rounded-xl p-1">
    {tabs.map(tab => (
      <button
        key={tab.id}
        onClick={() => onChange(tab.id)}
        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
          activeTab === tab.id
            ? 'bg-primary text-on-primary'
            : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest'
        }`}
      >
        {tab.label}
        {tab.count !== undefined && (
          <span className={`ml-1.5 ${activeTab === tab.id ? 'text-on-primary/70' : 'text-on-surface-variant/70'}`}>
            ({tab.count})
          </span>
        )}
      </button>
    ))}
  </div>
);

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const CoverageAnalytics: React.FC<CoverageAnalyticsProps> = ({
  detections = [],
  scope = 'production',
  onScopeChange,
  onNavigate,
  onNavigateToLibrary,
  onNavigateToStrategy,
  onCreateDetection
}) => {
  const [activeSection, setActiveSection] = useState<'coverage' | 'mitre' | 'trends' | 'strategy-gaps'>('coverage');
  const [isLoading, setIsLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<'30d' | '90d' | '1y'>('1y');
  
  const [tactics, setTactics] = useState<TacticData[]>([]);
  const [techniques, setTechniques] = useState<TechniqueData[]>([]);
  const [platforms, setPlatforms] = useState<PlatformData[]>([]);
  const [groups, setGroups] = useState<GroupData[]>([]);
  const [software, setSoftware] = useState<SoftwareData[]>([]);
  const [totalStats, setTotalStats] = useState({
    techniques: 0,
    groups: 0,
    software: 0,
    campaigns: 0,
    dataSources: 0,
  });

  const scopedDetections = useMemo(() => {
    if (scope === 'all') return detections;
    return detections.filter(d => d.library_type === 'universal');
  }, [detections, scope]);

  const coveredTechniques = useMemo(() => {
    const covered = new Set<string>();
    scopedDetections.forEach(d => {
      (d.mitreAttackIds || []).forEach(id => covered.add(id.toUpperCase()));
    });
    return covered;
  }, [scopedDetections]);

  // Helper for status replay
  const getStatusAtDate = (detection: Detection, date: Date): string => {
    // If detection didn't exist yet
    if (new Date(detection.createdDate) > date) return 'NonExistent';

    // Start with current status
    let currentStatus = detection.status;

    // If no audit log, assume current status applied since creation (simplification)
    if (!detection.auditLog || detection.auditLog.length === 0) return currentStatus;

    // Find all status changes that happened AFTER the target date
    // We want to "undo" them to get back to the state at 'date'
    const futureLogs = detection.auditLog
        .filter(l => new Date(l.timestamp) > date && l.action === 'status_changed' && l.changes?.status)
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()); // Newest first

    for (const log of futureLogs) {
        if (log.changes?.status?.old) {
            currentStatus = log.changes.status.old as Status;
        }
    }

    return currentStatus;
  };

  // TREND ANALYSIS CALCULATION
  const trendData = useMemo(() => {
    const points: Date[] = [];
    const today = new Date();
    
    let count = 12;
    let unit: 'day' | 'week' | 'month' = 'month';
    
    if (timeRange === '30d') {
        count = 30;
        unit = 'day';
    } else if (timeRange === '90d') {
        count = 12; // approx 12 weeks
        unit = 'week';
    } else {
        count = 12;
        unit = 'month';
    }

    // Generate dates
    for (let i = count - 1; i >= 0; i--) {
        const d = new Date(today);
        
        if (unit === 'day') {
            d.setDate(today.getDate() - i);
        } else if (unit === 'week') {
            d.setDate(today.getDate() - (i * 7));
        } else if (unit === 'month') {
            d.setMonth(today.getMonth() - i);
            d.setDate(1); // First set to start of month
            d.setMonth(d.getMonth() + 1, 0); // Then end of month
        }
        
        points.push(d);
    }

    return points.map(date => {
        const monthLabel = unit === 'month' 
            ? date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
            : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

        // Filter detections created on or before this point in time
        const relevantDetections = scopedDetections.filter(d => new Date(d.createdDate) <= date);
        
        // Calculate metrics for this snapshot
        const uniqueTechniques = new Set<string>();
        let production = 0;
        let testing = 0;
        let other = 0;

        relevantDetections.forEach(d => {
            // 1. Technique Coverage (Approximation: Current techniques apply if rule existed)
            (d.mitreAttackIds || []).forEach(id => uniqueTechniques.add(id.toUpperCase()));

            // 2. Status Reconstruction
            const statusAtDate = getStatusAtDate(d, date);

            if (statusAtDate === 'Production') production++;
            else if (statusAtDate === 'Testing' || statusAtDate === 'Development') testing++;
            else other++;
        });

        return {
            name: monthLabel,
            "Covered Techniques": uniqueTechniques.size,
            "Production Rules": production,
            "Testing Rules": testing,
            "Draft/Other": other,
            "Total Rules": relevantDetections.length
        };
    });
  }, [scopedDetections, timeRange]);

  const growthMetrics = useMemo(() => {
      if (trendData.length < 2) return { growth: 0, newCoverage: 0 };
      
      const current = trendData[trendData.length - 1];
      const previous = trendData[trendData.length - 2];
      
      return {
          growth: current["Total Rules"] - previous["Total Rules"],
          newCoverage: current["Covered Techniques"] - previous["Covered Techniques"]
      };
  }, [trendData]);

  const periodLabel = timeRange === '1y' ? 'vs last month' : timeRange === '90d' ? 'vs last week' : 'vs yesterday';

  useEffect(() => {
    const fetchMitreData = async () => {
      setIsLoading(true);
      try {
        const { data: techniquesData } = await supabase.from('mitre_objects').select('mitre_id, name, data, stix_id').eq('type', 'attack-pattern').eq('deprecated', false).eq('revoked', false);
        const { data: groupsData } = await supabase.from('mitre_objects').select('mitre_id, name, stix_id').eq('type', 'intrusion-set').eq('deprecated', false).eq('revoked', false);
        const { data: softwareData } = await supabase.from('mitre_objects').select('mitre_id, name, stix_id, data, type').in('type', ['malware', 'tool']).eq('deprecated', false).eq('revoked', false);
        const { data: campaignsData } = await supabase.from('mitre_objects').select('mitre_id').eq('type', 'campaign').eq('deprecated', false);
        const { data: dataSourcesData } = await supabase.from('mitre_objects').select('mitre_id').eq('type', 'x-mitre-data-source');
        const { data: relationships } = await supabase.from('mitre_relationships').select('source_ref, target_ref, relationship_type');

        const tacticCounts: Record<string, { total: number; covered: number }> = {};
        const platformCounts: Record<string, { total: number; covered: number }> = {};
        const techniqueGroupCount: Record<string, number> = {};
        const techniqueSoftwareCount: Record<string, number> = {};
        const groupTechniqueCount: Record<string, number> = {};
        const groupSoftwareCount: Record<string, number> = {};
        const softwareTechniqueCount: Record<string, number> = {};
        const softwareGroupCount: Record<string, number> = {};

        relationships?.forEach(r => {
          if (r.source_ref?.startsWith('intrusion-set') && r.target_ref?.startsWith('attack-pattern')) {
            techniqueGroupCount[r.target_ref] = (techniqueGroupCount[r.target_ref] || 0) + 1;
            groupTechniqueCount[r.source_ref] = (groupTechniqueCount[r.source_ref] || 0) + 1;
          }
          if (r.source_ref?.startsWith('intrusion-set') && (r.target_ref?.startsWith('malware') || r.target_ref?.startsWith('tool'))) {
            groupSoftwareCount[r.source_ref] = (groupSoftwareCount[r.source_ref] || 0) + 1;
            softwareGroupCount[r.target_ref] = (softwareGroupCount[r.target_ref] || 0) + 1;
          }
          if ((r.source_ref?.startsWith('malware') || r.source_ref?.startsWith('tool')) && r.target_ref?.startsWith('attack-pattern')) {
            techniqueSoftwareCount[r.target_ref] = (techniqueSoftwareCount[r.target_ref] || 0) + 1;
            softwareTechniqueCount[r.source_ref] = (softwareTechniqueCount[r.source_ref] || 0) + 1;
          }
        });

        const processedTechniques: TechniqueData[] = (techniquesData || []).map(t => {
          const killChainPhases = t.data?.kill_chain_phases || [];
          const tacticPhase = killChainPhases.find((p: any) => p.kill_chain_name === 'mitre-attack');
          const tacticShortname = tacticPhase?.phase_name || 'unknown';
          const tacticInfo = TACTIC_ORDER.find(to => to.shortname === tacticShortname);
          
          const techPlatforms = t.data?.x_mitre_platforms || [];
          const isCovered = coveredTechniques.has(t.mitre_id.toUpperCase());
          const groupCount = techniqueGroupCount[t.stix_id] || 0;
          const softwareCount = techniqueSoftwareCount[t.stix_id] || 0;
          
          const priorityScore = (groupCount * 3) + (softwareCount * 2);
          let priorityTier: 'critical' | 'high' | 'medium' | 'low' = 'low';
          if (priorityScore >= 100) priorityTier = 'critical';
          else if (priorityScore >= 50) priorityTier = 'high';
          else if (priorityScore >= 20) priorityTier = 'medium';

          if (tacticInfo) {
            if (!tacticCounts[tacticInfo.id]) {
              tacticCounts[tacticInfo.id] = { total: 0, covered: 0 };
            }
            tacticCounts[tacticInfo.id].total++;
            if (isCovered) tacticCounts[tacticInfo.id].covered++;
          }

          techPlatforms.forEach((p: string) => {
            if (!platformCounts[p]) {
              platformCounts[p] = { total: 0, covered: 0 };
            }
            platformCounts[p].total++;
            if (isCovered) platformCounts[p].covered++;
          });

          return {
            id: t.mitre_id,
            name: t.name,
            tactic: tacticInfo?.name || 'Unknown',
            tacticId: tacticInfo?.id || '',
            platforms: techPlatforms,
            groupCount,
            softwareCount,
            campaignCount: 0,
            isCovered,
            detectionCount: scopedDetections.filter(d => d.mitreAttackIds?.includes(t.mitre_id)).length,
            priorityScore,
            priorityTier
          };
        });

        const processedGroups: GroupData[] = (groupsData || []).map(g => {
          const techCount = groupTechniqueCount[g.stix_id] || 0;
          const swCount = groupSoftwareCount[g.stix_id] || 0;
          return {
            id: g.mitre_id,
            name: g.name,
            techniqueCount: techCount,
            softwareCount: swCount,
            coveredTechniques: 0, 
            coverage: 0
          };
        }).sort((a, b) => (b.techniqueCount + b.softwareCount) - (a.techniqueCount + a.softwareCount));

        const processedSoftware: SoftwareData[] = (softwareData || []).map(s => ({
          id: s.mitre_id,
          name: s.name,
          type: (s.type === 'malware' ? 'malware' : 'tool') as 'malware' | 'tool',
          techniqueCount: softwareTechniqueCount[s.stix_id] || 0,
          groupCount: softwareGroupCount[s.stix_id] || 0,
          coveredTechniques: 0
        })).sort((a, b) => (b.techniqueCount + b.groupCount) - (a.techniqueCount + a.groupCount));

        const tacticData: TacticData[] = TACTIC_ORDER.map(t => {
          const counts = tacticCounts[t.id] || { total: 0, covered: 0 };
          return {
            ...t,
            techniqueCount: counts.total,
            coveredCount: counts.covered,
            coverage: counts.total > 0 ? (counts.covered / counts.total) * 100 : 0
          };
        });

        const platformData: PlatformData[] = Object.entries(platformCounts)
          .map(([name, counts]) => ({
            name,
            techniqueCount: counts.total,
            coveredCount: counts.covered,
            coverage: counts.total > 0 ? (counts.covered / counts.total) * 100 : 0
          }))
          .sort((a, b) => b.techniqueCount - a.techniqueCount);

        setTechniques(processedTechniques);
        setTactics(tacticData);
        setPlatforms(platformData);
        setGroups(processedGroups);
        setSoftware(processedSoftware);
        setTotalStats({
          techniques: techniquesData?.length || 0,
          groups: groupsData?.length || 0,
          software: softwareData?.length || 0,
          campaigns: campaignsData?.length || 0,
          dataSources: dataSourcesData?.length || 0,
        });

      } catch (error) {
        console.error('Failed to fetch MITRE data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchMitreData();
  }, [coveredTechniques, scopedDetections]);

  const overallCoverage = useMemo(() => {
    const total = techniques.length || 648;
    const covered = techniques.filter(t => t.isCovered).length;
    return {
      total,
      covered,
      percentage: total > 0 ? (covered / total) * 100 : 0
    };
  }, [techniques]);

  const prioritizedGaps = useMemo(() => {
    return techniques
      .filter(t => !t.isCovered)
      .sort((a, b) => b.priorityScore - a.priorityScore)
      .slice(0, 50);
  }, [techniques]);

  const criticalGaps = prioritizedGaps.filter(g => g.priorityTier === 'critical').length;
  const highGaps = prioritizedGaps.filter(g => g.priorityTier === 'high').length;

  if (isLoading) {
    return (
      <div className="h-full overflow-y-auto bg-background p-6 md:p-10" role="status" aria-label="Loading coverage data">
        <div className="max-w-[1920px] mx-auto space-y-8">
          {/* Tab bar skeleton */}
          <div className="flex gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} variant="rounded" width={i === 0 ? 'w-28' : 'w-24'} height="h-9" />
            ))}
          </div>

          {/* Stat cards skeleton */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-surface-container-low border border-outline-variant/30 rounded-2xl p-5">
                <Skeleton variant="text" width="w-24" height="h-3" className="mb-3" />
                <Skeleton variant="text" width="w-16" height="h-8" className="mb-2" />
                <Skeleton variant="text" width="w-32" height="h-3" />
              </div>
            ))}
          </div>

          {/* Chart area skeleton */}
          <div className="bg-surface-container-low border border-outline-variant/30 rounded-2xl p-6">
            <Skeleton variant="text" width="w-48" height="h-5" className="mb-6" />
            <Skeleton variant="rounded" width="w-full" height="h-64" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-on-surface p-6">
      <div className="max-w-[1800px] mx-auto space-y-6">
        
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-3xl font-bold text-on-surface">Coverage Analytics</h1>
              <p className="text-on-surface-variant mt-1">MITRE ATT&CK coverage analysis and gap prioritization</p>
            </div>
            {onScopeChange && (
              <ScopeToggle includeMyLab={scope === 'all'} onChange={onScopeChange} />
            )}
          </div>
          <TabSelector 
            tabs={[
              { id: 'coverage', label: 'Your Coverage' },
              { id: 'trends', label: 'Trends & Velocity' },
              { id: 'mitre', label: 'MITRE Intelligence' },
              { id: 'strategy-gaps', label: 'Strategy Gaps' },
            ]}
            activeTab={activeSection}
            onChange={(id) => setActiveSection(id as any)}
          />
        </div>

        {/* TRENDS SECTION */}
        {activeSection === 'trends' && (
          <div className="animate-fade-in space-y-6">
            
            {/* Time Range Selector */}
            <div className="flex justify-end">
                <div className="inline-flex bg-surface-container-high rounded-lg p-1 border border-outline-variant/30">
                    {(['30d', '90d', '1y'] as const).map(range => (
                        <button
                            key={range}
                            onClick={() => setTimeRange(range)}
                            className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${
                                timeRange === range 
                                ? 'bg-primary text-on-primary shadow-sm' 
                                : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest'
                            }`}
                        >
                            {range === '30d' ? '30 Days' : range === '90d' ? '90 Days' : '1 Year'}
                        </button>
                    ))}
                </div>
            </div>

            {/* Metrics Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-surface-container-low rounded-2xl p-6 border border-outline-variant/30 flex items-center justify-between">
                    <div>
                        <p className="text-sm font-bold text-on-surface-variant uppercase tracking-widest mb-1">Total Rules</p>
                        <span className="text-4xl font-mono font-bold text-on-surface">{scopedDetections.length}</span>
                    </div>
                    <div className="text-right">
                        <span className={`text-sm font-bold ${growthMetrics.growth >= 0 ? 'text-green-500' : 'text-red-500'} flex items-center justify-end gap-1`}>
                            <Icon name={growthMetrics.growth >= 0 ? 'arrow-up' : 'arrow-down'} className="w-3 h-3" />
                            {Math.abs(growthMetrics.growth)}
                        </span>
                        <p className="text-xs text-on-surface-variant mt-1">{periodLabel}</p>
                    </div>
                </div>

                <div className="bg-surface-container-low rounded-2xl p-6 border border-outline-variant/30 flex items-center justify-between">
                    <div>
                        <p className="text-sm font-bold text-on-surface-variant uppercase tracking-widest mb-1">Coverage Growth</p>
                        <span className="text-4xl font-mono font-bold text-on-surface">{overallCoverage.covered}</span>
                        <span className="text-xs font-mono text-on-surface-variant ml-2">techniques</span>
                    </div>
                     <div className="text-right">
                        <span className={`text-sm font-bold ${growthMetrics.newCoverage >= 0 ? 'text-green-500' : 'text-red-500'} flex items-center justify-end gap-1`}>
                             <Icon name={growthMetrics.newCoverage >= 0 ? 'arrow-up' : 'arrow-down'} className="w-3 h-3" />
                            {Math.abs(growthMetrics.newCoverage)}
                        </span>
                        <p className="text-xs text-on-surface-variant mt-1">{periodLabel}</p>
                    </div>
                </div>

                 <div className="bg-surface-container-low rounded-2xl p-6 border border-outline-variant/30 flex items-center justify-between">
                    <div>
                         <p className="text-sm font-bold text-on-surface-variant uppercase tracking-widest mb-1">Production Ratio</p>
                        <span className="text-4xl font-mono font-bold text-on-surface">
                            {scopedDetections.length > 0 ? Math.round((scopedDetections.filter(d => d.status === 'Production').length / scopedDetections.length) * 100) : 0}%
                        </span>
                    </div>
                    <div className="w-16 h-16 rounded-full border-4 border-secondary/20 border-t-secondary flex items-center justify-center">
                         <Icon name="shield-check" className="w-6 h-6 text-secondary" />
                    </div>
                </div>
            </div>

            {/* Charts Row 1: Coverage Velocity */}
            <div className="bg-surface-container-low rounded-2xl p-8 border border-outline-variant/30 min-h-[400px]">
                 <div className="mb-6">
                    <h3 className="text-xl font-bold text-on-surface">Coverage Velocity</h3>
                    <p className="text-sm text-on-surface-variant">Growth of unique MITRE ATT&CK techniques covered over time</p>
                 </div>
                 <div className="h-[300px] w-full">
                     <SimpleAreaChart data={trendData} dataKey="Covered Techniques" color="#10b981" />
                 </div>
            </div>

            {/* Charts Row 2: Rule Growth by Status */}
            <div className="bg-surface-container-low rounded-2xl p-8 border border-outline-variant/30 min-h-[400px]">
                 <div className="mb-6">
                    <h3 className="text-xl font-bold text-on-surface">Rule Maturity Growth</h3>
                    <p className="text-sm text-on-surface-variant">Accumulation of detection rules by pipeline status</p>
                 </div>
                 <div className="h-[300px] w-full">
                     <SimpleStackedAreaChart 
                        data={trendData} 
                        keys={[
                            { key: 'Production Rules', color: '#3b82f6' },
                            { key: 'Testing Rules', color: '#f59e0b' },
                            { key: 'Draft/Other', color: '#6b7280' }
                        ]}
                     />
                     
                     <div className="flex justify-center gap-6 mt-4">
                        <div className="flex items-center gap-2">
                            <span className="w-3 h-3 rounded-full bg-blue-500"></span>
                            <span className="text-xs text-on-surface-variant">Production</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="w-3 h-3 rounded-full bg-amber-500"></span>
                            <span className="text-xs text-on-surface-variant">Testing</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="w-3 h-3 rounded-full bg-gray-500"></span>
                            <span className="text-xs text-on-surface-variant">Draft/Other</span>
                        </div>
                     </div>
                 </div>
            </div>
          </div>
        )}

        {/* COVERAGE SECTION (EXISTING) */}
        {activeSection === 'coverage' && (
          <div className="animate-fade-in space-y-6">
            <div className="grid grid-cols-6 gap-4">
              <div className="col-span-2 bg-surface-container-low rounded-2xl p-6 border border-outline-variant/30 flex items-center justify-center">
                <CoverageRing 
                  percentage={overallCoverage.percentage}
                  covered={overallCoverage.covered}
                  total={overallCoverage.total}
                  label="Overall ATT&CK Coverage"
                  color="#22c55e"
                  size={180}
                />
              </div>
              
              <div className="bg-surface-container-low rounded-2xl p-6 border border-outline-variant/30 flex flex-col justify-center">
                <BigStat 
                  value={overallCoverage.covered}
                  label="Techniques Covered"
                  sublabel={`of ${overallCoverage.total} total`}
                  color="#22c55e"
                />
              </div>
              
              <div className="bg-surface-container-low rounded-2xl p-6 border border-outline-variant/30 flex flex-col justify-center">
                <BigStat 
                  value={overallCoverage.total - overallCoverage.covered}
                  label="Coverage Gaps"
                  sublabel="Techniques without detections"
                  color="#f59e0b"
                />
              </div>
              
              <div className="bg-surface-container-low rounded-2xl p-6 border border-outline-variant/30 flex flex-col justify-center">
                <BigStat 
                  value={criticalGaps}
                  label="Critical Gaps"
                  sublabel="High-threat techniques"
                  color="#ef4444"
                />
              </div>
              
              <div className="bg-surface-container-low rounded-2xl p-6 border border-outline-variant/30 flex flex-col justify-center">
                <BigStat 
                  value={highGaps}
                  label="High Priority Gaps"
                  sublabel="Commonly used techniques"
                  color="#f97316"
                />
              </div>
            </div>

            {/* Row 2: Coverage by Tactic */}
            <div className="bg-surface-container-low rounded-2xl p-6 border border-outline-variant/30">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-xl font-bold text-on-surface">Coverage by Tactic</h2>
                  <p className="text-sm text-on-surface-variant">Click a tactic to view techniques</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-x-12 gap-y-4">
                {tactics.map(tactic => (
                  <div 
                    key={tactic.id}
                    className="group cursor-pointer"
                    onClick={() => onNavigate('mitre', { tactic: tactic.shortname })}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-on-surface group-hover:text-primary transition-colors">
                        {tactic.name}
                      </span>
                      <span className="text-xs text-on-surface-variant">
                        {tactic.coveredCount}/{tactic.techniqueCount} ({tactic.coverage.toFixed(0)}%)
                      </span>
                    </div>
                    <div className="h-4 bg-surface-container-highest rounded-full overflow-hidden flex">
                      <div 
                        className="h-full rounded-full transition-all duration-300"
                        style={{ 
                          width: `${tactic.coverage}%`,
                          backgroundColor: tactic.color
                        }}
                      />
                      <div 
                        className="h-full bg-outline-variant/10"
                        style={{ width: `${100 - tactic.coverage}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Row 3: Coverage by Platform + Priority Gaps */}
            <div className="grid grid-cols-2 gap-6">
              <div className="bg-surface-container-low rounded-2xl p-6 border border-outline-variant/30">
                <h2 className="text-xl font-bold text-on-surface mb-4">Coverage by Platform</h2>
                <div className="space-y-3">
                  {platforms.slice(0, 10).map(platform => (
                    <div key={platform.name}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-on-surface">{platform.name}</span>
                        <span className="text-xs text-on-surface-variant">
                          {platform.coveredCount}/{platform.techniqueCount} ({platform.coverage.toFixed(0)}%)
                        </span>
                      </div>
                      <div className="h-3 bg-surface-container-highest rounded-full overflow-hidden">
                        <div 
                          className="h-full rounded-full"
                          style={{ 
                            width: `${platform.coverage}%`,
                            backgroundColor: PLATFORM_COLORS[platform.name] || '#7dd3fc'
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-surface-container-low rounded-2xl p-6 border border-outline-variant/30">
                <h2 className="text-xl font-bold text-on-surface mb-4">Gap Priority Distribution</h2>
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className="bg-red-500/10 rounded-xl p-4 border border-red-500/20">
                    <div className="text-3xl font-bold text-red-500">{criticalGaps}</div>
                    <div className="text-sm text-on-surface">Critical</div>
                    <div className="text-xs text-on-surface-variant">Score ≥ 100</div>
                  </div>
                  <div className="bg-orange-500/10 rounded-xl p-4 border border-orange-500/20">
                    <div className="text-3xl font-bold text-orange-500">{highGaps}</div>
                    <div className="text-sm text-on-surface">High</div>
                    <div className="text-xs text-on-surface-variant">Score 50-99</div>
                  </div>
                  <div className="bg-amber-500/10 rounded-xl p-4 border border-amber-500/20">
                    <div className="text-3xl font-bold text-amber-500">
                      {prioritizedGaps.filter(g => g.priorityTier === 'medium').length}
                    </div>
                    <div className="text-sm text-on-surface">Medium</div>
                    <div className="text-xs text-on-surface-variant">Score 20-49</div>
                  </div>
                  <div className="bg-gray-500/10 rounded-xl p-4 border border-gray-500/20">
                    <div className="text-3xl font-bold text-gray-500">
                      {techniques.filter(t => !t.isCovered && t.priorityTier === 'low').length}
                    </div>
                    <div className="text-sm text-on-surface">Low</div>
                    <div className="text-xs text-on-surface-variant">Score &lt; 20</div>
                  </div>
                </div>
                <p className="text-xs text-on-surface-variant">
                  Priority Score = (Groups × 3) + (Software × 2)
                </p>
              </div>
            </div>

            <div className="bg-surface-container-low rounded-2xl p-6 border border-outline-variant/30">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-xl font-bold text-on-surface">Top Priority Gaps</h2>
                  <p className="text-sm text-on-surface-variant">Techniques you should prioritize detecting</p>
                </div>
                <button 
                  onClick={() => onNavigate('gaps')}
                  className="text-sm text-primary hover:text-primary/80 transition-colors"
                >
                  View All Gaps →
                </button>
              </div>
              <GapTable 
                gaps={prioritizedGaps.slice(0, 20)}
                onTechniqueClick={(id) => onNavigate('mitre', { technique: id })}
              />
            </div>
          </div>
        )}

        {/* MITRE INTELLIGENCE SECTION */}
        {activeSection === 'mitre' && (
          <div className="animate-fade-in space-y-6">
            <div className="bg-surface-container-low rounded-2xl p-6 border border-outline-variant/30">
              <h2 className="text-xl font-bold text-on-surface mb-6">ATT&CK Enterprise Overview</h2>
              <div className="grid grid-cols-6 gap-8">
                <BigStat value={totalStats.techniques} label="Techniques" color="#7dd3fc" />
                <BigStat value={totalStats.groups} label="Adversaries" color="#f87171" />
                <BigStat value={software.filter(s => s.type === 'malware').length} label="Malware" color="#c4b5fd" />
                <BigStat value={software.filter(s => s.type === 'tool').length} label="Tools" color="#fcd34d" />
                <BigStat value={totalStats.campaigns} label="Campaigns" color="#22c55e" />
                <BigStat value={tactics.length} label="Tactics" color="#f97316" />
              </div>
            </div>

            <div className="bg-surface-container-low rounded-2xl p-6 border border-outline-variant/30">
              <h2 className="text-xl font-bold text-on-surface mb-4">Techniques by Tactic</h2>
              <div className="grid grid-cols-7 gap-3">
                {tactics.map(tactic => (
                  <div 
                    key={tactic.id}
                    className="bg-surface-container rounded-xl p-4 border border-outline-variant/30 cursor-pointer hover:border-primary/40 transition-all"
                    onClick={() => onNavigate('mitre', { tactic: tactic.shortname })}
                  >
                    <div className="text-3xl font-bold" style={{ color: tactic.color }}>
                      {tactic.techniqueCount}
                    </div>
                    <div className="text-xs text-on-surface-variant mt-1 leading-tight line-clamp-2">
                      {tactic.name}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div className="bg-surface-container-low rounded-2xl p-6 border border-outline-variant/30 min-h-[450px]">
                <HorizontalBar 
                  data={platforms.map(p => ({ 
                    label: p.name, 
                    value: p.techniqueCount,
                    color: PLATFORM_COLORS[p.name] || '#7dd3fc'
                  }))}
                  title="ATT&CK Platforms"
                  subtitle="Technique count applicable to each platform"
                  maxBars={15}
                />
              </div>

              <div className="bg-surface-container-low rounded-2xl p-6 border border-outline-variant/30 min-h-[450px]">
                <StackedBar 
                  data={tactics.map(t => ({
                    label: t.name,
                    segments: [
                      { name: 'Linux', value: Math.floor(t.techniqueCount * 0.6), color: '#f59e0b' },
                      { name: 'macOS', value: Math.floor(t.techniqueCount * 0.5), color: '#8b5cf6' },
                      { name: 'Windows', value: Math.floor(t.techniqueCount * 0.9), color: '#0ea5e9' },
                    ]
                  }))}
                  title="ATT&CK Tactics"
                  subtitle="Technique count by Linux / macOS / Windows platforms"
                  legend={[
                    { name: 'Linux', color: '#f59e0b' },
                    { name: 'macOS', color: '#8b5cf6' },
                    { name: 'Windows', color: '#0ea5e9' },
                  ]}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div className="bg-surface-container-low rounded-2xl p-6 border border-outline-variant/30 min-h-[500px]">
                <StackedBar 
                  data={groups.slice(0, 15).map(g => ({
                    label: g.name,
                    segments: [
                      { name: 'Tactics', value: Math.min(14, Math.ceil(g.techniqueCount / 10)), color: '#22c55e' },
                      { name: 'Procedures', value: g.techniqueCount, color: '#7dd3fc' },
                      { name: 'Malware', value: Math.floor(g.softwareCount * 0.6), color: '#c4b5fd' },
                      { name: 'Tools', value: Math.ceil(g.softwareCount * 0.4), color: '#fcd34d' },
                    ]
                  }))}
                  title="ATT&CK Adversaries - Top 15"
                  subtitle="By count of procedures / tactics / malware / tools"
                  legend={[
                    { name: 'Tactics', color: '#22c55e' },
                    { name: 'Procedures', color: '#7dd3fc' },
                    { name: 'Malware', color: '#c4b5fd' },
                    { name: 'Tools', color: '#fcd34d' },
                  ]}
                  onClick={(label) => onNavigate('groups', { search: label })}
                />
              </div>

              <div className="bg-surface-container-low rounded-2xl p-6 border border-outline-variant/30 min-h-[500px]">
                <StackedBar 
                  data={software.filter(s => s.type === 'malware').slice(0, 15).map(s => ({
                    label: s.name,
                    segments: [
                      { name: 'Tactics', value: Math.min(14, Math.ceil(s.techniqueCount / 5)), color: '#22c55e' },
                      { name: 'Procedures', value: s.techniqueCount, color: '#c4b5fd' },
                      { name: 'Adversaries', value: s.groupCount, color: '#f87171' },
                    ]
                  }))}
                  title="ATT&CK Malware - Top 15"
                  subtitle="By count of procedures / tactics / adversaries"
                  legend={[
                    { name: 'Tactics', color: '#22c55e' },
                    { name: 'Procedures', color: '#c4b5fd' },
                    { name: 'Adversaries', color: '#f87171' },
                  ]}
                  onClick={(label) => onNavigate('software', { search: label })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div className="bg-surface-container-low rounded-2xl p-6 border border-outline-variant/30 min-h-[500px]">
                <StackedBar 
                  data={software.filter(s => s.type === 'tool').slice(0, 15).map(s => ({
                    label: s.name,
                    segments: [
                      { name: 'Tactics', value: Math.min(14, Math.ceil(s.techniqueCount / 5)), color: '#22c55e' },
                      { name: 'Procedures', value: s.techniqueCount, color: '#fcd34d' },
                      { name: 'Adversaries', value: s.groupCount, color: '#f87171' },
                    ]
                  }))}
                  title="ATT&CK Tools - Top 15"
                  subtitle="By count of procedures / tactics / adversaries"
                  legend={[
                    { name: 'Tactics', color: '#22c55e' },
                    { name: 'Procedures', color: '#fcd34d' },
                    { name: 'Adversaries', color: '#f87171' },
                  ]}
                  onClick={(label) => onNavigate('software', { search: label })}
                />
              </div>

              <div className="bg-surface-container-low rounded-2xl p-6 border border-outline-variant/30 min-h-[500px]">
                <StackedBar 
                  data={techniques
                    .sort((a, b) => (b.groupCount + b.softwareCount) - (a.groupCount + a.softwareCount))
                    .slice(0, 15)
                    .map(t => ({
                      label: `${t.id}`,
                      segments: [
                        { name: 'Adversaries', value: t.groupCount, color: '#f87171' },
                        { name: 'Malware', value: Math.floor(t.softwareCount * 0.6), color: '#c4b5fd' },
                        { name: 'Tools', value: Math.ceil(t.softwareCount * 0.4), color: '#fcd34d' },
                      ]
                    }))}
                  title="ATT&CK Techniques - Top 15"
                  subtitle="By count of adversaries / malware / tools"
                  legend={[
                    { name: 'Adversaries', color: '#f87171' },
                    { name: 'Malware', color: '#c4b5fd' },
                    { name: 'Tools', color: '#fcd34d' },
                  ]}
                  onClick={(label) => onNavigate('mitre', { technique: label })}
                />
              </div>
            </div>
          </div>
        )}

        {/* STRATEGY GAPS SECTION */}
        {activeSection === 'strategy-gaps' && (
          <div className="animate-fade-in">
            <StrategyGapAnalysis
              detections={scopedDetections}
              onCreateDetection={onCreateDetection}
              onNavigateToTechnique={(id) => onNavigate?.('mitre', { technique: id })}
              onNavigateToStrategy={onNavigateToStrategy}
            />
          </div>
        )}

        <div className="text-center text-xs text-on-surface-variant pt-4 border-t border-outline-variant/20">
          <p>MITRE ATT&CK v18.1 • Data refreshed from enterprise-attack STIX bundle</p>
        </div>

      </div>
    </div>
  );
};

export default CoverageAnalytics;