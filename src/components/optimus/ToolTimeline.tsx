/**
 * Tool Timeline Component
 * Displays tool execution progress with subtle, professional design
 */

import React, { useState, useEffect } from 'react';

interface ToolCall {
  name: string;
  status: 'running' | 'completed' | 'error';
  startTime: number;
  endTime?: number;
}

interface Props {
  tools: ToolCall[];
  isComplete: boolean;
}

const toolLabels: Record<string, string> = {
  'search_library': 'Searching detection library',
  'get_coverage_summary': 'Analyzing coverage metrics',
  'find_threat_actor': 'Looking up threat actor',
  'get_threat_actor_coverage': 'Analyzing actor coverage',
  'identify_coverage_gaps': 'Identifying coverage gaps',
  'query_mitre': 'Querying MITRE ATT&CK',
  'generate_navigator_layer': 'Generating Navigator layer',
  'web_search': 'Searching threat intelligence'
};

export const ToolTimeline: React.FC<Props> = ({ tools, isComplete }) => {
  const [collapsed, setCollapsed] = useState(false);
  const [totalTime, setTotalTime] = useState<number | null>(null);

  useEffect(() => {
    if (isComplete && tools.length > 0) {
      const start = Math.min(...tools.map(t => t.startTime));
      const end = Math.max(...tools.map(t => t.endTime || Date.now()));
      setTotalTime((end - start) / 1000);

      // Auto-collapse after completion
      const timer = setTimeout(() => setCollapsed(true), 1000);
      return () => clearTimeout(timer);
    }
  }, [isComplete, tools]);

  if (tools.length === 0) return null;

  // Collapsed view
  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        className="flex items-center gap-2 text-xs text-on-surface-variant/60 hover:text-on-surface-variant transition-colors mb-3"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
        <span>Analyzed {tools.length} source{tools.length > 1 ? 's' : ''}</span>
        {totalTime && <span>in {totalTime.toFixed(1)}s</span>}
        <span className="text-on-surface-variant/40">↓</span>
      </button>
    );
  }

  // Expanded view
  return (
    <div className="mb-4 py-3 border-l-2 border-outline-variant/20 pl-4 space-y-2">
      {tools.map((tool, index) => (
        <div key={index} className="flex items-center gap-3">
          {/* Status indicator */}
          {tool.status === 'running' ? (
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
          ) : tool.status === 'completed' ? (
            <span className="w-2 h-2 rounded-full bg-green-500" />
          ) : (
            <span className="w-2 h-2 rounded-full bg-red-500" />
          )}

          {/* Label */}
          <span className={`text-xs ${
            tool.status === 'running'
              ? 'text-on-surface-variant'
              : 'text-on-surface-variant/60'
          }`}>
            {toolLabels[tool.name] || tool.name}
          </span>

          {/* Progress bar for running */}
          {tool.status === 'running' && (
            <div className="flex-1 max-w-24 h-0.5 bg-surface-container-highest rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full"
                style={{
                  animation: 'progress 2s ease-in-out infinite'
                }}
              />
            </div>
          )}
        </div>
      ))}

      {/* Collapse button when complete */}
      {isComplete && (
        <button
          onClick={() => setCollapsed(true)}
          className="text-xs text-on-surface-variant/40 hover:text-on-surface-variant/60 transition-colors mt-2"
        >
          Collapse ↑
        </button>
      )}

      {/* Animation keyframes */}
      <style>{`
        @keyframes progress {
          0% { width: 0%; }
          50% { width: 70%; }
          100% { width: 100%; }
        }
      `}</style>
    </div>
  );
};

export default ToolTimeline;
