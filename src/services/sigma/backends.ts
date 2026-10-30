import { BackendConfig } from './types';

// Backends are pinned to the newest release that still supports pySigma 1.x.
// The worker pins pySigma 1.3.3 because 1.4+ needs jq (and 2.x google-re2),
// C extensions with no Pyodide wheel. An unpinned install pulls whatever is
// latest, and once a backend requires pySigma 2.x, micropip refuses it
// (pysigma-backend-splunk 3.0.0 broke Splunk conversion this way).
// Datadog and QRadar have no release compatible with pySigma 1.x.
export const SUPPORTED_BACKENDS: Record<string, BackendConfig> = {
  splunk: {
    id: 'splunk',
    name: 'Splunk',
    description: 'Splunk SIEM SPL queries',
    package: 'pysigma-backend-splunk==2.1.0',
    formats: {
      default: 'Plain SPL queries',
      savedsearches: 'Splunk savedsearches.conf format',
      data_model: 'Splunk CIM data model'
    },
    pipelines: ['splunk_windows', 'splunk_sysmon', 'splunk_cim_dm'],
    category: 'siem'
  },
  
  microsoft_sentinel: {
    id: 'kusto',
    name: 'Microsoft Sentinel',
    description: 'Azure Sentinel KQL queries',
    package: 'pysigma-backend-kusto==1.0.1',
    formats: {
      default: 'Kusto Query Language'
    },
    pipelines: ['sentinel_asim', 'azure_monitor'],
    category: 'cloud'
  },
  
  microsoft_xdr: {
    id: 'kusto',
    name: 'Microsoft Defender XDR',
    description: 'Microsoft 365 Defender Advanced Hunting',
    package: 'pysigma-backend-kusto==1.0.1',
    formats: {
      default: 'Kusto Query Language'
    },
    pipelines: ['microsoft_365_defender'],
    category: 'cloud'
  },
  
  elasticsearch_lucene: {
    id: 'lucene',
    name: 'Elasticsearch (Lucene)',
    description: 'Elasticsearch Lucene queries',
    package: 'pysigma-backend-elasticsearch==2.1.0',
    formats: {
      default: 'Lucene query syntax',
      kibana_ndjson: 'Kibana NDJSON import'
    },
    pipelines: ['ecs_windows', 'ecs_zeek'],
    category: 'siem'
  },
  
  elasticsearch_esql: {
    id: 'esql',
    name: 'Elasticsearch (ES|QL)',
    description: 'Elasticsearch ES|QL queries',
    package: 'pysigma-backend-elasticsearch==2.1.0',
    formats: {
      default: 'ES|QL query syntax'
    },
    pipelines: ['ecs_windows'],
    category: 'siem'
  },
  
  elasticsearch_eql: {
    id: 'eql',
    name: 'Elasticsearch (EQL)',
    description: 'Elasticsearch Event Query Language',
    package: 'pysigma-backend-elasticsearch==2.1.0',
    formats: {
      default: 'EQL query syntax'
    },
    pipelines: ['ecs_windows'],
    category: 'siem'
  },
  
  qradar: {
    id: 'qradar',
    name: 'IBM QRadar',
    description: 'IBM QRadar AQL queries',
    package: 'pysigma-backend-qradar',
    formats: {
      default: 'AQL query syntax'
    },
    pipelines: ['qradar_fields'],
    category: 'siem'
  },
  
  crowdstrike_logscale: {
    id: 'log_scale', // the name pysigma-backend-crowdstrike registers
    name: 'CrowdStrike LogScale',
    description: 'CrowdStrike LogScale queries',
    package: 'pysigma-backend-crowdstrike==3.0.0',
    formats: {
      default: 'LogScale query syntax'
    },
    pipelines: ['crowdstrike_falcon'],
    category: 'edr'
  },
  
  carbon_black: {
    id: 'carbon_black',
    name: 'VMware Carbon Black',
    description: 'Carbon Black EDR queries',
    package: 'pysigma-backend-carbonblack==0.1.14',
    formats: {
      default: 'Carbon Black query syntax'
    },
    pipelines: [],
    category: 'edr'
  },
  
  sentinelone: {
    id: 'sentinelone',
    name: 'SentinelOne',
    description: 'SentinelOne Deep Visibility queries',
    package: 'pysigma-backend-sentinelone==0.1.3',
    formats: {
      default: 'SentinelOne query syntax'
    },
    pipelines: [],
    category: 'edr'
  },
  
  chronicle: {
    id: 'secops',
    name: 'Google Chronicle (SecOps)',
    description: 'Google SecOps UDM search and YARA-L rules',
    package: 'pysigma-backend-secops==1.0.0',
    formats: {
      default: 'UDM search query',
      yara_l: 'YARA-L rules'
    },
    pipelines: [],
    category: 'cloud'
  },
  
  opensearch: {
    id: 'opensearch_lucene',
    name: 'OpenSearch',
    description: 'OpenSearch Lucene queries',
    // Depends on pysigma-backend-elasticsearch unpinned; the latest needs pySigma 1.4+.
    package: 'pysigma-backend-opensearch==2.0.3 pysigma-backend-elasticsearch==2.1.0',
    formats: {
      default: 'Lucene query syntax',
      dashboards_ndjson: 'OpenSearch Dashboards import'
    },
    pipelines: [],
    category: 'siem'
  },
  
  loki: {
    id: 'loki',
    name: 'Grafana Loki',
    description: 'Grafana Loki LogQL queries',
    package: 'pysigma-backend-loki==0.13.0',
    formats: {
      default: 'LogQL query syntax',
      ruler: 'Loki ruler format'
    },
    pipelines: [],
    category: 'siem'
  },
  
  datadog: {
    id: 'datadog',
    name: 'Datadog',
    description: 'Datadog Security queries',
    package: 'pysigma-backend-datadog',
    formats: {
      default: 'Datadog query syntax'
    },
    pipelines: [],
    category: 'cloud'
  },
  
  cortex_xdr: {
    id: 'cortexxdr',
    name: 'Palo Alto Cortex XDR',
    description: 'Cortex XDR XQL queries',
    package: 'pysigma-backend-cortexxdr==0.1.6',
    formats: {
      default: 'XQL query syntax'
    },
    pipelines: [],
    category: 'edr'
  }
};

// Helper to get backend by ID
export function getBackendById(id: string): BackendConfig | undefined {
  return SUPPORTED_BACKENDS[id];
}

// Get backends by category
export function getBackendsByCategory(category: string): BackendConfig[] {
  return Object.values(SUPPORTED_BACKENDS).filter(b => b.category === category);
}

// Get all backend IDs
export function getAllBackendIds(): string[] {
  return Object.keys(SUPPORTED_BACKENDS);
}