
import React from 'react';
import { LinkedMitreEntity } from '../../../types';
import { Icon } from '../../Icon';

type EntityType = 'group' | 'software' | 'campaign';

interface LinkedEntityChipsProps {
  label: string;
  entities: LinkedMitreEntity[];
  entityType: EntityType;
  onNavigate?: (mitreId: string) => void;
  emptyText?: string;
}

const ENTITY_CONFIG: Record<EntityType, { icon: string; color: string }> = {
  group: { icon: 'users', color: 'primary' },
  software: { icon: 'box', color: 'secondary' },
  campaign: { icon: 'flag', color: 'tertiary' }
};

export const LinkedEntityChips: React.FC<LinkedEntityChipsProps> = ({
  label,
  entities,
  entityType,
  onNavigate,
  emptyText = 'None linked'
}) => {
  const config = ENTITY_CONFIG[entityType];

  return (
    <div className="bg-[#0a0b0c] rounded-lg border border-white/5 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Icon name={config.icon} className={`w-4 h-4 text-${config.color}`} />
        <span className="text-xs font-bold uppercase tracking-wider text-gray-500">{label}</span>
        <span className="text-xs text-gray-600">({entities.length})</span>
      </div>
      
      {entities.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {entities.map(entity => (
            <button
              key={entity.mitre_id}
              onClick={() => onNavigate?.(entity.mitre_id)}
              className={`flex items-center gap-2 px-3 py-1.5 bg-${config.color}/10 border border-${config.color}/30 rounded-lg hover:bg-${config.color}/20 transition-colors group`}
            >
              <span className={`text-xs font-mono font-bold text-${config.color}`}>
                {entity.mitre_id}
              </span>
              <span className="text-sm text-gray-300 group-hover:text-white">
                {entity.name}
              </span>
              <Icon name="external-link" className={`w-3 h-3 text-${config.color}/50 group-hover:text-${config.color}`} />
            </button>
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-500 italic">{emptyText}</p>
      )}
    </div>
  );
};
