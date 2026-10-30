export interface ConversionResult {
  query: string;
  error?: string;
  warnings?: string[];
}

export interface ConversionParams {
  rule: string;
  target: string;
  pipelines?: string[];
  pipelineYmls?: string[];
  filterYml?: string;
  format?: string;
  correlationMethod?: string;
  backendOptions?: Record<string, any>;
}

export interface WorkerStatus {
  ready: boolean;
  pyodideReady: boolean;
  installedBackends: string[];
  error?: string;
}

export interface WorkerMessage {
  type: 'init' | 'convert' | 'installBackend' | 'status' | 'result' | 'error' | 'status_update';
  payload?: any;
}

export interface BackendConfig {
  id: string;
  name: string;
  description: string;
  /** micropip requirement(s), space-separated, each pinned with == (see backends.ts). */
  package: string;
  icon?: string;
  formats: Record<string, string>;
  pipelines: string[];
  category: 'siem' | 'edr' | 'cloud' | 'other';
}