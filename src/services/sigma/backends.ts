import { BackendConfig } from './types';

export const SUPPORTED_BACKENDS: Record<string, BackendConfig> = {
  splunk: {
    id: 'splunk',
    name: 'Splunk',
    description: 'Splunk SIEM SPL queries',
    package: 'pysigma-backend-splunk',
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
    package: 'pysigma-backend-kusto',
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
    package: 'pysigma-backend-kusto',
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
    package: 'pysigma-backend-elasticsearch',
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
    package: 'pysigma-backend-elasticsearch',
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
    package: 'pysigma-backend-elasticsearch',
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
    id: 'logscale',
    name: 'CrowdStrike LogScale',
    description: 'CrowdStrike LogScale queries',
    package: 'pysigma-backend-crowdstrike',
    formats: {
      default: 'LogScale query syntax'
    },
    pipelines: ['crowdstrike_falcon'],
    category: 'edr'
  },
  
  carbon_black: {
    id: 'carbonblack',
    name: 'VMware Carbon Black',
    description: 'Carbon Black EDR queries',
    package: 'pysigma-backend-carbonblack',
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
    package: 'pysigma-backend-sentinelone',
    formats: {
      default: 'SentinelOne query syntax'
    },
    pipelines: [],
    category: 'edr'
  },
  
  chronicle: {
    id: 'chronicle',
    name: 'Google Chronicle (SecOps)',
    description: 'Google Chronicle YARA-L queries',
    package: 'pysigma-backend-secops',
    formats: {
      default: 'YARA-L rules'
    },
    pipelines: [],
    category: 'cloud'
  },
  
  opensearch: {
    id: 'opensearch',
    name: 'OpenSearch',
    description: 'OpenSearch Lucene queries',
    package: 'pysigma-backend-opensearch',
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
    package: 'pysigma-backend-loki',
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
    package: 'pysigma-backend-cortexxdr',
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