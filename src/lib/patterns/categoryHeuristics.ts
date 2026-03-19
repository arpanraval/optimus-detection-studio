const CATEGORY_RULES: Array<{ category: string; logSourcePatterns: RegExp[]; queryKeywords: RegExp[] }> = [
  {
    category: 'process_execution',
    logSourcePatterns: [/sysmon/i, /edr/i, /endpoint/i, /4688/],
    queryKeywords: [/process_name/i, /\bImage\b/i, /ParentImage/i, /CommandLine/i, /NewProcessName/i],
  },
  {
    category: 'network_connection',
    logSourcePatterns: [/firewall/i, /proxy/i, /netflow/i],
    queryKeywords: [/DestinationIp/i, /DestinationPort/i, /SourceIp/i, /dst_ip/i, /src_ip/i],
  },
  {
    category: 'file_operation',
    logSourcePatterns: [/sysmon.*11/i],
    queryKeywords: [/TargetFilename/i, /file_path/i, /file_name/i, /FileCreate/i],
  },
  {
    category: 'registry_modification',
    logSourcePatterns: [/sysmon.*1[234]/i],
    queryKeywords: [/RegistryKey/i, /RegistryValue/i, /TargetObject/i, /\bregistry\b/i],
  },
  {
    category: 'authentication',
    logSourcePatterns: [/\bauth/i, /4624/, /4625/, /logon/i],
    queryKeywords: [/LogonType/i, /TargetUserName/i, /AuthenticationPackage/i],
  },
  {
    category: 'cloud_api',
    logSourcePatterns: [/cloudtrail/i, /azure.*activity/i, /gcp.*audit/i],
    queryKeywords: [/eventName/i, /userIdentity/i, /sourceIPAddress/i, /operationName/i],
  },
  {
    category: 'dns_query',
    logSourcePatterns: [/\bdns\b/i, /sysmon.*22/i],
    queryKeywords: [/QueryName/i, /query_name/i, /dns_query/i],
  },
  {
    category: 'powershell',
    logSourcePatterns: [/powershell/i, /scriptblock/i, /4104/],
    queryKeywords: [/ScriptBlockText/i, /\bpowershell\b/i, /Invoke-/i],
  },
  {
    category: 'scheduled_task',
    logSourcePatterns: [/4698/, /4699/],
    queryKeywords: [/schtasks/i, /ScheduledTask/i, /TaskName/i],
  },
  {
    category: 'service_creation',
    logSourcePatterns: [/7045/],
    queryKeywords: [/ServiceName/i, /ServiceFileName/i, /sc\.exe/i],
  },
  {
    category: 'wmi',
    logSourcePatterns: [/\bwmi\b/i],
    queryKeywords: [/\bwmic\b/i, /WmiEvent/i, /ManagementObject/i],
  },
];

export function inferCategories(logSources: string[], queryTexts: string[]): string[] {
  const categories = new Set<string>();
  const allText = queryTexts.join(' ');
  const logSourceText = logSources.join(' ');

  for (const rule of CATEGORY_RULES) {
    const logMatch = rule.logSourcePatterns.some(p => p.test(logSourceText));
    const queryMatch = rule.queryKeywords.some(p => p.test(allText));
    if (logMatch || queryMatch) {
      categories.add(rule.category);
    }
  }

  if (categories.size === 0) categories.add('other');
  return Array.from(categories);
}
