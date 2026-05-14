import React from 'react';
import { Icon } from '../Icon';
import { OptimusAction, NavigatorLayerData } from '../../types/optimus';
import { useToast } from '../../hooks/useToast';

interface Props {
  summary: string;
  data: NavigatorLayerData;
  actions?: OptimusAction[];
  onAction: (action: OptimusAction) => void;
}

export const NavigatorLayerCard: React.FC<Props> = ({ summary, data, actions, onAction }) => {
  const { showToast } = useToast();
  const layerJson = JSON.stringify(data.layer, null, 2);
  const stats = data.stats || { totalTechniques: 0, coveredTechniques: 0, coveragePercent: 0 };

  const handleDownload = () => {
    const blob = new Blob([layerJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safeName = (data.layer?.name || 'detection-coverage').replace(/[^a-z0-9-_]/gi, '-').toLowerCase();
    a.href = url;
    a.download = `${safeName}-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('success', 'Downloaded', 'Navigator layer saved');
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(layerJson);
      showToast('success', 'Copied', 'Layer JSON in clipboard');
    } catch {
      showToast('error', 'Copy failed', 'Clipboard access denied');
    }
  };

  const handleOpenInNavigator = async () => {
    // The Navigator does not accept a layer payload via URL — only a hosted-file
    // `?layerURL=` parameter. To still give the user a one-click flow, copy the
    // layer JSON to clipboard and open the Navigator in a new tab. The user
    // pastes via Navigator's "Open Existing Layer" dialog.
    try {
      await navigator.clipboard.writeText(layerJson);
      showToast(
        'info',
        'Layer copied — paste in Navigator',
        'In the new tab, choose "Open Existing Layer" and paste from clipboard.',
      );
    } catch {
      showToast('error', 'Copy failed', 'Clipboard access denied. Use Download JSON instead.');
    }
    window.open('https://mitre-attack.github.io/attack-navigator/', '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="bg-surface-container-low rounded-2xl border border-outline-variant/15 overflow-hidden shadow-sm">
      <div className="p-5 border-b border-outline-variant/10 bg-surface-container-lowest/30">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
            <Icon name="layers" className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-bold text-on-surface tracking-tight truncate">
              {data.layer?.name || 'Detection Coverage'}
            </h3>
            <p className="text-xs text-on-surface-variant/70">MITRE ATT&CK Navigator layer</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="bg-surface-container-low rounded-lg p-3 border border-outline-variant/10">
            <div className="text-xl font-bold text-on-surface tabular-nums">{stats.totalTechniques}</div>
            <div className="text-[10px] uppercase tracking-wider text-on-surface-variant/60 mt-0.5">Techniques</div>
          </div>
          <div className="bg-surface-container-low rounded-lg p-3 border border-outline-variant/10">
            <div className="text-xl font-bold text-primary tabular-nums">{stats.coveredTechniques}</div>
            <div className="text-[10px] uppercase tracking-wider text-on-surface-variant/60 mt-0.5">Covered</div>
          </div>
          <div className="bg-surface-container-low rounded-lg p-3 border border-outline-variant/10">
            <div className="text-xl font-bold text-primary tabular-nums">{stats.coveragePercent}%</div>
            <div className="text-[10px] uppercase tracking-wider text-on-surface-variant/60 mt-0.5">Coverage</div>
          </div>
        </div>
      </div>

      {summary && (
        <div className="px-5 py-4 bg-surface-container-low border-b border-outline-variant/5">
          <p className="text-sm text-on-surface-variant leading-relaxed">{summary}</p>
        </div>
      )}

      <div className="px-5 py-4 bg-surface-container-lowest flex flex-wrap gap-2.5">
        <button
          onClick={handleDownload}
          className="px-4 py-2 text-sm font-medium bg-primary text-on-primary rounded-lg hover:bg-primary/90 shadow-sm transition-colors flex items-center gap-2"
        >
          <Icon name="download" className="w-4 h-4" />
          Download JSON
        </button>
        <button
          onClick={handleOpenInNavigator}
          className="px-4 py-2 text-sm font-medium bg-surface-container text-on-surface hover:bg-surface-container-high border border-outline-variant/20 rounded-lg transition-colors flex items-center gap-2"
        >
          <Icon name="external-link" className="w-4 h-4" />
          Open Navigator
        </button>
        <button
          onClick={handleCopy}
          className="px-4 py-2 text-sm font-medium bg-surface-container text-on-surface hover:bg-surface-container-high border border-outline-variant/20 rounded-lg transition-colors flex items-center gap-2"
        >
          <Icon name="copy" className="w-4 h-4" />
          Copy
        </button>
        {actions?.map((action, i) => (
          <button
            key={i}
            onClick={() => onAction(action)}
            className="px-4 py-2 text-sm font-medium bg-surface-container text-on-surface hover:bg-surface-container-high border border-outline-variant/20 rounded-lg transition-colors"
          >
            {action.label}
          </button>
        ))}
      </div>
    </div>
  );
};

export default NavigatorLayerCard;
