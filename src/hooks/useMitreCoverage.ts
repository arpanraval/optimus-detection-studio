
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

export interface CoveredDetectionInfo {
  id: string;
  name: string;
  status: string;
  severity: string;
  qualityScore?: number;
}

export interface CoverageMap {
  [mitreId: string]: {
    covered: boolean;
    detectionCount: number;
    detections: CoveredDetectionInfo[];
  };
}

export function useMitreCoverage(scope: 'production' | 'all' = 'production') {
  const [coverage, setCoverage] = useState<CoverageMap>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCoverage();
  }, [scope]);

  async function loadCoverage() {
    setLoading(true);

    try {
      // Get detections with metadata needed for exports
      let query = supabase
        .from('detections')
        .select('id, name, status, severity, qualityScore, mitreAttackIds');

      if (scope === 'production') {
        // Production Library = library_type 'user' (semantic flip)
        query = query.eq('library_type', 'user');
      }
      // 'all' = no filter (includes both Production + Lab)

      const { data: detections, error } = await query;

      if (error) throw error;

      // Build coverage map
      const coverageMap: CoverageMap = {};
      
      detections?.forEach(detection => {
        const techniques = detection.mitreAttackIds || [];
        const detectionInfo: CoveredDetectionInfo = {
            id: detection.id,
            name: detection.name,
            status: detection.status,
            severity: detection.severity,
            qualityScore: detection.qualityScore
        };

        techniques.forEach((mitreId: string) => {
          if (!coverageMap[mitreId]) {
            coverageMap[mitreId] = { covered: true, detectionCount: 0, detections: [] };
          }
          coverageMap[mitreId].detectionCount++;
          coverageMap[mitreId].detections.push(detectionInfo);
        });
      });

      setCoverage(coverageMap);
    } catch (err) {
      console.error('Failed to load coverage:', err);
    } finally {
      setLoading(false);
    }
  }

  function getCoverageColor(mitreId: string): string {
    const techCoverage = coverage[mitreId];
    
    if (!techCoverage) {
      // Uncovered: Use semantic surface color that adapts to light/dark
      return 'bg-surface-container-lowest text-on-surface-variant/60 border-b border-outline-variant/20 hover:bg-surface-container-low'; 
    }
    
    const count = techCoverage.detectionCount;
    
    // M3 Deep Green Palette - using hex for specific heat map colors, but could use semantic if defined
    // High Coverage (5+): Deepest Emerald/Forest
    if (count >= 5) return 'bg-[#004D40] text-[#E0F2F1] border-b border-[#00382e] hover:bg-[#00695C] font-bold shadow-inner'; 
    
    // Medium Coverage (3-4): Rich Green
    if (count >= 3) return 'bg-[#1B5E20] text-[#E8F5E9] border-b border-[#144418] hover:bg-[#2E7D32] font-medium'; 
    
    // Low Coverage (1-2): Lighter Green/Teal mix for visibility
    if (count >= 1) return 'bg-[#006064] text-[#E0F7FA] border-b border-[#004D40] hover:bg-[#00838F]'; 
    
    // Fallback
    return 'bg-surface-container-lowest';
  }

  return { coverage, getCoverageColor, loading };
}
