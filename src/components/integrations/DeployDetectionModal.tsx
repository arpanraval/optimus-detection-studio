import React, { useState, useEffect } from 'react';
import { Icon } from '../Icon';
import { IntegrationLogo } from './IntegrationLogo';
import { getProviderMeta } from '../../lib/providerMeta';
import type {
  Detection,
  Integration,
  DeploymentRecord,
  IntegrationProvider,
  DeployValidation,
  SplunkSecurityDomain,
} from '../../types';
import { Status, DEPLOYABLE_STATUSES, PROVIDER_QUERY_LANGUAGES } from '../../types';
import { integrationService, DeployError } from '../../lib/integrationService';
import { logAuditEvent } from '../../lib/audit';
import type { AutoRetryKind } from '../../lib/integrationService';
import { hasPermission } from '../../types';

// =============================================================================
// Provider-specific default configs
// =============================================================================

function getDefaultRuleConfig(provider: IntegrationProvider): Record<string, unknown> {
  switch (provider) {
    case 'splunk':
      return {
        cronSchedule: '*/5 * * * *',
        earliestTime: '-5m@m',
        latestTime: 'now',
        alertActions: ['notable'],
        securityDomain: 'endpoint',
        enableNotable: true,
        enableRba: false,
        riskScore: 50,
        riskMessage: '',
        drilldownSearch: '',
      };
    case 'sentinel':
      return {
        ruleType: 'Scheduled',          // 'Scheduled' or 'NRT'
        queryFrequency: 'PT1H',
        queryPeriod: 'PT1H',
        triggerOperator: 'GreaterThan',
        triggerThreshold: 0,
        severity: 'Medium',
        suppressionDuration: 'PT1H',
        suppressionEnabled: false,
        eventGrouping: 'AlertPerResult',
        createIncident: true,
        groupAlerts: false,              // Safer default — matches Sentinel UI default (Disabled)
        enabled: false,                  // Deploy as disabled for production safety
        tactics: [],
        techniques: [],
      };
    case 'defender_xdr':
      return {
        frequency: '24H',
        severity: 'Medium',
        category: 'SuspiciousActivity',
      };
    case 'elastic':
      return {
        type: 'query',
        language: 'lucene',
        index: ['logs-*', 'filebeat-*', 'winlogbeat-*'],
        riskScore: 50,
        interval: '5m',
        from: 'now-6m',
        maxSignals: 100,
        tags: ['Optimus'],
      };
    case 'crowdstrike':
      return {
        severity: 50,
        outcome: 'detection',
        lookback: '1h0m',
        schedule: '@every 1h0m',
        triggerMode: 'summary',
        status: 'inactive',
      };
    default:
      return {};
  }
}

function getQueryLanguageForProvider(provider: IntegrationProvider): string {
  switch (provider) {
    case 'splunk': return 'SPL';
    case 'sentinel': return 'KQL';
    case 'defender_xdr': return 'KQL';
    case 'elastic': return 'Lucene';
    case 'crowdstrike': return 'CQL';
    default: return '';
  }
}

// Auto-suggest security domain from log sources
function suggestSecurityDomain(detection: Detection): SplunkSecurityDomain {
  const sources = [
    ...(detection.logSources || []),
    detection.logSource || '',
  ].map(s => s.toLowerCase());

  if (sources.some(s => s.includes('network') || s.includes('firewall') || s.includes('dns') || s.includes('proxy') || s.includes('ids') || s.includes('nids'))) return 'network';
  if (sources.some(s => s.includes('auth') || s.includes('ldap') || s.includes('active directory') || s.includes('login'))) return 'access';
  if (sources.some(s => s.includes('threat') || s.includes('intel'))) return 'threat';
  if (sources.some(s => s.includes('audit'))) return 'audit';
  return 'endpoint';
}

// Map severity to Splunk risk score
function severityToRiskScore(severity?: string): number {
  switch (severity?.toLowerCase()) {
    case 'critical': return 90;
    case 'high': return 70;
    case 'medium': return 50;
    case 'low': return 25;
    case 'informational': return 10;
    default: return 50;
  }
}

// =============================================================================
// Client-side validation
// =============================================================================

function validateDetectionForDeploy(
  detection: Detection,
  provider: IntegrationProvider
): DeployValidation {
  const errors: DeployValidation['errors'] = [];
  const warnings: DeployValidation['warnings'] = [];

  // Status check
  if (!DEPLOYABLE_STATUSES.includes(detection.status as Status)) {
    errors.push({
      code: 'DETECTION_NOT_DEPLOYABLE_STATUS',
      message: `Detection must be in Production, Testing, or Review status (current: ${detection.status})`,
    });
  }

  // Query check
  const hasQuery = detection.detectionQuery && detection.detectionQuery.trim() !== '';
  const hasQueries = Array.isArray(detection.queries) && detection.queries.length > 0;
  if (!hasQuery && !hasQueries) {
    errors.push({ code: 'DETECTION_NO_QUERY', message: 'Detection has no query to deploy' });
  }

  // Query language match
  const acceptedLangs = PROVIDER_QUERY_LANGUAGES[provider] || [];
  if (acceptedLangs.length > 0 && (hasQuery || hasQueries)) {
    let hasMatch = false;
    if (hasQueries) {
      hasMatch = detection.queries.some(
        q => q.language && acceptedLangs.some(l => l.toUpperCase() === q.language.toUpperCase())
      );
    }
    if (!hasMatch && detection.queryLanguage) {
      hasMatch = acceptedLangs.some(l => l.toUpperCase() === detection.queryLanguage.toUpperCase());
    }
    if (!hasMatch) {
      errors.push({
        code: 'QUERY_LANGUAGE_MISMATCH',
        message: `No ${acceptedLangs.join('/')} query available for this detection`,
      });
    }
  }

  // Rule name
  if (!detection.name || detection.name.trim() === '') {
    errors.push({ code: 'MISSING_RULE_NAME', message: 'Detection has no name' });
  }

  // Warnings
  if (typeof detection.qualityScore === 'number' && detection.qualityScore < 60) {
    warnings.push({
      code: 'LOW_QUALITY_SCORE',
      message: `Low quality score (${detection.qualityScore}). Consider improving before deployment`,
    });
  }

  const hasMitre = (detection.mitreTactics?.length ?? 0) > 0 || (detection.mitreTechniques?.length ?? 0) > 0;
  if (!hasMitre) {
    warnings.push({
      code: 'NO_MITRE_MAPPING',
      message: 'No MITRE ATT&CK mapping. Vendor rule will lack tactic/technique metadata',
    });
  }

  if (!detection.description || detection.description.trim() === '') {
    warnings.push({
      code: 'NO_DESCRIPTION',
      message: 'No description. Vendor rule will have empty description',
    });
  }

  return { eligible: errors.length === 0, errors, warnings };
}

