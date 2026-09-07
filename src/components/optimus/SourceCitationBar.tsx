import React from 'react';
import { OptimusSource } from '../../types/optimus';
import { Icon } from '../Icon';
import type { IconName } from '../Icon';

interface SourceCitationBarProps {
  sources: OptimusSource[];
}

const sourceTypeIcons: Record<string, IconName> = {
  mitre: 'shield',
  library: 'file-code',
  web: 'globe',
};

const sourceTypeLabels: Record<string, string> = {
  mitre: 'MITRE ATT&CK',
  library: 'Detection Library',
  web: 'Web Source',
};

export const SourceCitationBar: React.FC<SourceCitationBarProps> = ({ sources }) => {
  if (!sources || sources.length === 0) return null;

  return (
    <div className="mt-3 pt-3 border-t border-outline-variant/10">
      <div className="flex items-center gap-1.5 mb-2">
        <Icon name="book-open" className="w-3 h-3 text-on-surface-variant/50" />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant/50">
          Sources ({sources.length})
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {sources.map((source, idx) => (
          <div
            key={idx}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-surface-container-high/50 hover:bg-surface-container-high rounded-lg text-[10px] text-on-surface-variant transition-colors"
            title={`${sourceTypeLabels[source.type] || source.type}: ${source.title}`}
          >
            <Icon
              name={sourceTypeIcons[source.type] || 'link'}
              className="w-3 h-3 text-on-surface-variant/60"
            />
            {source.url && /^https?:\/\//i.test(source.url) ? (
              <a
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-primary hover:underline truncate max-w-[200px]"
              >
                {source.title}
              </a>
            ) : (
              <span className="truncate max-w-[200px]">{source.title}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
