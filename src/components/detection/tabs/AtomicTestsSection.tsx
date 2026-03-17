
import React, { useState } from 'react';
import { Detection } from '../../../types';
import { useAtomicTests } from '@/hooks/useAtomicTests';
import { AtomicTestMatch, MatchType } from '@/types/attack-rule-map';
import { Icon } from '../../Icon';
import { useToast } from '../../../hooks/useToast';

interface AtomicTestsSectionProps {
  detection: Detection;
}

const MatchBadge: React.FC<{ type: MatchType }> = ({ type }) => {
    const styles = {
        sigma: 'bg-green-500/20 text-green-400 border-green-500/30',
        splunk: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
        technique: 'bg-surface-container-highest text-on-surface-variant border-outline-variant/30'
    };
    
    const labels = {
        sigma: 'Sigma Match',
        splunk: 'Splunk Match',
        technique: 'Technique Match'
    };

    return (
        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${styles[type]}`}>
            {labels[type]}
        </span>
    );
};

const PlatformBadge: React.FC<{ platform: string }> = ({ platform }) => {
    const isWindows = platform.toLowerCase().includes('windows');
    return (
        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border flex items-center gap-1 ${
            isWindows 
            ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' 
            : 'bg-amber-500/20 text-amber-400 border-amber-500/30'
        }`}>
            {isWindows ? <Icon name="monitor" className="w-3 h-3" /> : <Icon name="terminal" className="w-3 h-3" />}
            {platform}
        </span>
    );
};

const AtomicTestCard: React.FC<{ match: AtomicTestMatch }> = ({ match }) => {
    const { test, matchedVia } = match;
    const { showToast } = useToast();
    
    const copyCommand = () => {
        const cmd = `Invoke-AtomicTest ${test.tech_id} -TestGuids ${test.atomic_attack_guid}`;
        navigator.clipboard.writeText(cmd);
        showToast('success', 'Command Copied', 'PowerShell command copied to clipboard');
    };

    return (
        <div className="bg-surface-container-low border border-outline-variant/30 rounded-xl p-4 hover:border-primary/30 transition-all">
            <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs font-bold text-on-surface bg-surface-container-high px-2 py-0.5 rounded">
                        {test.tech_id}
                    </span>
                    <PlatformBadge platform={test.platform} />
                    <MatchBadge type={matchedVia.type} />
                </div>
                <a 
                    href={`https://atomicredteam.io/atomics/${test.tech_id}/#${test.atomic_attack_guid}`}
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-xs font-bold text-primary hover:underline flex items-center gap-1"
                >
                    View Test <Icon name="external-link" className="w-3 h-3" />
                </a>
            </div>
            
            <h4 className="font-bold text-sm text-on-surface mb-2">{test.atomic_attack_name}</h4>
            
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-outline-variant/20">
                <div className="text-xs text-on-surface-variant flex items-center gap-1">
                    <span>Matched via:</span>
                    {matchedVia.ruleLink ? (
                        <a href={/^https?:\/\//i.test(matchedVia.ruleLink) ? matchedVia.ruleLink : '#'} target="_blank" rel="noopener noreferrer" className="font-medium text-on-surface hover:text-primary hover:underline">
                            {matchedVia.ruleName}
                        </a>
                    ) : (
                        <span className="font-medium text-on-surface">{matchedVia.ruleName}</span>
                    )}
                </div>
                
                {test.platform.toLowerCase().includes('windows') && (
                    <button 
                        onClick={copyCommand}
                        className="text-[10px] font-mono bg-surface-container-high hover:bg-surface-variant text-on-surface px-2 py-1 rounded border border-outline-variant/30 transition-colors flex items-center gap-2"
                        title="Copy Invoke-AtomicTest command"
                    >
                        <span className="opacity-50 select-none">$</span> Invoke-AtomicTest...
                        <Icon name="copy" className="w-3 h-3" />
                    </button>
                )}
            </div>
        </div>
    );
};

export const AtomicTestsSection: React.FC<AtomicTestsSectionProps> = ({ detection }) => {
  const { matches, loading } = useAtomicTests(detection);
  const [showAllRelated, setShowAllRelated] = useState(false);

  const hasMatches = matches.direct.length > 0 || matches.related.length > 0;

  if (loading) {
      return (
          <div className="animate-pulse flex items-center gap-3 p-4 bg-surface-container-low rounded-xl border border-outline-variant/30">
              <div className="w-8 h-8 bg-surface-container-high rounded-full"></div>
              <div className="h-4 w-32 bg-surface-container-high rounded"></div>
          </div>
      );
  }

  if (!hasMatches) {
      return (
          <div className="text-center py-6 bg-surface-container rounded-xl border border-dashed border-outline-variant/30">
              <p className="text-sm text-on-surface-variant italic">No matching Atomic Red Team tests found for this detection.</p>
          </div>
      );
  }

  return (
    <section>
        <div className="flex items-center justify-between mb-4">
            <p className="text-xs text-on-surface-variant">
                {matches.direct.length + matches.related.length} available tests
            </p>
            <a href="https://atomicredteam.io" target="_blank" rel="noreferrer" className="text-[10px] text-on-surface-variant hover:text-primary transition-colors">
                Powered by Atomic Red Team
            </a>
        </div>

        <div className="space-y-6">
            {/* Direct Matches */}
            {matches.direct.length > 0 && (
                <div className="space-y-3 animate-slide-up">
                    <div className="flex items-center gap-2 text-xs font-bold text-green-500 uppercase tracking-widest">
                        <Icon name="check-circle" className="w-4 h-4" />
                        Direct Rule Matches ({matches.direct.length})
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {matches.direct.map((match) => (
                            <AtomicTestCard key={match.test.atomic_attack_guid} match={match} />
                        ))}
                    </div>
                </div>
            )}

            {/* Related Matches */}
            {matches.related.length > 0 && (
                <div className="space-y-3 animate-slide-up" style={{ animationDelay: '100ms' }}>
                    {matches.direct.length > 0 && <div className="h-px bg-outline-variant/20 my-4" />}
                    
                    <div className="flex items-center gap-2 text-xs font-bold text-on-surface-variant uppercase tracking-widest">
                        <Icon name="matrix" className="w-4 h-4" />
                        Related by MITRE Technique ({matches.related.length})
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {(showAllRelated ? matches.related : matches.related.slice(0, 4)).map((match) => (
                            <AtomicTestCard key={match.test.atomic_attack_guid} match={match} />
                        ))}
                    </div>
                    
                    {!showAllRelated && matches.related.length > 4 && (
                        <button 
                            onClick={() => setShowAllRelated(true)}
                            className="w-full py-2 text-xs font-bold text-on-surface-variant hover:text-primary bg-surface-container hover:bg-surface-container-high rounded-lg transition-colors border border-outline-variant/30"
                        >
                            Show {matches.related.length - 4} more tests
                        </button>
                    )}
                </div>
            )}
        </div>
    </section>
  );
};