// =============================================================================
// Step Indicator
// =============================================================================

type StepId = 'select' | 'validate' | 'configure' | 'deploying' | 'result';

const STEP_LABELS: { id: StepId; label: string }[] = [
  { id: 'select', label: 'Select' },
  { id: 'validate', label: 'Validate' },
  { id: 'configure', label: 'Configure' },
  { id: 'result', label: 'Result' },
];

function StepIndicator({ current }: { current: StepId }) {
  // Map deploying to result position (it's the transition to result)
  const effectiveStep = current === 'deploying' ? 'result' : current;
  const currentIdx = STEP_LABELS.findIndex(s => s.id === effectiveStep);

  return (
    <div className="flex items-center justify-center gap-1.5 mb-4">
      {STEP_LABELS.map((s, i) => {
        const isActive = s.id === effectiveStep;
        const isPast = i < currentIdx;
        return (
          <React.Fragment key={s.id}>
            <div className="flex items-center gap-1">
              <div className={`w-1.5 h-1.5 rounded-full transition-colors ${
                isActive ? 'bg-on-surface' : isPast ? 'bg-on-surface-variant/40' : 'bg-outline-variant/30'
              }`} />
              <span className={`text-[10px] transition-colors ${
                isActive ? 'text-on-surface font-medium' : isPast ? 'text-on-surface-variant/60' : 'text-on-surface-variant/30'
              }`}>
                {s.label}
              </span>
            </div>
            {i < STEP_LABELS.length - 1 && (
              <div className={`w-4 h-px ${isPast ? 'bg-on-surface-variant/30' : 'bg-outline-variant/20'}`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// =============================================================================
// Component
// =============================================================================

interface DeployDetectionModalProps {
  detection: Detection;
  onClose: () => void;
  onDeployed?: (record: DeploymentRecord) => void;
  userRole?: string;
  permissionOverrides?: { granted?: string[]; revoked?: string[] };
}

interface DeployResultState {
  success: boolean;
  record?: DeploymentRecord;
  error?: string;
  errorGuidance?: string;
  errorRetryable?: boolean;
  autoUpgraded?: boolean;
  autoRetried?: AutoRetryKind;
}

export const DeployDetectionModal: React.FC<DeployDetectionModalProps> = ({
  detection,
  onClose,
  onDeployed,
  userRole = 'analyst',
  permissionOverrides,
}) => {
  const [step, setStep] = useState<StepId>('select');
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [allIntegrations, setAllIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIntegration, setSelectedIntegration] = useState<Integration | null>(null);
  const [ruleConfig, setRuleConfig] = useState<Record<string, unknown>>({});
  const [ruleName, setRuleName] = useState(detection.name || '');
  const [ruleDescription, setRuleDescription] = useState(detection.description || '');
  const [deploying, setDeploying] = useState(false);
  const [deployResult, setDeployResult] = useState<DeployResultState | null>(null);
  const [validation, setValidation] = useState<DeployValidation | null>(null);
  const [existingDeployment, setExistingDeployment] = useState<DeploymentRecord | null>(null);
  const [deployAction, setDeployAction] = useState<'create' | 'update'>('create');
  const [vendorIdCopied, setVendorIdCopied] = useState(false);

  // C2: Permission check
  const canDeploy = hasPermission(userRole, 'integrations:sync', permissionOverrides as any);

  // Find best query for the selected provider
  const getDeployQuery = (): { query: string; language: string } => {
    if (!selectedIntegration) return { query: detection.detectionQuery || '', language: detection.queryLanguage || '' };

    const targetLang = getQueryLanguageForProvider(selectedIntegration.provider);
    const acceptedLangs = PROVIDER_QUERY_LANGUAGES[selectedIntegration.provider] || [];

    // Check if detection has a query in the target language
    if (detection.queries && detection.queries.length > 0) {
      const match = detection.queries.find(
        q => q.language && acceptedLangs.some(l => l.toUpperCase() === q.language.toUpperCase())
      );
      if (match) return { query: match.query, language: match.language };
    }

    // Fall back to primary query
    return {
      query: detection.detectionQuery || '',
      language: detection.queryLanguage || targetLang,
    };
  };

  useEffect(() => {
    loadIntegrations();
  }, []);

  const loadIntegrations = async () => {
    try {
      const all = await integrationService.listIntegrations();
      const siemOnly = all.filter(i => i.category === 'siem');
      setAllIntegrations(siemOnly);
      const connected = siemOnly.filter(i => i.status === 'connected');
      setIntegrations(connected);

      // Pre-select the default integration if exactly one default exists
      const defaultInt = connected.find(i => i.is_default);
      if (defaultInt && connected.length > 1) {
        // Only pre-select when there are multiple — for single, user just clicks the one option
        setSelectedIntegration(defaultInt);
      }
    } catch {
      // No integrations
    } finally {
      setLoading(false);
    }
  };

  const handleSelectIntegration = async (integration: Integration) => {
    setSelectedIntegration(integration);

    // B: Client-side pre-deploy validation
    const result = validateDetectionForDeploy(detection, integration.provider);
    setValidation(result);

    // E3: Check for existing deployment (duplicate check)
    try {
      const history = await integrationService.getDeploymentHistory({
        detectionId: detection.id,
        integrationId: integration.id,
      });
      const existing = history.find(d => d.action === 'create' && d.status === 'success');
      if (existing) {
        setExistingDeployment(existing);
        setDeployAction('update');
      } else {
        setExistingDeployment(null);
        setDeployAction('create');
      }
    } catch {
      setExistingDeployment(null);
    }

    setStep('validate');
  };

  const handleProceedToConfigure = () => {
    if (!selectedIntegration) return;

    const config = getDefaultRuleConfig(selectedIntegration.provider);

    // Auto-set severity from detection
    if (detection.severity) {
      const severityMap: Record<string, string> = {
        critical: 'High',
        high: 'High',
        medium: 'Medium',
        low: 'Low',
        informational: 'Informational',
      };
      config.severity = severityMap[detection.severity?.toLowerCase() || 'medium'] || 'Medium';
      config.alertSeverity = detection.severity === 'Critical' ? '5' : detection.severity === 'High' ? '4' : detection.severity === 'Medium' ? '3' : '2';
    }

    // Auto-set MITRE if present
    if (detection.mitreTactics?.length) {
      config.tactics = detection.mitreTactics;
    }
    if (detection.mitreAttackIds?.length) {
      config.techniques = detection.mitreAttackIds;
    }

    // Defender XDR: auto-set category from first MITRE tactic
    if (selectedIntegration.provider === 'defender_xdr' && detection.mitreTactics?.length) {
      const tacticCategoryMap: Record<string, string> = {
        'reconnaissance': 'Discovery',
        'resource development': 'Malware',
        'initial access': 'InitialAccess',
        'execution': 'Execution',
        'persistence': 'Persistence',
        'privilege escalation': 'PrivilegeEscalation',
        'defense evasion': 'DefenseEvasion',
        'credential access': 'CredentialAccess',
        'discovery': 'Discovery',
        'lateral movement': 'LateralMovement',
        'collection': 'Collection',
        'command and control': 'CommandAndControl',
        'exfiltration': 'Exfiltration',
        'impact': 'Impact',
      };
      const mapped = tacticCategoryMap[detection.mitreTactics[0].toLowerCase()];
      if (mapped) config.category = mapped;
    }

    // Splunk-specific auto-suggestions
    if (selectedIntegration.provider === 'splunk') {
      config.securityDomain = suggestSecurityDomain(detection);
      config.riskScore = severityToRiskScore(detection.severity);
      config.enableNotable = DEPLOYABLE_STATUSES.includes(detection.status as Status);
    }

    setRuleConfig(config);
    setStep('configure');
  };

  const handleDeploy = async () => {
    if (!selectedIntegration) return;
    setDeploying(true);
    setDeployResult(null);
    setStep('deploying');

    const { query, language } = getDeployQuery();

    try {
      const record = await integrationService.deployDetection({
        integrationId: selectedIntegration.id,
        detectionId: detection.id,
        query,
        queryLanguage: language,
        ruleConfig: {
          ...ruleConfig,
          name: ruleName,
          description: ruleDescription,
          action: deployAction,
        },
        vendorRuleId: existingDeployment?.vendor_rule_id || undefined,
      });

      // Extract transient _autoRetried field
      const autoRetried = (record as any)._autoRetried as AutoRetryKind | undefined;

      setDeployResult({
        success: true,
        record,
        autoUpgraded: deployAction === 'update' && existingDeployment !== null,
        autoRetried,
      });
      onDeployed?.(record);
      // Audit trail
      logAuditEvent({
        action: 'detection.deployed',
        entity_type: 'detection',
        entity_id: detection.id,
        entity_name: detection.name,
        details: {
          integration_id: selectedIntegration.id,
          integration_name: selectedIntegration.name,
          vendor_rule_id: record.vendor_rule_id,
          deploy_action: deployAction,
        },
      });
    } catch (err) {
      const result: DeployResultState = { success: false };
      if (err instanceof DeployError) {
        result.error = err.message;
        result.errorGuidance = err.guidance;
        result.errorRetryable = err.retryable;
      } else {
        result.error = err instanceof Error ? err.message : 'Deployment failed';
        result.errorRetryable = true;
      }
      setDeployResult(result);
    } finally {
      setDeploying(false);
      setStep('result');
    }
  };

  const handleRetry = () => {
    setDeployResult(null);
    setStep('configure');
  };

  const handleViewDeployments = () => {
    if (deployResult?.record) {
      onDeployed?.(deployResult.record);
    }
    onClose();
  };

  const handleCopyVendorId = (id: string) => {
    navigator.clipboard.writeText(id);
    setVendorIdCopied(true);
    setTimeout(() => setVendorIdCopied(false), 2000);
  };

  const { query: deployQuery, language: deployLanguage } = getDeployQuery();

  // Non-connected integrations for display
  const disconnectedIntegrations = allIntegrations.filter(i => i.status !== 'connected');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-surface-container rounded-2xl w-full max-w-2xl mx-4 max-h-[85vh] overflow-y-auto shadow-2xl border border-outline-variant/20">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-outline-variant/10">
          <div>
            <h2 className="text-lg font-semibold text-on-surface">Deploy Detection</h2>
            <p className="text-xs text-on-surface-variant mt-0.5">{detection.name}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-container-high transition-colors">
            <Icon name="x" className="w-4 h-4 text-on-surface-variant" />
          </button>
        </div>

        <div className="p-5">
          {/* C2: Permission gate */}
          {!canDeploy ? (
            <div className="text-center py-8">
              <Icon name="shield-off" className="w-8 h-8 text-on-surface-variant/30 mx-auto mb-2" />
              <p className="text-sm text-on-surface-variant font-medium">Permission Denied</p>
              <p className="text-xs text-on-surface-variant/50 mt-1">
                You don't have permission to deploy detections. Contact your admin to request the <code className="bg-surface-container-highest px-1 rounded">integrations:sync</code> permission.
              </p>
            </div>
          ) : (
            <>
              {/* Step indicator */}
              {step !== 'select' && <StepIndicator current={step} />}

              {/* Step 1: Select Integration */}
              {step === 'select' && (
                <div>
                  <h3 className="text-sm font-medium text-on-surface mb-3">Select Target SIEM</h3>
                  {loading ? (
                    <div className="flex items-center justify-center py-8">
                      <Icon name="loader" className="w-5 h-5 animate-spin text-on-surface-variant" />
                    </div>
                  ) : integrations.length === 0 && disconnectedIntegrations.length === 0 ? (
                    <div className="text-center py-8">
                      <Icon name="unlink" className="w-8 h-8 text-on-surface-variant/30 mx-auto mb-2" />
                      <p className="text-sm text-on-surface-variant">No SIEM integrations configured</p>
                      <p className="text-xs text-on-surface-variant/50 mt-1">
                        Go to Integrations to connect a SIEM first
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {/* Connected integrations */}
                      {integrations.map(integration => {
                        const meta = getProviderMeta(integration.provider);
                        return (
                          <button
                            key={integration.id}
                            onClick={() => handleSelectIntegration(integration)}
                            className="w-full flex items-center gap-3 p-3 rounded-xl border border-outline-variant/20 hover:border-primary/30 hover:bg-surface-container-high/50 transition-all text-left"
                          >
                            {meta ? (
                              <IntegrationLogo provider={meta} size="md" />
                            ) : (
                              <div className="w-10 h-10 rounded-lg bg-surface-container-high flex items-center justify-center">
                                <Icon name="database" className="w-5 h-5 text-primary" />
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-medium text-on-surface">{integration.name}</p>
                                {integration.is_default && (
                                  <span className="px-1.5 py-0.5 text-[10px] font-semibold text-primary bg-primary/10 border border-primary/20 rounded-md">
                                    Default
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-on-surface-variant">{meta?.name || integration.provider} &middot; {getQueryLanguageForProvider(integration.provider)}</p>
                            </div>
                            <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-green-500/10 text-green-500 border border-green-500/20">
                              Connected
                            </span>
                            <Icon name="chevron-right" className="w-4 h-4 text-on-surface-variant" />
                          </button>
                        );
                      })}

                      {/* F2: Disconnected integrations (disabled) */}
                      {disconnectedIntegrations.map(integration => {
                        const meta = getProviderMeta(integration.provider);
                        return (
                          <div
                            key={integration.id}
                            className="w-full flex items-center gap-3 p-3 rounded-xl border border-outline-variant/10 bg-surface-container/50 opacity-60 cursor-not-allowed"
                          >
                            {meta ? (
                              <IntegrationLogo provider={meta} size="md" />
                            ) : (
                              <div className="w-10 h-10 rounded-lg bg-surface-container-high flex items-center justify-center">
                                <Icon name="database" className="w-5 h-5 text-on-surface-variant/50" />
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-on-surface-variant">{integration.name}</p>
                              <p className="text-xs text-on-surface-variant/50">{meta?.name || integration.provider}</p>
                            </div>
                            <span className={`px-2 py-0.5 text-[10px] font-medium rounded-full border ${
                              integration.status === 'error' ? 'bg-error/10 text-error border-error/20' : 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                            }`}>
                              {integration.status === 'error' ? 'Error' : integration.status === 'configured' ? 'Not tested' : integration.status}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Step 2: Pre-Deploy Validation Summary */}
              {step === 'validate' && selectedIntegration && validation && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 mb-1">
                    <button onClick={() => { setStep('select'); setValidation(null); setExistingDeployment(null); }} className="p-1 rounded hover:bg-surface-container-high">
                      <Icon name="arrow-left" className="w-4 h-4 text-on-surface-variant" />
                    </button>
                    <span className="text-sm font-medium text-on-surface">
                      Pre-Deploy Check — {selectedIntegration.name}
                    </span>
                  </div>

                  {/* Summary card */}
                  <div className="p-4 rounded-xl border border-outline-variant/20 bg-surface-container-high/50 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-on-surface">{detection.name}</span>
                      <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full border uppercase tracking-wide ${
                        DEPLOYABLE_STATUSES.includes(detection.status as Status) ? 'bg-green-500/10 text-green-500 border-green-500/20' : 'bg-error/10 text-error border-error/20'
                      }`}>
                        {detection.status}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {/* Quality Score */}
                      <div className="flex items-center gap-2">
                        <Icon name="bar-chart-2" className="w-3.5 h-3.5 text-on-surface-variant" />
                        <span className="text-on-surface-variant">Quality:</span>
                        <span className={`font-medium ${(detection.qualityScore ?? 0) >= 60 ? 'text-green-500' : 'text-amber-500'}`}>
                          {detection.qualityScore ?? 0}%
                        </span>
                      </div>

                      {/* Query Language Match */}
                      <div className="flex items-center gap-2">
                        <Icon name="code" className="w-3.5 h-3.5 text-on-surface-variant" />
                        <span className="text-on-surface-variant">Query:</span>
                        {validation.errors.some(e => e.code === 'QUERY_LANGUAGE_MISMATCH') ? (
                          <span className="text-error font-medium flex items-center gap-1">
                            <Icon name="x" className="w-3 h-3" /> Mismatch
                          </span>
                        ) : (
                          <span className="text-green-500 font-medium flex items-center gap-1">
                            <Icon name="check" className="w-3 h-3" /> {deployLanguage || detection.queryLanguage}
                          </span>
                        )}
                      </div>

                      {/* MITRE */}
                      <div className="flex items-center gap-2">
                        <Icon name="target" className="w-3.5 h-3.5 text-on-surface-variant" />
                        <span className="text-on-surface-variant">MITRE:</span>
                        <span className={`font-medium ${(detection.mitreTactics?.length ?? 0) > 0 ? 'text-on-surface' : 'text-amber-500'}`}>
                          {detection.mitreTactics?.length || 0} tactics, {detection.mitreTechniques?.length || 0} techniques
                        </span>
                      </div>

                      {/* Severity */}
                      <div className="flex items-center gap-2">
                        <Icon name="alert-triangle" className="w-3.5 h-3.5 text-on-surface-variant" />
                        <span className="text-on-surface-variant">Severity:</span>
                        <span className="font-medium text-on-surface">{detection.severity}</span>
                      </div>
                    </div>
                  </div>

                  {/* E3: Duplicate deployment notice — radio buttons */}
                  {existingDeployment && (
                    <div className="p-4 rounded-xl border border-outline-variant/20 bg-surface-container-high/30">
                      <div className="flex items-center gap-2 mb-3">
                        <Icon name="refresh-cw" className="w-4 h-4 text-on-surface-variant" />
                        <span className="text-sm font-medium text-on-surface">Previously Deployed</span>
                      </div>
                      <p className="text-xs text-on-surface-variant mb-1">
                        This detection was deployed to {selectedIntegration.name} on {new Date(existingDeployment.created_at).toLocaleDateString()}.
                      </p>
                      <p className="text-xs text-on-surface-variant mb-3">
                        Vendor Rule ID: <code className="bg-surface-container-highest px-1 rounded">{existingDeployment.vendor_rule_id}</code>
                      </p>

                      <div className="space-y-2">
                        <label className="flex items-start gap-3 p-2.5 rounded-lg border border-outline-variant/20 cursor-pointer hover:bg-surface-container-high/50 transition-colors has-[:checked]:border-on-surface-variant/40 has-[:checked]:bg-surface-container-high/50">
                          <input
                            type="radio"
                            name="deployAction"
                            checked={deployAction === 'update'}
                            onChange={() => setDeployAction('update')}
                            className="mt-0.5 w-3.5 h-3.5 text-primary focus:ring-primary/30 border-outline-variant"
                          />
                          <div>
                            <span className="text-xs font-medium text-on-surface">
                              Update existing rule
                              <span className="ml-1.5 text-[10px] font-normal text-on-surface-variant">(recommended)</span>
                            </span>
                            <p className="text-[11px] text-on-surface-variant/70 mt-0.5">
                              Overwrites the current rule in Splunk with the latest query and configuration.
                            </p>
                          </div>
                        </label>

                        <label className="flex items-start gap-3 p-2.5 rounded-lg border border-outline-variant/20 cursor-pointer hover:bg-surface-container-high/50 transition-colors has-[:checked]:border-on-surface-variant/40 has-[:checked]:bg-surface-container-high/50">
                          <input
                            type="radio"
                            name="deployAction"
                            checked={deployAction === 'create'}
                            onChange={() => setDeployAction('create')}
                            className="mt-0.5 w-3.5 h-3.5 text-primary focus:ring-primary/30 border-outline-variant"
                          />
                          <div>
                            <span className="text-xs font-medium text-on-surface">Create new rule</span>
                            <p className="text-[11px] text-on-surface-variant/70 mt-0.5">
                              Creates a second rule in Splunk. The original rule will remain unchanged.
                            </p>
                          </div>
                        </label>
                      </div>
                    </div>
                  )}

                  {/* Blocking errors */}
                  {validation.errors.length > 0 && (
                    <div className="space-y-2">
                      {validation.errors.map((err, i) => (
                        <div key={i} className="flex items-start gap-2 p-3 rounded-lg border border-error/20 bg-error/5">
                          <Icon name="x-circle" className="w-4 h-4 text-error mt-0.5 flex-shrink-0" />
                          <p className="text-xs text-error">{err.message}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Non-blocking warnings */}
                  {validation.warnings.length > 0 && (
                    <div className="space-y-2">
                      {validation.warnings.map((warn, i) => (
                        <div key={i} className="flex items-start gap-2 p-3 rounded-lg border border-amber-500/20 bg-amber-500/5">
                          <Icon name="alert-triangle" className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                          <p className="text-xs text-amber-600 dark:text-amber-400">{warn.message}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Sigma hint */}
                  {validation.errors.some(e => e.code === 'QUERY_LANGUAGE_MISMATCH') && detection.queries?.some(q => q.language?.toLowerCase() === 'sigma') && (
                    <div className="p-3 rounded-lg border border-outline-variant/20 bg-surface-container-high/50">
                      <div className="flex items-start gap-2">
                        <Icon name="info" className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                        <p className="text-xs text-on-surface-variant">
                          This detection has a Sigma rule that could be converted to {getQueryLanguageForProvider(selectedIntegration.provider)}.
                          Use the Sigma Converter to generate a compatible query first.
                        </p>
                      </div>
                    </div>
                  )}

                  <button
                    onClick={handleProceedToConfigure}
                    disabled={!validation.eligible}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg border transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-2 text-on-surface border-outline-variant/30 hover:bg-surface-container-high"
                  >
                    {validation.eligible ? (
                      <>
                        <Icon name="arrow-right" className="w-4 h-4" />
                        Continue
                      </>
                    ) : (
                      <>
                        <Icon name="x-circle" className="w-4 h-4" />
                        Cannot Deploy — Fix Errors Above
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* Step 3: Configure */}
              {step === 'configure' && selectedIntegration && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 mb-1">
                    <button onClick={() => setStep('validate')} className="p-1 rounded hover:bg-surface-container-high">
                      <Icon name="arrow-left" className="w-4 h-4 text-on-surface-variant" />
                    </button>
                    <span className="text-sm font-medium text-on-surface">
                      {deployAction === 'update' ? 'Update on' : 'Deploy to'} {selectedIntegration.name}
                    </span>
                  </div>

                  {/* Rule Name */}
                  <div>
                    <label className="block text-xs font-medium text-on-surface-variant mb-1">Rule Name</label>
                    <input
                      type="text"
                      value={ruleName}
                      onChange={e => setRuleName(e.target.value)}
                      className="w-full px-3 py-2 bg-surface-container-high border border-outline-variant/20 rounded-lg text-sm text-on-surface focus:outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
                    />
                  </div>

                  {/* Rule Description */}
                  <div>
                    <label className="block text-xs font-medium text-on-surface-variant mb-1">Description</label>
                    <textarea
                      value={ruleDescription}
                      onChange={e => setRuleDescription(e.target.value)}
                      rows={2}
                      className="w-full px-3 py-2 bg-surface-container-high border border-outline-variant/20 rounded-lg text-sm text-on-surface focus:outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 resize-none"
                    />
                  </div>

                  {/* Query Preview */}
                  <div>
                    <label className="block text-xs font-medium text-on-surface-variant mb-1">
                      Query ({deployLanguage || getQueryLanguageForProvider(selectedIntegration.provider)})
                    </label>
                    <pre className="p-3 bg-surface-container-highest rounded-lg text-xs text-on-surface overflow-x-auto max-h-32 font-mono border border-outline-variant/10">
                      {deployQuery || 'No query available'}
                    </pre>
                  </div>

                  {/* Provider-specific config: Splunk */}
                  {selectedIntegration.provider === 'splunk' && (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-on-surface-variant mb-1">Cron Schedule</label>
                          <input
                            type="text"
                            value={String(ruleConfig.cronSchedule || '')}
                            onChange={e => setRuleConfig(p => ({ ...p, cronSchedule: e.target.value }))}
                            className="w-full px-3 py-2 bg-surface-container-high border border-outline-variant/20 rounded-lg text-sm text-on-surface focus:outline-none focus:border-primary/40"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-on-surface-variant mb-1">Earliest Time</label>
                          <input
                            type="text"
                            value={String(ruleConfig.earliestTime || '')}
                            onChange={e => setRuleConfig(p => ({ ...p, earliestTime: e.target.value }))}
                            className="w-full px-3 py-2 bg-surface-container-high border border-outline-variant/20 rounded-lg text-sm text-on-surface focus:outline-none focus:border-primary/40"
                          />
                        </div>
                      </div>

                      {/* Security Domain */}
                      <div>
                        <label className="block text-xs font-medium text-on-surface-variant mb-1">Security Domain</label>
                        <select
                          value={String(ruleConfig.securityDomain || 'endpoint')}
                          onChange={e => setRuleConfig(p => ({ ...p, securityDomain: e.target.value }))}
                          className="w-full px-3 py-2 bg-surface-container-high border border-outline-variant/20 rounded-lg text-sm text-on-surface"
                        >
                          <option value="endpoint">Endpoint</option>
                          <option value="network">Network</option>
                          <option value="access">Access</option>
                          <option value="threat">Threat</option>
                          <option value="audit">Audit</option>
                        </select>
                      </div>

                      {/* Notable Event checkbox */}
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={ruleConfig.enableNotable as boolean ?? true}
                          onChange={e => setRuleConfig(p => ({ ...p, enableNotable: e.target.checked }))}
                          className="w-4 h-4 rounded border-outline-variant text-primary focus:ring-primary"
                        />
                        <span className="text-sm text-on-surface">Create Notable Event</span>
                      </label>

                      {/* RBA checkbox + risk score */}
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={ruleConfig.enableRba as boolean ?? false}
                          onChange={e => setRuleConfig(p => ({ ...p, enableRba: e.target.checked }))}
                          className="w-4 h-4 rounded border-outline-variant text-primary focus:ring-primary"
                        />
                        <span className="text-sm text-on-surface">Enable Risk-Based Alerting (RBA)</span>
                      </label>

                      {ruleConfig.enableRba && (
                        <div className="grid grid-cols-2 gap-3 ml-6">
                          <div>
                            <label className="block text-xs font-medium text-on-surface-variant mb-1">Risk Score (0-100)</label>
                            <input
                              type="number"
                              min={0}
                              max={100}
                              value={Number(ruleConfig.riskScore || 50)}
                              onChange={e => setRuleConfig(p => ({ ...p, riskScore: Number(e.target.value) }))}
                              className="w-full px-3 py-2 bg-surface-container-high border border-outline-variant/20 rounded-lg text-sm text-on-surface focus:outline-none focus:border-primary/40"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-on-surface-variant mb-1">Risk Message</label>
                            <input
                              type="text"
                              value={String(ruleConfig.riskMessage || '')}
                              onChange={e => setRuleConfig(p => ({ ...p, riskMessage: e.target.value }))}
                              placeholder="$name$ triggered on $dest$"
                              className="w-full px-3 py-2 bg-surface-container-high border border-outline-variant/20 rounded-lg text-sm text-on-surface focus:outline-none focus:border-primary/40"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Provider-specific config: Sentinel */}
                  {selectedIntegration.provider === 'sentinel' && (
                    <div className="space-y-3">
                      {/* Rule Type (Scheduled vs NRT) */}
                      <div>
                        <label className="block text-xs font-medium text-on-surface-variant mb-1">Rule Type</label>
                        <select
                          value={String(ruleConfig.ruleType || 'Scheduled')}
                          onChange={e => setRuleConfig(p => ({ ...p, ruleType: e.target.value }))}
                          className="w-full px-3 py-2 bg-surface-container-high border border-outline-variant/20 rounded-lg text-sm text-on-surface"
                        >
                          <option value="Scheduled">Scheduled Query Rule</option>
                          <option value="NRT">NRT (Near Real-Time) Rule</option>
                        </select>
                        {ruleConfig.ruleType === 'NRT' && (
                          <p className="text-[11px] text-on-surface-variant/60 mt-1">
                            NRT rules run every minute automatically. Query frequency, period, and trigger settings are not applicable.
                          </p>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        {/* Scheduled-only fields */}
                        {ruleConfig.ruleType !== 'NRT' && (
                          <>
                            <div>
                              <label className="block text-xs font-medium text-on-surface-variant mb-1">Query Frequency</label>
                              <select
                                value={String(ruleConfig.queryFrequency || 'PT1H')}
                                onChange={e => {
                                  // queryPeriod must be >= queryFrequency; auto-sync when frequency changes
                                  const periodMap: Record<string, string> = { 'PT5M': 'PT30M', 'PT10M': 'PT1H', 'PT1H': 'PT1H', 'PT12H': 'P1D', 'P1D': 'P2D' };
                                  setRuleConfig(p => ({ ...p, queryFrequency: e.target.value, queryPeriod: periodMap[e.target.value] || e.target.value }));
                                }}
                                className="w-full px-3 py-2 bg-surface-container-high border border-outline-variant/20 rounded-lg text-sm text-on-surface"
                              >
                                <option value="PT5M">Every 5 minutes</option>
                                <option value="PT10M">Every 10 minutes</option>
                                <option value="PT1H">Every hour</option>
                                <option value="PT12H">Every 12 hours</option>
                                <option value="P1D">Daily</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-on-surface-variant mb-1">Trigger Operator</label>
                              <select
                                value={String(ruleConfig.triggerOperator || 'GreaterThan')}
                                onChange={e => setRuleConfig(p => ({ ...p, triggerOperator: e.target.value }))}
                                className="w-full px-3 py-2 bg-surface-container-high border border-outline-variant/20 rounded-lg text-sm text-on-surface"
                              >
                                <option value="GreaterThan">Greater Than</option>
                                <option value="LessThan">Less Than</option>
                                <option value="Equal">Equal</option>
                                <option value="NotEqual">Not Equal</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-on-surface-variant mb-1">Trigger Threshold</label>
                              <input
                                type="number"
                                min={0}
                                value={Number(ruleConfig.triggerThreshold ?? 0)}
                                onChange={e => setRuleConfig(p => ({ ...p, triggerThreshold: Number(e.target.value) }))}
                                className="w-full px-3 py-2 bg-surface-container-high border border-outline-variant/20 rounded-lg text-sm text-on-surface focus:outline-none focus:border-primary/40"
                              />
                            </div>
                          </>
                        )}

                        {/* Common fields for both Scheduled and NRT */}
                        <div>
                          <label className="block text-xs font-medium text-on-surface-variant mb-1">Severity</label>
                          <select
                            value={String(ruleConfig.severity || 'Medium')}
                            onChange={e => setRuleConfig(p => ({ ...p, severity: e.target.value }))}
                            className="w-full px-3 py-2 bg-surface-container-high border border-outline-variant/20 rounded-lg text-sm text-on-surface"
                          >
                            <option value="High">High</option>
                            <option value="Medium">Medium</option>
                            <option value="Low">Low</option>
                            <option value="Informational">Informational</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-on-surface-variant mb-1">Event Grouping</label>
                          <select
                            value={String(ruleConfig.eventGrouping || 'AlertPerResult')}
                            onChange={e => setRuleConfig(p => ({ ...p, eventGrouping: e.target.value }))}
                            className="w-full px-3 py-2 bg-surface-container-high border border-outline-variant/20 rounded-lg text-sm text-on-surface"
                          >
                            <option value="AlertPerResult">Alert per result</option>
                            <option value="SingleAlert">Single alert</option>
                          </select>
                        </div>
                      </div>

                      {/* Incident & Safety Settings */}
                      <div className="space-y-2 pt-1">
                        <label className="flex items-center gap-2 text-xs text-on-surface cursor-pointer">
                          <input
                            type="checkbox"
                            checked={ruleConfig.createIncident !== false}
                            onChange={e => setRuleConfig(p => ({ ...p, createIncident: e.target.checked }))}
                            className="rounded border-outline-variant/30"
                          />
                          Create incidents from alerts
                        </label>
                        {ruleConfig.createIncident !== false && (
                          <label className="flex items-center gap-2 text-xs text-on-surface cursor-pointer ml-5">
                            <input
                              type="checkbox"
                              checked={ruleConfig.groupAlerts === true}
                              onChange={e => setRuleConfig(p => ({ ...p, groupAlerts: e.target.checked }))}
                              className="rounded border-outline-variant/30"
                            />
                            Group related alerts into incidents
                          </label>
                        )}
                      </div>

                      {/* Deploy as Enabled/Disabled — production safety */}
                      <div className="p-3 rounded-lg border border-outline-variant/15 bg-surface-container-high/30">
                        <label className="flex items-center gap-2 text-xs text-on-surface cursor-pointer">
                          <input
                            type="checkbox"
                            checked={ruleConfig.enabled === true}
                            onChange={e => setRuleConfig(p => ({ ...p, enabled: e.target.checked }))}
                            className="rounded border-outline-variant/30"
                          />
                          <span className="font-medium">Enable rule immediately after deployment</span>
                        </label>
                        <p className="text-[11px] text-on-surface-variant/60 mt-1 ml-5">
                          {ruleConfig.enabled
                            ? 'Rule will start generating alerts immediately. Make sure the query is tested.'
                            : 'Rule will be deployed as disabled. You can review and enable it in the Azure portal.'}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Provider-specific config: Defender XDR */}
                  {selectedIntegration.provider === 'defender_xdr' && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-on-surface-variant mb-1">Frequency</label>
                        <select
                          value={String(ruleConfig.frequency || '24H')}
                          onChange={e => setRuleConfig(p => ({ ...p, frequency: e.target.value }))}
                          className="w-full px-3 py-2 bg-surface-container-high border border-outline-variant/20 rounded-lg text-sm text-on-surface"
                        >
                          <option value="0">Continuous (NRT)</option>
                          <option value="1H">Every hour</option>
                          <option value="3H">Every 3 hours</option>
                          <option value="12H">Every 12 hours</option>
                          <option value="24H">Daily</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-on-surface-variant mb-1">Severity</label>
                        <select
                          value={String(ruleConfig.severity || 'Medium')}
                          onChange={e => setRuleConfig(p => ({ ...p, severity: e.target.value }))}
                          className="w-full px-3 py-2 bg-surface-container-high border border-outline-variant/20 rounded-lg text-sm text-on-surface"
                        >
                          <option value="High">High</option>
                          <option value="Medium">Medium</option>
                          <option value="Low">Low</option>
                          <option value="Informational">Informational</option>
                        </select>
                      </div>
                      <div className="col-span-2">
                        <label className="block text-xs font-medium text-on-surface-variant mb-1">Alert Category</label>
                        <select
                          value={String(ruleConfig.category || 'SuspiciousActivity')}
                          onChange={e => setRuleConfig(p => ({ ...p, category: e.target.value }))}
                          className="w-full px-3 py-2 bg-surface-container-high border border-outline-variant/20 rounded-lg text-sm text-on-surface"
                        >
                          <option value="SuspiciousActivity">Suspicious Activity</option>
                          <option value="Execution">Execution</option>
                          <option value="InitialAccess">Initial Access</option>
                          <option value="Persistence">Persistence</option>
                          <option value="PrivilegeEscalation">Privilege Escalation</option>
                          <option value="DefenseEvasion">Defense Evasion</option>
                          <option value="CredentialAccess">Credential Access</option>
                          <option value="Discovery">Discovery</option>
                          <option value="LateralMovement">Lateral Movement</option>
                          <option value="Collection">Collection</option>
                          <option value="CommandAndControl">Command and Control</option>
                          <option value="Exfiltration">Exfiltration</option>
                          <option value="Impact">Impact</option>
                          <option value="Ransomware">Ransomware</option>
                          <option value="Malware">Malware</option>
                        </select>
                      </div>
                    </div>
                  )}

                  {/* Provider-specific config: Elastic */}
                  {selectedIntegration.provider === 'elastic' && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-on-surface-variant mb-1">Rule Type</label>
                        <select
                          value={String(ruleConfig.type || 'query')}
                          onChange={e => setRuleConfig(p => ({ ...p, type: e.target.value, language: e.target.value === 'eql' ? 'eql' : e.target.value === 'esql' ? 'esql' : 'lucene' }))}
                          className="w-full px-3 py-2 bg-surface-container-high border border-outline-variant/20 rounded-lg text-sm text-on-surface"
                        >
                          <option value="query">Query (Lucene)</option>
                          <option value="eql">EQL</option>
                          <option value="esql">ES|QL</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-on-surface-variant mb-1">Risk Score (0-100)</label>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={Number(ruleConfig.riskScore || 50)}
                          onChange={e => setRuleConfig(p => ({ ...p, riskScore: Number(e.target.value) }))}
                          className="w-full px-3 py-2 bg-surface-container-high border border-outline-variant/20 rounded-lg text-sm text-on-surface focus:outline-none focus:border-primary/40"
                        />
                      </div>
                    </div>
                  )}

                  {/* Provider-specific config: CrowdStrike */}
                  {selectedIntegration.provider === 'crowdstrike' && (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-on-surface-variant mb-1">Severity</label>
                          <select
                            value={String(ruleConfig.severity ?? 50)}
                            onChange={e => setRuleConfig(p => ({ ...p, severity: Number(e.target.value) }))}
                            className="w-full px-3 py-2 bg-surface-container-high border border-outline-variant/20 rounded-lg text-sm text-on-surface"
                          >
                            <option value="10">Informational (10)</option>
                            <option value="30">Low (30)</option>
                            <option value="50">Medium (50)</option>
                            <option value="70">High (70)</option>
                            <option value="90">Critical (90)</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-on-surface-variant mb-1">Outcome</label>
                          <select
                            value={String(ruleConfig.outcome || 'detection')}
                            onChange={e => setRuleConfig(p => ({ ...p, outcome: e.target.value }))}
                            className="w-full px-3 py-2 bg-surface-container-high border border-outline-variant/20 rounded-lg text-sm text-on-surface"
                          >
                            <option value="detection">Detection</option>
                            <option value="incident">Incident</option>
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-on-surface-variant mb-1">Search Window (Lookback)</label>
                          <input
                            type="text"
                            value={String(ruleConfig.lookback || '1h0m')}
                            onChange={e => setRuleConfig(p => ({ ...p, lookback: e.target.value }))}
                            className="w-full px-3 py-2 bg-surface-container-high border border-outline-variant/20 rounded-lg text-sm text-on-surface focus:outline-none focus:border-primary/40"
                          />
                          <p className="text-[10px] text-on-surface-variant/50 mt-0.5">e.g. "1h0m", "5h0m", "75m"</p>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-on-surface-variant mb-1">Schedule Frequency</label>
                          <input
                            type="text"
                            value={String(ruleConfig.schedule || '@every 1h0m')}
                            onChange={e => setRuleConfig(p => ({ ...p, schedule: e.target.value }))}
                            className="w-full px-3 py-2 bg-surface-container-high border border-outline-variant/20 rounded-lg text-sm text-on-surface focus:outline-none focus:border-primary/40"
                          />
                          <p className="text-[10px] text-on-surface-variant/50 mt-0.5">e.g. "@every 1h0m" (min "@every 0h5m")</p>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-on-surface-variant mb-1">Trigger Mode</label>
                        <select
                          value={String(ruleConfig.triggerMode || 'summary')}
                          onChange={e => setRuleConfig(p => ({ ...p, triggerMode: e.target.value }))}
                          className="w-full px-3 py-2 bg-surface-container-high border border-outline-variant/20 rounded-lg text-sm text-on-surface"
                        >
                          <option value="summary">Summary</option>
                          <option value="verbose">Verbose</option>
                        </select>
                        <p className="text-[10px] text-on-surface-variant/50 mt-0.5">
                          Verbose creates 1 detection per result (50 limit). Summary creates a single detection.
                        </p>
                      </div>

                      {/* Deploy as Active/Inactive — production safety */}
                      <div className="p-3 rounded-lg border border-outline-variant/15 bg-surface-container-high/30">
                        <label className="block text-xs font-medium text-on-surface-variant mb-1">Initial Status</label>
                        <select
                          value={String(ruleConfig.status || 'inactive')}
                          onChange={e => setRuleConfig(p => ({ ...p, status: e.target.value }))}
                          className="w-full px-3 py-2 bg-surface-container-high border border-outline-variant/20 rounded-lg text-sm text-on-surface"
                        >
                          <option value="inactive">Inactive (recommended)</option>
                          <option value="active">Active</option>
                        </select>
                        <p className="text-[11px] text-on-surface-variant/60 mt-1">
                          {ruleConfig.status === 'active'
                            ? 'Rule will start running immediately. Make sure the CQL query is tested.'
                            : 'Rule will be deployed as inactive. You can review and activate it in the Falcon console.'}
                        </p>
                      </div>
                    </div>
                  )}

                  <button
                    onClick={handleDeploy}
                    disabled={!deployQuery}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg border transition-colors disabled:opacity-50 mt-2 text-on-surface border-outline-variant/30 hover:bg-surface-container-high"
                  >
                    <Icon name="upload" className="w-4 h-4" />
                    {deployAction === 'update' ? 'Update' : 'Deploy'}
                  </button>
                </div>
              )}

              {/* Step 4: Deploying */}
              {step === 'deploying' && (
                <div className="flex flex-col items-center justify-center py-12">
                  <Icon name="loader" className="w-8 h-8 animate-spin text-on-surface-variant mb-3" />
                  <p className="text-sm font-medium text-on-surface">
                    {deployAction === 'update' ? 'Updating rule on' : 'Creating alert on'} {selectedIntegration?.name}...
                  </p>
                  <p className="text-xs text-on-surface-variant mt-1">
                    {ruleName}
                  </p>
                </div>
              )}

              {/* Step 5: Result */}
              {step === 'result' && deployResult && (
                <div className="space-y-4">
                  {/* Success */}
                  {deployResult.success && (
                    <div className="p-4 rounded-xl border bg-green-500/5 border-green-500/20">
                      <div className="flex items-center gap-2 mb-3">
                        <Icon name="check-circle" className="w-5 h-5 text-green-500" />
                        <span className="text-sm font-medium text-green-500">
                          {deployResult.autoUpgraded || deployResult.autoRetried === '409_to_update'
                            ? 'Rule Updated Successfully'
                            : deployResult.autoRetried === '404_to_create'
                            ? 'Deployed Successfully'
                            : deployAction === 'update'
                            ? 'Rule Updated Successfully'
                            : 'Deployed Successfully'}
                        </span>
                      </div>

                      {/* Auto-retry notice */}
                      {deployResult.autoRetried === '409_to_update' && (
                        <div className="flex items-start gap-2 p-2.5 rounded-lg bg-blue-500/5 border border-blue-500/15 mb-3 ml-7">
                          <Icon name="info" className="w-3.5 h-3.5 text-blue-500 mt-0.5 flex-shrink-0" />
                          <p className="text-[11px] text-blue-500">
                            A rule with this name already existed in Splunk — it was updated instead of creating a duplicate.
                          </p>
                        </div>
                      )}
                      {deployResult.autoRetried === '404_to_create' && (
                        <div className="flex items-start gap-2 p-2.5 rounded-lg bg-blue-500/5 border border-blue-500/15 mb-3 ml-7">
                          <Icon name="info" className="w-3.5 h-3.5 text-blue-500 mt-0.5 flex-shrink-0" />
                          <p className="text-[11px] text-blue-500">
                            The existing rule was not found in Splunk — a new rule was created.
                          </p>
                        </div>
                      )}

                      {deployResult.record && (
                        <div className="ml-7 space-y-1.5 text-xs">
                          <div className="flex items-center gap-2">
                            <span className="text-on-surface-variant w-20">Rule</span>
                            <span className="text-on-surface font-medium truncate">{ruleName}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-on-surface-variant w-20">Target</span>
                            <span className="text-on-surface">{selectedIntegration?.name}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-on-surface-variant w-20">Action</span>
                            <span className="text-on-surface">
                              {deployResult.autoUpgraded || deployResult.autoRetried === '409_to_update' || deployAction === 'update'
                                ? 'Updated existing alert'
                                : 'Created as new alert'}
                            </span>
                          </div>
                          {deployResult.record.vendor_rule_id && (
                            <div className="flex items-center gap-2">
                              <span className="text-on-surface-variant w-20">Vendor ID</span>
                              <code className="bg-surface-container-highest px-1.5 py-0.5 rounded text-on-surface text-[11px] truncate max-w-[200px]">
                                {deployResult.record.vendor_rule_id}
                              </code>
                              <button
                                onClick={() => handleCopyVendorId(deployResult.record!.vendor_rule_id!)}
                                className="p-0.5 rounded hover:bg-surface-container-high transition-colors"
                                title="Copy vendor rule ID"
                              >
                                <Icon name={vendorIdCopied ? 'check' : 'copy'} className="w-3 h-3 text-on-surface-variant" />
                              </button>
                            </div>
                          )}
                          {deployResult.record.duration_ms != null && (
                            <div className="flex items-center gap-2">
                              <span className="text-on-surface-variant w-20">Duration</span>
                              <span className="text-on-surface">{deployResult.record.duration_ms}ms</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Failure */}
                  {!deployResult.success && (
                    <div className="p-4 rounded-xl border bg-error/5 border-error/20">
                      <div className="flex items-center gap-2 mb-2">
                        <Icon name="x-circle" className="w-5 h-5 text-error" />
                        <span className="text-sm font-medium text-error">Deployment Failed</span>
                      </div>
                      <p className="text-xs text-on-surface ml-7 mt-1">
                        {deployResult.error}
                      </p>
                      {deployResult.errorGuidance && (
                        <div className="flex items-start gap-2 p-2.5 rounded-lg bg-surface-container-high/50 border border-outline-variant/15 mt-3 ml-7">
                          <Icon name="info" className="w-3.5 h-3.5 text-on-surface-variant mt-0.5 flex-shrink-0" />
                          <p className="text-[11px] text-on-surface-variant">
                            {deployResult.errorGuidance}
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="flex gap-2">
                    {!deployResult.success && (
                      <button
                        onClick={handleRetry}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg border transition-colors text-on-surface border-outline-variant/30 hover:bg-surface-container-high"
                      >
                        <Icon name="refresh-cw" className="w-4 h-4" />
                        Try Again
                      </button>
                    )}
                    {deployResult.success && (
                      <button
                        onClick={handleViewDeployments}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg border transition-colors text-on-surface border-outline-variant/30 hover:bg-surface-container-high"
                      >
                        <Icon name="list" className="w-4 h-4" />
                        View Deployments
                      </button>
                    )}
                    <button
                      onClick={onClose}
                      className="flex-1 px-4 py-2.5 text-sm font-medium text-on-surface-variant bg-surface-container-high hover:bg-surface-container-highest rounded-lg transition-colors"
                    >
                      Close
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
