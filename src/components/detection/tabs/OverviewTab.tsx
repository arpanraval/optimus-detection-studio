import React, { useMemo } from 'react';
import { Detection, LinkedMitreEntity } from '../../../types';
import { LIBRARY_LABELS } from '../../../types/detection';
import { LIBRARY_DEVELOPMENT, LIBRARY_PRODUCTION, PROMOTION_NONE, PROMOTION_PENDING, PROMOTION_PROMOTED, PROMOTION_REJECTED } from '../../../constants/library';
import { Icon } from '../../Icon';
import { getMitreDataById } from '../../../mitre';
import { StatusBadge } from '../../StatusBadge';
import { sourceConfig } from '../../card-utils';
import { DetailCard } from '../DetailCard';
import { PackMembershipCard } from '../PackMembershipCard';

interface OverviewTabProps {
  detection: Detection;
  sourceRule?: Detection | null; // Source rule for forked detections
  onNavigateToGroup?: (mitreId: string) => void;
  onNavigateToSoftware?: (mitreId: string) => void;
  onNavigateToCampaign?: (mitreId: string) => void;
  onNavigateToTechnique?: (mitreId: string) => void;
  onViewSourceRule?: () => void; // Navigate to source rule
}


const DetailField: React.FC<{ label: string; value: React.ReactNode; fullWidth?: boolean }> = ({ label, value, fullWidth }) => (
  <div className={fullWidth ? 'col-span-full' : ''}>
    <label className="block text-sm font-medium text-on-surface-variant mb-1.5">{label}</label>
    <div className="text-sm text-on-surface font-medium leading-relaxed">
      {value || <span className="text-on-surface-variant italic">Not specified</span>}
    </div>
  </div>
);

const LinkedEntityChip: React.FC<{ entity: LinkedMitreEntity; icon: string; colorClass: string; onClick?: () => void }> = ({ entity, icon, colorClass, onClick }) => (
  <button 
    onClick={onClick}
    className="flex items-center gap-2 px-3 py-1.5 bg-surface-container-high border border-outline-variant/20 rounded-lg hover:bg-surface-variant hover:border-outline-variant/40 transition-all group"
  >
    <Icon name={icon} className={`w-3.5 h-3.5 ${colorClass}`} />
    <span className="text-xs font-mono font-bold text-on-surface-variant group-hover:text-on-surface">{entity.mitre_id}</span>
    <span className="text-xs font-medium text-on-surface truncate max-w-[150px]">{entity.name}</span>
  </button>
);

// L2: Chip component for array fields
const ArrayFieldChips: React.FC<{ items: string[]; emptyText?: string; className?: string }> = ({ 
  items, 
  emptyText = 'None specified',
  className = ''
}) => (
  <div className={`flex flex-wrap gap-2 ${className}`}>
    {items && items.length > 0 ? (
      items.map((item, idx) => (
        <span 
          key={`${item}-${idx}`} 
          className="px-2.5 py-1 bg-surface-container text-on-surface text-xs rounded-md border border-outline-variant/20"
        >
          {item}
        </span>
      ))
    ) : (
      <span className="text-sm text-on-surface-variant italic">{emptyText}</span>
    )}
  </div>
);

