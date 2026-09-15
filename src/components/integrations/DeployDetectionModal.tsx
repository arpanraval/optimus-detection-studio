import React, { useState, useEffect } from 'react';
import { Icon } from '../Icon';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';
import { IntegrationLogo } from './IntegrationLogo';
import { getProviderMeta } from '../../lib/providerMeta';
import { getThreatLevelConfig } from '../../lib/ui/badges';
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
import { getDefaultRuleConfig } from '../../lib/providerRuleConfigDefaults';
import { ProviderRuleConfigForm } from './ProviderRuleConfigForm';
import { SiemPreflightPanel } from './SiemPreflightPanel';
import type { PreflightResult } from '../../types';
import { nativeSiemService } from '../../services/nativeSiemService';
import type { NativePreview } from '../../services/nativeSiemService';

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

function supportsPreflight(provider: IntegrationProvider | undefined): boolean {
  return provider === 'defender_xdr' || provider === 'crowdstrike';
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

/** Severity → the app-standard threat-level text colour (reused from the badge system). */
function severityTextColor(severity?: string): string {
  if (!severity) return 'text-on-surface';
  const key = severity.charAt(0).toUpperCase() + severity.slice(1).toLowerCase();
  return getThreatLevelConfig(key).text;
}

/** Quality score → colour band, reusing the threat-level palette so the card stays consistent. */
function qualityScoreColor(score: number): string {
  if (score >= 80) return 'text-[#4D7C6F]';                       // good
  if (score >= 60) return 'text-yellow-600 dark:text-yellow-400'; // acceptable
  return 'text-[#A63D40]';                                        // poor
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

type StepId = 'select' | 'validate' | 'preflight' | 'configure' | 'deploying' | 'result';

const STEP_LABELS: { id: StepId; label: string }[] = [
  { id: 'select', label: 'Select' },
  { id: 'validate', label: 'Validate' },
  { id: 'preflight', label: 'Pre-flight' },
  { id: 'configure', label: 'Configure' },
  { id: 'result', label: 'Result' },
];

function StepIndicator({ current, hasPreflight }: { current: StepId; hasPreflight: boolean }) {
  const labels = hasPreflight ? STEP_LABELS : STEP_LABELS.filter(s => s.id !== 'preflight');
  // Map deploying to result position (it's the transition to result)
  const effectiveStep = current === 'deploying' ? 'result' : current;
  const currentIdx = labels.findIndex(s => s.id === effectiveStep);

  return (
    <div className="flex items-center justify-center gap-1.5 mb-4">
      {labels.map((s, i) => {
        const isActive = s.id === effectiveStep;
        const isPast = i < currentIdx;
        return (
          <React.Fragment key={s.id}>
            <div className="flex items-center gap-1">
              <div className={`w-1.5 h-1.5 rounded-full transition-colors ${
                isActive ? 'bg-on-surface' : isPast ? 'bg-on-surface-variant/40' : 'bg-outline-variant'
              }`} />
              <span className={`text-[10px] transition-colors ${
                isActive ? 'text-on-surface font-medium' : isPast ? 'text-on-surface-variant/60' : 'text-on-surface-variant/30'
              }`}>
                {s.label}
              </span>
            </div>
            {i < labels.length - 1 && (
              <div className={`w-4 h-px ${isPast ? 'bg-on-surface-variant/30' : 'bg-outline-variant'}`} />
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
  previewOnly?: boolean;
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
  previewOnly = false,
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
  const [preflightResult, setPreflightResult] = useState<PreflightResult | null>(null);
  const [existingDeployment, setExistingDeployment] = useState<DeploymentRecord | null>(null);
  const [deployAction, setDeployAction] = useState<'create' | 'update'>('create');
  const [vendorIdCopied, setVendorIdCopied] = useState(false);
  // A rule already tracked in this SIEM is an UPDATE of a rule that exists, not a create. Its
  // identity and settings come from the binding, and the diff is the review that authorises it.
  const [boundPreview, setBoundPreview] = useState<NativePreview | null>(null);
  const [boundError, setBoundError] = useState<string | null>(null);

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

      // A rule already tracked in a SIEM has no ambiguity about where it's going — jump straight
      // past the picker to the production comparison for that connection.
      const activeBindings = detection.siem_observations || [];
      const boundIntegration = connected.find((integration) => activeBindings.some(
        (observation) => observation.binding_status === 'active' && observation.integration_id === integration.id,
      ));
      if (boundIntegration) {
        await handleSelectIntegration(boundIntegration);
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
    setPreflightResult(null);
    setBoundPreview(null);
    setBoundError(null);

    // Scoped to the CONNECTION being deployed to: a detection can be bound to more than one, and
    // only the binding for the selected connection describes this deploy.
    const binding = (detection.siem_observations || []).find(
      (observation) => observation.binding_status === 'active'
        && observation.integration_id === integration.id,
    );

    if (binding?.id) {
      // A tracked rule has nothing left to CHOOSE: its identity and settings come from the
      // binding, and the production comparison IS the review that replaces the create/update
      // radio and the provider config form. But it is a LIVE production detection, so
      // pre-flight validation of the query matters more here than for a brand-new rule, not
      // less — route through it exactly like any other deploy when the provider supports it.
      try {
        const nativePreview = await nativeSiemService.preview(binding.id);
        setBoundPreview(nativePreview);
        setDeployAction('update');
        setRuleConfig(getDefaultRuleConfig(integration.provider));
        setStep(supportsPreflight(integration.provider) ? 'preflight' : 'configure');
      } catch (err) {
        setBoundError(err instanceof Error ? err.message : 'Could not load the production comparison');
        setStep('validate');
      }
      return;
    }

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

    // Supported query providers route through the pre-flight step first.
    if (supportsPreflight(selectedIntegration.provider) && step === 'validate') {
      setStep('preflight');
      return;
    }

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
    if (!selectedIntegration || previewOnly) return;
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
        vendorRuleId: boundPreview?.binding.vendor_rule_id ?? existingDeployment?.vendor_rule_id ?? undefined,
        // Only set for a tracked rule: the exact revision the diff above showed.
        ...(boundPreview ? { expectedHash: boundPreview.remoteHash, expectedVersion: boundPreview.localVersion } : {}),
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
    <Modal title="Deploy the detection" subject={{ label: 'Detection', value: detection.name }} onClose={onClose}>
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
              {step !== 'select' && (
                <StepIndicator current={step} hasPreflight={supportsPreflight(selectedIntegration?.provider)} />
              )}

              {/* Step 1: Select Integration */}
              {step === 'select' && (
                <div className="space-y-4">
                  <p className="text-xs leading-relaxed text-on-surface-variant">
                    Choose where to deploy this detection as a native rule. Validation and
                    configuration come next.
                  </p>
                  {loading ? (
                    <div className="flex items-center justify-center py-10">
                      <Icon name="loader" className="h-5 w-5 animate-spin text-on-surface-variant" />
                    </div>
                  ) : integrations.length === 0 && disconnectedIntegrations.length === 0 ? (
                    <EmptyState
                      icon="unlink"
                      title="No SIEM integrations configured"
                      description="Connect a SIEM in integration settings before deploying a detection."
                      size="sm"
                    />
                  ) : (
                    <div className="space-y-2">
                      {/* Connected integrations — selectable */}
                      {integrations.map(integration => {
                        const meta = getProviderMeta(integration.provider);
                        return (
                          <button
                            key={integration.id}
                            onClick={() => handleSelectIntegration(integration)}
                            className="flex w-full items-center gap-3 rounded-xl border border-outline-variant px-3.5 py-3 text-left transition-colors hover:border-primary/40 hover:bg-surface-container-high/50"
                          >
                            {meta ? (
                              <IntegrationLogo provider={meta} size="md" />
                            ) : (
                              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface-container-high">
                                <Icon name="database" className="h-5 w-5 text-on-surface-variant" />
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-on-surface">
                                {integration.name}
                                {integration.is_default && (
                                  <span className="ml-2 text-[11px] font-normal text-on-surface-variant/60">
                                    Default
                                  </span>
                                )}
                              </p>
                              <p className="truncate text-xs text-on-surface-variant">
                                {meta?.name || integration.provider} · {getQueryLanguageForProvider(integration.provider)}
                              </p>
                            </div>
                            <Icon name="chevron-right" className="h-4 w-4 shrink-0 text-on-surface-variant" />
                          </button>
                        );
                      })}

                      {/* Disconnected integrations — shown for context, not selectable */}
                      {disconnectedIntegrations.map(integration => {
                        const meta = getProviderMeta(integration.provider);
                        return (
                          <div
                            key={integration.id}
                            className="flex w-full items-center gap-3 rounded-xl border border-outline-variant px-3.5 py-3 opacity-60"
                          >
                            {meta ? (
                              <IntegrationLogo provider={meta} size="md" />
                            ) : (
                              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface-container-high">
                                <Icon name="database" className="h-5 w-5 text-on-surface-variant/50" />
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-on-surface-variant">{integration.name}</p>
                              <p className="truncate text-xs text-on-surface-variant/60">{meta?.name || integration.provider}</p>
                            </div>
                            <span className={`shrink-0 text-[11px] font-medium ${
                              integration.status === 'error' ? 'text-error' : 'text-on-surface-variant/70'
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
                  <button
                    onClick={() => { setStep('select'); setValidation(null); setExistingDeployment(null); setPreflightResult(null); setBoundPreview(null); setBoundError(null); }}
                    className="flex items-center gap-1.5 text-xs font-medium text-on-surface-variant transition-colors hover:text-on-surface"
                  >
                    <Icon name="arrow-left" className="h-3.5 w-3.5" />
                    {selectedIntegration.name}
                  </button>

                  {/* Verdict — the answer first, before the supporting facts */}
                  {validation.errors.length > 0 ? (
                    <div className="flex items-center gap-2.5 rounded-xl border border-error/40 bg-error-container/40 px-3.5 py-2.5">
                      <Icon name="x-circle" className="h-4 w-4 flex-shrink-0 text-error" />
                      <span className="text-xs font-medium text-on-surface">
                        {validation.errors.length === 1
                          ? '1 issue must be fixed before deploying'
                          : `${validation.errors.length} issues must be fixed before deploying`}
                      </span>
                    </div>
                  ) : validation.warnings.length > 0 ? (
                    <div className="flex items-center gap-2.5 rounded-xl border border-ext-amber/40 bg-ext-amber-container/30 px-3.5 py-2.5">
                      <Icon name="alert-triangle" className="h-4 w-4 flex-shrink-0 text-ext-amber" />
                      <span className="text-xs font-medium text-on-surface">
                        Ready to deploy — {validation.warnings.length === 1
                          ? '1 warning to review'
                          : `${validation.warnings.length} warnings to review`}
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2.5 rounded-xl border border-ext-green/40 bg-ext-green-container/40 px-3.5 py-2.5">
                      <Icon name="check-circle" className="h-4 w-4 flex-shrink-0 text-ext-green" />
                      <span className="text-xs font-medium text-on-surface">
                        Ready to deploy to {selectedIntegration.name}
                      </span>
                    </div>
                  )}

                  {/* Pre-deploy check */}
                  <div className="rounded-xl border border-outline-variant bg-surface-container-high/40 p-4">
                    <p className="mb-3 text-[11px] font-medium uppercase tracking-wide text-on-surface-variant/70">
                      Pre-deploy check
                    </p>

                    {/* Scalar facts — label sits tight above its value so each pair reads as one unit */}
                    <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
                      <div>
                        <p className="text-[11px] text-on-surface-variant">Status</p>
                        <p className="mt-0.5 text-sm font-semibold text-on-surface">{detection.status}</p>
                      </div>
                      <div>
                        <p className="text-[11px] text-on-surface-variant">Severity</p>
                        <p className={`mt-0.5 text-sm font-semibold ${severityTextColor(detection.severity)}`}>
                          {detection.severity || '—'}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] text-on-surface-variant">Quality score</p>
                        <p className={`mt-0.5 text-sm font-semibold ${qualityScoreColor(detection.qualityScore ?? 0)}`}>
                          {detection.qualityScore ?? 0}%
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] text-on-surface-variant">Query language</p>
                        <p className="mt-0.5 text-sm font-semibold">
                          {validation.errors.some(e => e.code === 'QUERY_LANGUAGE_MISMATCH') ? (
                            <span className="text-error">No match</span>
                          ) : (
                            <span className="text-on-surface">{deployLanguage || detection.queryLanguage}</span>
                          )}
                        </p>
                      </div>
                    </div>

                    {/* MITRE ATT&CK — named techniques, not machine IDs or a bare count */}
                    <div className="mt-3 border-t border-outline-variant pt-3">
                      <p className="text-[11px] text-on-surface-variant">MITRE ATT&amp;CK techniques</p>
                      {(detection.mitreTechniques?.length ?? 0) > 0 ? (
                        <p className="mt-1 text-sm font-medium text-on-surface">
                          {detection.mitreTechniques.slice(0, 6).join('   ·   ')}
                          {detection.mitreTechniques.length > 6 && (
                            <span className="text-on-surface-variant">
                              {'   '}+{detection.mitreTechniques.length - 6} more
                            </span>
                          )}
                        </p>
                      ) : (
                        <p className="mt-1 text-sm font-medium text-yellow-600 dark:text-yellow-400">
                          Not mapped
                        </p>
                      )}
                    </div>
                  </div>

                  {/* A tracked rule failed to load its production comparison */}
                  {boundError && (
                    <div className="flex items-start gap-2 rounded-xl border border-error/30 bg-error-container/40 px-3.5 py-2.5">
                      <Icon name="x-circle" className="h-4 w-4 text-error mt-0.5 flex-shrink-0" />
                      <p className="text-xs text-error">{boundError}</p>
                    </div>
                  )}

                  {/* E3: Duplicate deployment notice — radio buttons */}
                  {existingDeployment && (
                    <div className="p-4 rounded-xl border border-outline-variant bg-surface-container-high/30">
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
                        <label className="flex items-start gap-3 p-2.5 rounded-lg border border-outline-variant cursor-pointer hover:bg-surface-container-high/50 transition-colors has-[:checked]:border-on-surface-variant/40 has-[:checked]:bg-surface-container-high/50">
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

                        <label className="flex items-start gap-3 p-2.5 rounded-lg border border-outline-variant cursor-pointer hover:bg-surface-container-high/50 transition-colors has-[:checked]:border-on-surface-variant/40 has-[:checked]:bg-surface-container-high/50">
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
                        <div key={i} className="flex items-start gap-2 rounded-xl border border-error/30 bg-error-container/40 px-3.5 py-2.5">
                          <Icon name="x-circle" className="h-4 w-4 text-error mt-0.5 flex-shrink-0" />
                          <p className="text-xs text-error">{err.message}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Non-blocking warnings */}
                  {validation.warnings.length > 0 && (
                    <div className="space-y-2">
                      {validation.warnings.map((warn, i) => (
                        <div key={i} className="flex items-start gap-2 rounded-xl border border-ext-amber/30 bg-ext-amber-container/30 px-3.5 py-2.5">
                          <Icon name="alert-triangle" className="h-4 w-4 text-ext-amber mt-0.5 flex-shrink-0" />
                          <p className="text-[11px] leading-relaxed text-on-surface-variant">{warn.message}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Sigma hint */}
                  {validation.errors.some(e => e.code === 'QUERY_LANGUAGE_MISMATCH') && detection.queries?.some(q => q.language?.toLowerCase() === 'sigma') && (
                    <div className="flex items-start gap-2 rounded-xl border border-outline-variant bg-surface-container-high/50 px-3.5 py-2.5">
                      <Icon name="info" className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                      <p className="text-[11px] leading-relaxed text-on-surface-variant">
                        This detection has a Sigma rule that could be converted to {getQueryLanguageForProvider(selectedIntegration.provider)}.
                        Use the Sigma Converter to generate a compatible query first.
                      </p>
                    </div>
                  )}

                  <Button
                    onClick={handleProceedToConfigure}
                    disabled={!validation.eligible}
                    variant="filled"
                    color="primary"
                    fullWidth
                    leadingIcon={validation.eligible ? 'arrowRight' : 'x-circle'}
                  >
                    {validation.eligible ? 'Continue' : 'Cannot Deploy — Fix Errors Above'}
                  </Button>
                </div>
              )}

              {/* Step: Query pre-flight */}
              {step === 'preflight' && selectedIntegration && (
                <div className="space-y-4">
                  <button
                    onClick={() => setStep('validate')}
                    className="flex items-center gap-1.5 text-xs font-medium text-on-surface-variant transition-colors hover:text-on-surface"
                  >
                    <Icon name="arrow-left" className="h-3.5 w-3.5" />
                    {selectedIntegration.name}
                  </button>

                  <SiemPreflightPanel
                    detection={detection}
                    integration={selectedIntegration}
                    mode="deploy"
                    onResult={setPreflightResult}
                  />

                  {/* Soft gate: a failed validation warns but never blocks. */}
                  {preflightResult && !preflightResult.validation_passed && (
                    <div className="flex items-start gap-2 rounded-xl border border-ext-amber/30 bg-ext-amber-container/30 px-3.5 py-2.5">
                      <Icon name="alert-triangle" className="h-4 w-4 text-ext-amber mt-0.5 flex-shrink-0" />
                      <p className="text-[11px] leading-relaxed text-on-surface-variant">
                        The query did not pass validation. You can still deploy, but the rule may fail in the target SIEM.
                      </p>
                    </div>
                  )}

                  <Button
                    onClick={handleProceedToConfigure}
                    variant="filled"
                    color="primary"
                    fullWidth
                    leadingIcon="arrowRight"
                  >
                    {preflightResult && !preflightResult.validation_passed
                      ? 'Continue Anyway'
                      : 'Continue to Configure'}
                  </Button>
                </div>
              )}

              {/* Step 3: Configure */}
              {step === 'configure' && selectedIntegration && (
                <div className="space-y-4">
                  {previewOnly && (
                    <div className="flex items-start gap-2 rounded-xl border border-ext-amber/30 bg-ext-amber-container/30 px-3.5 py-2.5">
                      <Icon name="info" className="h-3.5 w-3.5 text-ext-amber mt-0.5 flex-shrink-0" />
                      <p className="text-[11px] leading-relaxed text-on-surface-variant">Preview Mode — Configuration is read-only</p>
                    </div>
                  )}
                  <button
                    onClick={() => setStep(supportsPreflight(selectedIntegration.provider) ? 'preflight' : 'validate')}
                    className="flex items-center gap-1.5 text-xs font-medium text-on-surface-variant transition-colors hover:text-on-surface"
                  >
                    <Icon name="arrow-left" className="h-3.5 w-3.5" />
                    {selectedIntegration.name}
                  </button>

                  {/* Rule Name */}
                  <div>
                    <label className="block text-xs font-medium text-on-surface-variant mb-1">Rule Name</label>
                    <input
                      type="text"
                      value={ruleName}
                      onChange={e => setRuleName(e.target.value)}
                      readOnly={previewOnly}
                      className={`w-full px-3 py-2 bg-surface-container-high border border-outline-variant rounded-lg text-sm text-on-surface focus:outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10${previewOnly ? ' opacity-70 cursor-default' : ''}`}
                    />
                  </div>

                  {/* Rule Description */}
                  <div>
                    <label className="block text-xs font-medium text-on-surface-variant mb-1">Description</label>
                    <textarea
                      value={ruleDescription}
                      onChange={e => setRuleDescription(e.target.value)}
                      readOnly={previewOnly}
                      rows={2}
                      className={`w-full px-3 py-2 bg-surface-container-high border border-outline-variant rounded-lg text-sm text-on-surface focus:outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 resize-none${previewOnly ? ' opacity-70 cursor-default' : ''}`}
                    />
                  </div>

                  {/* Query Preview */}
                  <div>
                    <label className="block text-xs font-medium text-on-surface-variant mb-1">
                      Query ({deployLanguage || getQueryLanguageForProvider(selectedIntegration.provider)})
                    </label>
                    <pre className="p-3 bg-surface-container-highest rounded-lg text-xs text-on-surface overflow-x-auto max-h-32 font-mono border border-outline-variant">
                      {deployQuery || 'No query available'}
                    </pre>
                  </div>

                  {/* A rule already tracked in this SIEM: the production comparison IS the
                      review, replacing the provider config form entirely — lookback/schedule
                      come from the binding's stored configuration, and a form defaulting to
                      e.g. 1h0m would invite silently overwriting a real value. */}
                  {boundPreview ? (
                    <div className="space-y-3">
                      <p className="text-sm">
                        This rule already exists in {selectedIntegration.name} and will be updated in place.
                      </p>
                      <p className="text-xs text-on-surface-variant break-all">
                        {selectedIntegration.name} ID: <code>{boundPreview.binding.vendor_rule_id}</code>
                      </p>
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                        <section className="min-w-0 p-3 rounded-xl bg-surface-container-high">
                          <h4 className="text-sm font-semibold mb-2">In your library</h4>
                          <pre className="text-xs whitespace-pre-wrap break-words max-h-48 overflow-auto font-mono">
                            {boundPreview.local.query}
                          </pre>
                        </section>
                        <section className="min-w-0 p-3 rounded-xl bg-surface-container-high">
                          <h4 className="text-sm font-semibold mb-2">In {selectedIntegration.name} · last fetched</h4>
                          <pre className="text-xs whitespace-pre-wrap break-words max-h-48 overflow-auto font-mono">
                            {boundPreview.remote.query}
                          </pre>
                        </section>
                      </div>
                      {boundPreview.capabilities.update && (
                        <p role="alert" className="text-sm text-on-surface-variant">
                          {boundPreview.capabilities.update}
                        </p>
                      )}
                    </div>
                  ) : (
                    <ProviderRuleConfigForm
                      provider={selectedIntegration.provider}
                      ruleConfig={ruleConfig}
                      onChange={setRuleConfig}
                      previewOnly={previewOnly}
                    />
                  )}

                  {previewOnly ? (
                    <div className="space-y-4 mt-2">
                      <div className="flex items-start gap-2 rounded-xl border border-ext-amber/30 bg-ext-amber-container/30 px-3.5 py-3">
                        <Icon name="info" className="h-3.5 w-3.5 text-ext-amber mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="text-xs font-medium text-on-surface mb-0.5">Preview Only</p>
                          <p className="text-[11px] leading-relaxed text-on-surface-variant">
                            This is a Detection Lab rule. Promote to Production to deploy.
                          </p>
                        </div>
                      </div>
                      <Button onClick={onClose} variant="filled" color="primary" fullWidth>
                        Close Preview
                      </Button>
                    </div>
                  ) : (
                    <Button
                      onClick={handleDeploy}
                      disabled={!deployQuery || (boundPreview ? !!boundPreview.capabilities.update : false)}
                      variant="filled"
                      color="primary"
                      fullWidth
                      leadingIcon="upload"
                    >
                      {boundPreview
                        ? `Update in ${selectedIntegration.name}`
                        : deployAction === 'update' ? 'Update' : 'Deploy'}
                    </Button>
                  )}
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
                    <div className="rounded-xl border border-ext-green/30 bg-ext-green-container/40 px-3.5 py-3">
                      <div className="flex items-center gap-2 mb-3">
                        <Icon name="check-circle" className="h-4 w-4 text-ext-green mt-0.5 flex-shrink-0" />
                        <span className="text-sm font-medium text-on-surface">
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
                        <div className="flex items-start gap-2 rounded-xl border border-outline-variant bg-surface-container-high/50 px-3.5 py-2.5 mb-3 ml-6">
                          <Icon name="info" className="h-3.5 w-3.5 text-on-surface-variant mt-0.5 flex-shrink-0" />
                          <p className="text-[11px] leading-relaxed text-on-surface-variant">
                            A rule with this name already existed in Splunk — it was updated instead of creating a duplicate.
                          </p>
                        </div>
                      )}
                      {deployResult.autoRetried === '404_to_create' && (
                        <div className="flex items-start gap-2 rounded-xl border border-outline-variant bg-surface-container-high/50 px-3.5 py-2.5 mb-3 ml-6">
                          <Icon name="info" className="h-3.5 w-3.5 text-on-surface-variant mt-0.5 flex-shrink-0" />
                          <p className="text-[11px] leading-relaxed text-on-surface-variant">
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
                    <div className="rounded-xl border border-error/30 bg-error-container/40 px-3.5 py-3">
                      <div className="flex items-center gap-2 mb-2">
                        <Icon name="x-circle" className="h-4 w-4 text-error mt-0.5 flex-shrink-0" />
                        <span className="text-sm font-medium text-on-surface">Deployment Failed</span>
                      </div>
                      <p className="text-xs text-on-surface-variant ml-6 mt-1">
                        {deployResult.error}
                      </p>
                      {deployResult.errorGuidance && (
                        <div className="flex items-start gap-2 rounded-xl border border-outline-variant bg-surface-container-high/50 px-3.5 py-2.5 mt-3 ml-6">
                          <Icon name="info" className="h-3.5 w-3.5 text-on-surface-variant mt-0.5 flex-shrink-0" />
                          <p className="text-[11px] leading-relaxed text-on-surface-variant">
                            {deployResult.errorGuidance}
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="flex gap-2">
                    {!deployResult.success && (
                      <Button
                        onClick={handleRetry}
                        variant="filled"
                        color="primary"
                        fullWidth
                        leadingIcon="refresh-cw"
                      >
                        Try Again
                      </Button>
                    )}
                    {deployResult.success && (
                      <Button
                        onClick={handleViewDeployments}
                        variant="outlined"
                        color="primary"
                        fullWidth
                        leadingIcon="list"
                      >
                        View Deployments
                      </Button>
                    )}
                    <Button
                      onClick={onClose}
                      variant="text"
                      color="surface"
                      fullWidth
                    >
                      Close
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
    </Modal>
  );
};
