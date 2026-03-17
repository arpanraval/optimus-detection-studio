import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../../lib/supabaseClient';
import type { PublishedWidget, EngineWidgetConfig, SpecializedCatalogConfig } from './types';

export function usePublishedWidgets() {
  const [widgets, setWidgets] = useState<PublishedWidget[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchWidgets = useCallback(async () => {
    const { data, error } = await supabase
      .from('published_widgets')
      .select('*')
      .order('usage_count', { ascending: false });

    if (!error && data) {
      setWidgets(data as PublishedWidget[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchWidgets();
  }, [fetchWidgets]);

  const publish = useCallback(async (
    name: string,
    description: string,
    category: string,
    config: EngineWidgetConfig | SpecializedCatalogConfig,
    userId: string,
    authorName: string,
  ) => {
    const { data, error } = await supabase
      .from('published_widgets')
      .insert({
        user_id: userId,
        author_name: authorName,
        name,
        description,
        category,
        config,
      })
      .select()
      .single();

    if (!error && data) {
      const published = data as PublishedWidget;
      setWidgets(prev => [published, ...prev]);
      return published;
    }
    return null;
  }, []);

  const incrementUsage = useCallback(async (widgetId: string) => {
    const { error } = await supabase.rpc('increment_usage_count', { widget_id: widgetId });
    if (error) {
      // Fallback: direct update if RPC doesn't exist
      await supabase
        .from('published_widgets')
        .update({ usage_count: (widgets.find(w => w.id === widgetId)?.usage_count ?? 0) + 1 })
        .eq('id', widgetId);
    }
  }, [widgets]);

  return { widgets, loading, publish, incrementUsage, refresh: fetchWidgets };
}