export const OverviewTab: React.FC<OverviewTabProps> = ({
  detection,
  sourceRule,
  onNavigateToGroup,
  onNavigateToSoftware,
  onNavigateToCampaign,
  onNavigateToTechnique,
  onViewSourceRule
}) => {

  const groupedTechniques = useMemo(() => {
    const grouped: Record<string, { id: string; name: string; url: string }[]> = {};
    
    detection.mitreAttackIds.forEach(id => {
        const data = getMitreDataById(id);
        let tacticName = 'Uncategorized';
        let techniqueName = 'Unknown Technique';

        if (data) {
            tacticName = data.tactic; 
            techniqueName = data.subTechnique 
                ? `${data.technique}: ${data.subTechnique}` 
                : data.technique;
        }

        if (!grouped[tacticName]) grouped[tacticName] = [];
        
        grouped[tacticName].push({
            id: id,
            name: techniqueName,
            url: `https://attack.mitre.org/techniques/${id.replace('.', '/')}`
        });
    });

    return grouped;
  }, [detection.mitreAttackIds]);

  // Check if this is a Development Library rule
  const isDevelopmentRule = detection.library_type === LIBRARY_DEVELOPMENT;
  const isForkedFromDevelopment = detection.source_rule_id !== null;

  // L1: Get source info
  const hasSourceInfo = detection.source || detection.external_id || detection.source_url;

  return (
    <div className="animate-fade-in space-y-6">
      
      {/* L1: Source Information Card - Only for Universal rules with source info */}
      {isDevelopmentRule && hasSourceInfo && (
        <DetailCard 
          title="Source Information" 
          description="Origin and external references for this detection rule"
          className="border-secondary/30 bg-secondary/5"
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Source */}
            <div>
              <label className="block text-sm font-medium text-on-surface-variant mb-2">Source</label>
              {detection.source ? (
                <span className={`inline-flex px-3 py-1.5 rounded-lg text-sm font-bold ${
                  sourceConfig[detection.source]?.className || sourceConfig.custom.className
                }`}>
                  {sourceConfig[detection.source]?.label || detection.source}
                </span>
              ) : (
                <span className="text-sm text-on-surface-variant italic">Not specified</span>
              )}
            </div>
            
            {/* External ID */}
            <div>
              <label className="block text-sm font-medium text-on-surface-variant mb-2">External ID</label>
              {detection.external_id ? (
                <span className="font-mono text-sm text-on-surface bg-surface-container px-2 py-1 rounded border border-outline-variant/20">
                  {detection.external_id}
                </span>
              ) : (
                <span className="text-sm text-on-surface-variant italic">Not specified</span>
              )}
            </div>
            
            {/* Source URL */}
            <div>
              <label className="block text-sm font-medium text-on-surface-variant mb-2">Source URL</label>
              {detection.source_url ? (
                <a 
                  href={/^https?:\/\//i.test(detection.source_url) ? detection.source_url : '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-400 hover:text-blue-300 hover:underline flex items-center gap-1.5 truncate"
                >
                  <Icon name="external-link" className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="truncate">{detection.source_url}</span>
                </a>
              ) : (
                <span className="text-sm text-on-surface-variant italic">Not specified</span>
              )}
            </div>
          </div>
        </DetailCard>
      )}

      {/* Fork Source Card - For user rules copied from Universal */}
      {isForkedFromDevelopment && sourceRule && (
        <DetailCard 
          title="Forked From" 
          description={`This detection was forked from ${LIBRARY_LABELS[LIBRARY_DEVELOPMENT]}`}
          className="border-teal-500/30 bg-teal-500/5"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-teal-500/10 border border-teal-500/20">
                <Icon name="git-branch" className="w-6 h-6 text-teal-600 dark:text-teal-400" />
              </div>
              <div>
                <p className="text-base font-medium text-on-surface">{sourceRule.name}</p>
                <p className="text-sm text-on-surface-variant mt-0.5">
                  {sourceRule.source && sourceRule.source !== 'custom' && (
                    <span className="mr-2">
                      Source: <span className="font-medium">{sourceConfig[sourceRule.source]?.label || sourceRule.source}</span>
                    </span>
                  )}
                  <span className="font-mono text-xs">#{sourceRule.id.slice(0, 8)}</span>
                </p>
              </div>
            </div>
            {onViewSourceRule && (
              <button
                onClick={onViewSourceRule}
                className="px-4 py-2 text-sm font-medium bg-teal-500/10 text-teal-600 dark:text-teal-400 rounded-lg border border-teal-500/20 hover:bg-teal-500/20 transition-colors flex items-center gap-2"
              >
                <Icon name="external-link" className="w-4 h-4" />
                View Source Rule
              </button>
            )}
          </div>
        </DetailCard>
      )}

      {/* Basic Information */}
      <DetailCard title="Basic Information" description="Core detection metadata and classification">
        <DetailField label="Description" value={detection.description} fullWidth />
        
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
          <DetailField label="Status" value={<StatusBadge status={detection.status} />} />
          <DetailField label="Severity" value={<span className={`px-2 py-0.5 rounded text-xs font-bold border uppercase ${detection.severity === 'Critical' ? 'bg-red-500/10 text-red-500 border-red-500/20' : detection.severity === 'High' ? 'bg-orange-500/10 text-orange-500 border-orange-500/20' : detection.severity === 'Medium' ? 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20' : 'bg-blue-500/10 text-blue-500 border-blue-500/20'}`}>{detection.severity}</span>} />
          <DetailField label="Confidence" value={detection.confidence} />
          <DetailField label="Maturity" value={detection.maturity} />
        </div>

        <div className="grid grid-cols-2 gap-6">
          <DetailField label="Author" value={detection.author} />
          <DetailField label="Detection Type" value={detection.detectionType} />
        </div>
      </DetailCard>

      {/* Data Sources - L2: Enhanced with array fields */}
      <DetailCard title="Data Sources & Platforms" description="Required log sources, technologies, and platforms">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <DetailField label="Target Technology" value={detection.technology} />
          <DetailField label="Primary Log Source" value={detection.logSource} />
        </div>

        {/* L2: Log Sources Array */}
        {detection.logSources && detection.logSources.length > 0 && (
          <div className="pt-4 border-t border-outline-variant/20">
            <label className="block text-sm font-medium text-on-surface-variant mb-2">All Log Sources</label>
            <ArrayFieldChips items={detection.logSources} />
          </div>
        )}

        {/* L2: Data Sources Array (MITRE) */}
        {detection.dataSources && detection.dataSources.length > 0 && (
          <div className="pt-4 border-t border-outline-variant/20">
            <label className="block text-sm font-medium text-on-surface-variant mb-2">MITRE Data Sources</label>
            <ArrayFieldChips items={detection.dataSources} />
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-outline-variant/20">
          <div>
            <label className="block text-sm font-medium text-on-surface-variant mb-2">Platforms</label>
            <ArrayFieldChips items={detection.platforms || []} />
          </div>
          <div>
            <label className="block text-sm font-medium text-on-surface-variant mb-2">Data Components</label>
            <ArrayFieldChips items={detection.dataComponents || []} />
          </div>
        </div>
      </DetailCard>

      {/* Threat Context */}
      <DetailCard title="Threat Context & Classification" description="MITRE ATT&CK mapping and Threat Intelligence">
        
        {/* MITRE Coverage */}
        <div className="space-y-4 mb-6">
          <h4 className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">MITRE ATT&CK</h4>
          {Object.keys(groupedTechniques).length > 0 ? (
            <div className="space-y-4">
              {Object.entries(groupedTechniques).map(([tactic, techniques]) => (
                <div key={tactic} className="bg-surface-container-high/30 rounded-xl p-4 border border-outline-variant/20">
                  <h5 className="text-xs font-bold text-on-surface mb-3 uppercase tracking-wide">{tactic}</h5>
                  <div className="flex flex-wrap gap-2">
                    {techniques.map(tech => (
                      <button
                        key={tech.id}
                        onClick={() => onNavigateToTechnique?.(tech.id)}
                        className="flex items-center gap-2 px-3 py-1.5 bg-surface-container border border-outline-variant/30 rounded-lg hover:border-outline-variant hover:bg-surface-container-high transition-all group text-left"
                      >
                        <span className="text-xs font-mono font-bold text-on-surface-variant group-hover:text-on-surface">{tech.id}</span>
                        <span className="text-xs text-on-surface font-medium truncate max-w-[200px]">{tech.name}</span>
                        <Icon name="external-link" className="w-3 h-3 text-on-surface-variant opacity-0 group-hover:opacity-100 transition-opacity" />
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-on-surface-variant italic">No MITRE ATT&CK techniques mapped.</p>
          )}
        </div>

        <div className="h-px bg-outline-variant/20 mb-6"></div>

        {/* Linked Entities */}
        <div className="space-y-4">
          <h4 className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">Threat Intelligence</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label className="block text-xs font-medium text-on-surface-variant mb-2">Threat Groups</label>
              <div className="flex flex-wrap gap-2">
                {detection.linkedGroups.length > 0 ? detection.linkedGroups.map(g => (
                  <LinkedEntityChip key={g.mitre_id} entity={g} icon="users" colorClass="text-on-surface-variant" onClick={() => onNavigateToGroup?.(g.mitre_id)} />
                )) : <span className="text-xs text-on-surface-variant/60 italic">None linked</span>}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-on-surface-variant mb-2">Software / Tools</label>
              <div className="flex flex-wrap gap-2">
                {detection.linkedSoftware.length > 0 ? detection.linkedSoftware.map(s => (
                  <LinkedEntityChip key={s.mitre_id} entity={s} icon="package" colorClass="text-on-surface-variant" onClick={() => onNavigateToSoftware?.(s.mitre_id)} />
                )) : <span className="text-xs text-on-surface-variant/60 italic">None linked</span>}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-on-surface-variant mb-2">Campaigns</label>
              <div className="flex flex-wrap gap-2">
                {detection.linkedCampaigns.length > 0 ? detection.linkedCampaigns.map(c => (
                  <LinkedEntityChip key={c.mitre_id} entity={c} icon="flag" colorClass="text-on-surface-variant" onClick={() => onNavigateToCampaign?.(c.mitre_id)} />
                )) : <span className="text-xs text-on-surface-variant/60 italic">None linked</span>}
              </div>
            </div>
          </div>
        </div>
      </DetailCard>

      {/* Metadata */}
      <DetailCard title="Metadata" description="Tags, references, and CVEs">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-on-surface-variant mb-2">References</label>
            {Array.isArray(detection.references) && detection.references.length > 0 ? (
              <ul className="space-y-1.5">
                {detection.references.map((ref, i) => (
                  <li key={i}>
                    <a href={/^https?:\/\//i.test(ref) ? ref : '#'} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:text-blue-300 hover:underline flex items-center gap-1.5 truncate">
                      <Icon name="external-link" className="w-3 h-3 flex-shrink-0" />
                      <span className="truncate">{ref}</span>
                    </a>
                  </li>
                ))}
              </ul>
            ) : <span className="text-sm text-on-surface-variant italic">No references added</span>}
          </div>

          <div>
            <label className="block text-sm font-medium text-on-surface-variant mb-2">Associated CVEs</label>
            <div className="flex flex-wrap gap-2">
              {detection.associatedCVEs && detection.associatedCVEs.length > 0 ? (
                detection.associatedCVEs.map(cve => (
                  <a 
                    key={cve} 
                    href={`https://nvd.nist.gov/vuln/detail/${cve}`}
                    target="_blank"
                    rel="noreferrer"
                    className="px-2 py-1 bg-red-500/10 text-red-500 text-xs font-mono font-bold rounded border border-red-500/20 hover:bg-red-500/20 transition-colors"
                  >
                    {cve}
                  </a>
                ))
              ) : <span className="text-sm text-on-surface-variant italic">No CVEs linked</span>}
            </div>
          </div>
        </div>

        <div className="pt-4 border-t border-outline-variant/20">
          <label className="block text-sm font-medium text-on-surface-variant mb-2">Tags</label>
          <div className="flex flex-wrap gap-2">
            {detection.tags && detection.tags.length > 0 ? (
              detection.tags.map(tag => (
                <span key={tag} className="px-3 py-1 bg-surface-container-high text-on-surface text-xs font-medium rounded-full border border-outline-variant/30">
                  #{tag}
                </span>
              ))
            ) : <span className="text-sm text-on-surface-variant italic">No tags</span>}
          </div>
        </div>
      </DetailCard>

      <PackMembershipCard detectionId={detection.id} />

    </div>
  );
};