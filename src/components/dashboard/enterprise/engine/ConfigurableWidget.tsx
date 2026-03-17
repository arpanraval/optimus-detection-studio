import React from 'react';
import type { EngineWidgetConfig } from './types';
import { useWidgetData } from './useWidgetData';
import { SingleMetric, BarChart, PieChart, LineChart, DataTable, ProgressBar } from './visualizations';

interface Props {
  config: EngineWidgetConfig;
  timeRange: { startDate: string | null; endDate: string | null };
  onNavigate: (view: string, filter?: any) => void;
}

const VISUALIZATION_MAP = {
  'single-metric': SingleMetric,
  'bar': BarChart,
  'pie': PieChart,
  'line': LineChart,
  'table': DataTable,
  'progress-bar': ProgressBar,
} as const;

export const ConfigurableWidget: React.FC<Props> = ({ config, timeRange }) => {
  const data = useWidgetData(config, timeRange);

  if (data.error) {
    return (
      <div className="p-5 h-full flex flex-col items-center justify-center text-center">
        <span className="text-[11px] text-on-surface-variant">Widget configuration error</span>
        <span className="text-[10px] text-on-surface-variant/60 mt-1">{data.error}</span>
      </div>
    );
  }

  const VisualizationComponent = VISUALIZATION_MAP[config.visualization];
  if (!VisualizationComponent) {
    return <div className="p-5 text-on-surface-variant text-sm">Unknown visualization: {config.visualization}</div>;
  }

  return (
    <div className="h-full">
      <VisualizationComponent data={data} config={config} />
    </div>
  );
};

export default ConfigurableWidget;
