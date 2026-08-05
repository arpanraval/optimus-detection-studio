import React from 'react';

interface StatCardProps {
  label: string;
  value: React.ReactNode;
  subtext?: string;
  color?: string;
  progress?: number;
}

export const StatCard: React.FC<StatCardProps> = ({ label: rawLabel, value, subtext, color = 'text-on-surface', progress }) => {
  const label = rawLabel === 'Detection Coverage'
    ? 'Library TTP overlap'
    : rawLabel === 'Detection Gaps'
      ? 'Techniques without mapped detections'
      : rawLabel === 'Rules Extracted'
        ? 'Candidate queries found'
        : rawLabel;

  return (
  <div className="bg-surface-container border border-outline-variant/30 rounded-xl p-6 flex flex-col justify-center items-center text-center h-40 relative overflow-hidden hover:border-primary/20 transition-colors">
    <p className="text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-2">{label}</p>
    <span className={`text-5xl font-mono font-bold tracking-tighter ${color}`}>{value}</span>
    {subtext && <p className="text-xs text-on-surface-variant mt-1">{subtext}</p>}
    {progress !== undefined && (
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-surface-variant">
        <div
          className={`h-full transition-all ${progress >= 70 ? 'bg-green-500' : progress >= 40 ? 'bg-amber-500' : 'bg-red-500'}`}
          style={{ width: `${progress}%` }}
        />
      </div>
    )}
  </div>
  );
};
