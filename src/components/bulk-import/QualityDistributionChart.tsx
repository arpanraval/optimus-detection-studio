/**
 * QualityDistributionChart - Visual chart showing quality score distribution
 * Uses app's M3 design system
 *
 * Shows histogram of quality scores across imported rules
 */

import React, { useMemo } from 'react';
import { Icon } from '../Icon';
import { ValidatedRule } from '../../services/bulk-import/types';

interface QualityDistributionChartProps {
  /** Validated rules with quality scores */
  rules: ValidatedRule[];
  /** Whether to show only selected rules */
  selectedOnly?: boolean;
}

interface QualityBucket {
  label: string;
  range: [number, number];
  count: number;
  color: string;
  bgColor: string;
}

const QUALITY_THRESHOLDS = {
  excellent: { min: 80, color: 'text-secondary', bgColor: 'bg-secondary' },
  good: { min: 60, color: 'text-tertiary', bgColor: 'bg-tertiary' },
  fair: { min: 40, color: 'text-primary', bgColor: 'bg-primary' },
  poor: { min: 0, color: 'text-error', bgColor: 'bg-error' },
};

export function QualityDistributionChart({
  rules,
  selectedOnly = false,
}: QualityDistributionChartProps) {
  const { buckets, stats, maxCount } = useMemo(() => {
    const filteredRules = selectedOnly ? rules.filter((r) => r.selected) : rules;

    // Create quality score buckets
    const bucketDefs: QualityBucket[] = [
      { label: '0-20', range: [0, 20], count: 0, color: 'text-error', bgColor: 'bg-error' },
      { label: '21-40', range: [21, 40], count: 0, color: 'text-error/70', bgColor: 'bg-error/70' },
      { label: '41-60', range: [41, 60], count: 0, color: 'text-primary', bgColor: 'bg-primary' },
      { label: '61-80', range: [61, 80], count: 0, color: 'text-tertiary', bgColor: 'bg-tertiary' },
      { label: '81-100', range: [81, 100], count: 0, color: 'text-secondary', bgColor: 'bg-secondary' },
    ];

    // Count rules in each bucket
    let totalScore = 0;
    let minScore = 100;
    let maxScore = 0;

    for (const rule of filteredRules) {
      const score = rule.validation.qualityScore;
      totalScore += score;
      minScore = Math.min(minScore, score);
      maxScore = Math.max(maxScore, score);

      for (const bucket of bucketDefs) {
        if (score >= bucket.range[0] && score <= bucket.range[1]) {
          bucket.count++;
          break;
        }
      }
    }

    const avgScore = filteredRules.length > 0 ? totalScore / filteredRules.length : 0;
    const maxBucketCount = Math.max(...bucketDefs.map((b) => b.count), 1);

    return {
      buckets: bucketDefs,
      stats: {
        avg: avgScore.toFixed(0),
        min: filteredRules.length > 0 ? minScore : 0,
        max: filteredRules.length > 0 ? maxScore : 0,
        total: filteredRules.length,
      },
      maxCount: maxBucketCount,
    };
  }, [rules, selectedOnly]);

  // Get quality level label
  const getQualityLevel = (score: number): { label: string; color: string } => {
    if (score >= 80) return { label: 'Excellent', color: 'text-secondary' };
    if (score >= 60) return { label: 'Good', color: 'text-tertiary' };
    if (score >= 40) return { label: 'Fair', color: 'text-primary' };
    return { label: 'Poor', color: 'text-error' };
  };

  const avgQuality = getQualityLevel(parseInt(stats.avg));

  return (
    <div className="bg-surface-container rounded-[16px] p-5">
      <h3 className="text-sm font-semibold text-on-surface mb-4 flex items-center gap-2">
        <Icon name="bar-chart-2" className="w-4 h-4 text-on-surface-variant" />
        Quality Distribution
        {selectedOnly && (
          <span className="text-xs font-normal text-on-surface-variant">(Selected only)</span>
        )}
      </h3>

      {/* Average quality indicator */}
      <div className="mb-4 p-3 bg-surface-variant/50 rounded-[12px]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs text-on-surface-variant">Average Quality:</span>
            <span className={`text-2xl font-bold ${avgQuality.color}`}>
              {stats.avg}
            </span>
            <span className={`text-xs font-medium ${avgQuality.color}`}>
              / 100 ({avgQuality.label})
            </span>
          </div>
          <div className="text-right">
            <span className="text-xs text-on-surface-variant">
              {stats.total.toLocaleString()} rules
            </span>
          </div>
        </div>
      </div>

      {/* Histogram */}
      <div className="space-y-2">
        {buckets.map((bucket) => {
          const widthPercent = (bucket.count / maxCount) * 100;

          return (
            <div key={bucket.label} className="flex items-center gap-3">
              {/* Label */}
              <span className="text-xs text-on-surface-variant w-12 text-right">
                {bucket.label}
              </span>

              {/* Bar */}
              <div className="flex-1 h-6 bg-surface-variant/50 rounded overflow-hidden relative">
                <div
                  className={`h-full ${bucket.bgColor} rounded transition-all duration-500`}
                  style={{ width: `${Math.max(widthPercent, bucket.count > 0 ? 3 : 0)}%` }}
                />
                {bucket.count > 0 && (
                  <span className="absolute inset-y-0 right-2 flex items-center text-xs font-medium text-on-surface">
                    {bucket.count.toLocaleString()}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Min/Max indicators */}
      <div className="mt-4 pt-3 border-t border-outline-variant/20 flex justify-between text-xs">
        <div className="flex items-center gap-1">
          <Icon name="arrow-down" className="w-3 h-3 text-error" />
          <span className="text-on-surface-variant">Min:</span>
          <span className="font-medium text-error">{stats.min}</span>
        </div>
        <div className="flex items-center gap-1">
          <Icon name="arrow-up" className="w-3 h-3 text-secondary" />
          <span className="text-on-surface-variant">Max:</span>
          <span className="font-medium text-secondary">{stats.max}</span>
        </div>
      </div>

      {/* Quality score legend */}
      <div className="mt-3 pt-3 border-t border-outline-variant/20">
        <p className="text-[10px] text-on-surface-variant mb-2">Quality is based on:</p>
        <div className="flex flex-wrap gap-2 text-[10px]">
          <span className="px-1.5 py-0.5 bg-surface-variant rounded">Title</span>
          <span className="px-1.5 py-0.5 bg-surface-variant rounded">Description</span>
          <span className="px-1.5 py-0.5 bg-surface-variant rounded">MITRE</span>
          <span className="px-1.5 py-0.5 bg-surface-variant rounded">References</span>
          <span className="px-1.5 py-0.5 bg-surface-variant rounded">False Positives</span>
        </div>
      </div>
    </div>
  );
}

export default QualityDistributionChart;
