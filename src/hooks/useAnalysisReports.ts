import { useState, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import type { AnalysisReport, TrendDataPoint } from '../types/intelligence';

interface UseAnalysisReportsOptions {
  reportType?: string;
  playbookId?: string;
  search?: string;
  limit?: number;
}

export function useAnalysisReports(options: UseAnalysisReportsOptions = {}) {
  const [reports, setReports] = useState<AnalysisReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchReports = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      let query = supabase
        .from('analysis_reports')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(options.limit || 50);

      if (options.reportType) {
        query = query.eq('report_type', options.reportType);
      }
      if (options.playbookId) {
        query = query.eq('playbook_id', options.playbookId);
      }
      if (options.search) {
        // Sanitize search input to prevent PostgREST filter injection
        const sanitized = options.search.replace(/[,.()"']/g, '');
        if (sanitized.length > 0) {
          query = query.or(`title.ilike.%${sanitized}%`);
        }
      }

      const { data, error: fetchError } = await query;
      if (signal?.aborted) return;
      if (fetchError) throw fetchError;
      setReports((data as AnalysisReport[]) || []);
    } catch (err: unknown) {
      if (signal?.aborted) return;
      setError(err instanceof Error ? err.message : 'Failed to fetch reports');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [options.reportType, options.playbookId, options.search, options.limit]);

  useEffect(() => {
    const controller = new AbortController();
    fetchReports(controller.signal);
    return () => controller.abort();
  }, [fetchReports]);

  const getReport = useCallback(async (id: string): Promise<AnalysisReport | null> => {
    const { data, error } = await supabase
      .from('analysis_reports')
      .select('*')
      .eq('id', id)
      .single();
    if (error) return null;
    return data as AnalysisReport;
  }, []);

  const getTrendReports = useCallback(async (playbookId: string, limit = 5): Promise<TrendDataPoint[]> => {
    const { data } = await supabase
      .from('analysis_reports')
      .select('id, coverage_score, score_delta, created_at')
      .eq('playbook_id', playbookId)
      .order('created_at', { ascending: false })
      .limit(limit);
    return (data as TrendDataPoint[]) || [];
  }, []);

  return { reports, loading, error, fetchReports, getReport, getTrendReports };
}
