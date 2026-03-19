import React from 'react';

export function ConversionOpportunities() {
  return (
    <div className="bg-surface-container rounded-xl border border-outline/10 p-5">
      <h3 className="text-sm font-semibold text-on-surface mb-3">Conversion Opportunities</h3>
      <p className="text-xs text-on-surface-variant mb-3">
        Detections that exist in one query language but could be converted for deployment to additional SIEMs.
      </p>
      <div className="bg-amber-500/10 rounded-lg p-3 flex items-start gap-2">
        <span className="text-amber-400 text-xs mt-0.5">⚠</span>
        <p className="text-xs text-amber-300/80">
          Conversion required — query language and log schema may differ. Review and test before deploying to a new SIEM.
        </p>
      </div>
      {/* This section will be populated when cross-SIEM query data is available */}
      <p className="text-xs text-on-surface-variant mt-3 italic">
        Cross-SIEM analysis will appear here once detections are deployed to your connected SIEMs.
      </p>
    </div>
  );
}
