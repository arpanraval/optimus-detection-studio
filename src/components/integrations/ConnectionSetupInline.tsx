import { Select } from '@/components/ui/Select';
import React, { useState } from 'react';
import { Icon } from '../Icon';
import { Button } from '../ui/Button';
import type {
  IntegrationProvider,
  ConnectionTestResult,
} from '../../types';
import { integrationService } from '../../lib/integrationService';
import { useBeforeUnload } from '../../hooks/useBeforeUnload';
import {
  PROVIDER_FIELDS,
  PROVIDER_SETUP_GUIDES,
  PROVIDER_CATEGORY,
  isFieldVisible,
  getAuthType,
  buildConfig,
  buildCredentials,
  getDefaultFormValues,
  type IntegrationFieldDef,
} from '../../lib/integrationFormConfig';

// =============================================================================
// Setup Guide Accordion
// =============================================================================

const SetupGuideAccordion: React.FC<{ provider: string }> = ({ provider }) => {
  const guide = PROVIDER_SETUP_GUIDES[provider];
  const [expanded, setExpanded] = useState(false);

  if (!guide) return null;

  return (
    <div className="rounded-lg border border-outline-variant/10 bg-surface-container-high overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-surface-container-highest/50 transition-colors"
      >
        <Icon name="info" className="w-3.5 h-3.5 text-primary shrink-0" />
        <span className="text-xs font-medium text-on-surface flex-1">Setup Guide</span>
        <Icon
          name={expanded ? 'chevron-down' : 'chevron-right'}
          className="w-3.5 h-3.5 text-on-surface-variant shrink-0"
        />
      </button>

      {!expanded && (
        <p className="px-3 pb-2.5 -mt-1 text-xs text-on-surface-variant">{guide.summary}</p>
      )}

      {expanded && (
        <div className="px-3 pb-3 space-y-2.5">
          <p className="text-xs text-on-surface-variant">{guide.summary}</p>

          <ol className="list-decimal list-inside space-y-1">
            {guide.steps.map((step, i) => (
              <li key={i} className="text-xs text-on-surface-variant leading-relaxed">
                {step}
              </li>
            ))}
          </ol>

          {guide.permissions && guide.permissions.length > 0 && (
            <div>
              <p className="text-[10px] font-medium text-on-surface-variant/70 uppercase tracking-wider mb-1">
                Required permissions
              </p>
              <ul className="space-y-0.5">
                {guide.permissions.map((perm, i) => (
                  <li key={i} className="text-xs text-on-surface-variant flex items-start gap-1.5">
                    <span className="text-on-surface-variant/50 mt-px">&#8226;</span>
                    <code className="font-mono text-[11px]">{perm}</code>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {guide.notes && guide.notes.length > 0 && (
            <div className="space-y-1">
              {guide.notes.map((note, i) => (
                <p key={i} className="text-xs text-on-surface-variant flex items-start gap-1.5">
                  <span className="shrink-0 mt-px">&#128161;</span>
                  <span>{note}</span>
                </p>
              ))}
            </div>
          )}

          {guide.docsUrl && (
            <a
              href={guide.docsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
            >
              <Icon name="external-link" className="w-3 h-3" />
              View documentation
            </a>
          )}
        </div>
      )}
    </div>
  );
};

// =============================================================================
// ConnectionSetupInline
// =============================================================================

interface ConnectionSetupInlineProps {
  provider: IntegrationProvider;
  providerDisplayName: string;
  /** If provided, we're editing an existing integration */
  existingIntegrationId?: string;
  /** Prefill form values (for edit mode) */
  initialValues?: Record<string, string | number | boolean>;
  /** True when adding a second+ connection for the same provider */
  isAdditionalConnection?: boolean;
  onConnected: () => void;
  onCancel: () => void;
}

export const ConnectionSetupInline: React.FC<ConnectionSetupInlineProps> = ({
  provider,
  providerDisplayName,
  existingIntegrationId,
  initialValues,
  isAdditionalConnection,
  onConnected,
  onCancel,
}) => {
  const [formValues, setFormValues] = useState<Record<string, string | number | boolean>>(
    () => initialValues || getDefaultFormValues(provider)
  );
  const [integrationName, setIntegrationName] = useState(
    existingIntegrationId ? '' : isAdditionalConnection ? '' : `${providerDisplayName} Production`
  );
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdIntegrationId, setCreatedIntegrationId] = useState<string | null>(
    existingIntegrationId || null
  );

  const fields = PROVIDER_FIELDS[provider] || [];
  const isEditMode = !!existingIntegrationId;

  // Warn on refresh when credentials form has been touched
  const hasFormContent = Object.values(formValues).some(v =>
    typeof v === 'string' ? v.trim().length > 0 : false
  );
  useBeforeUnload(hasFormContent);

  const handleTestConnection = async () => {
    setTesting(true);
    setError(null);
    setTestResult(null);

    try {
      let integrationId = createdIntegrationId;
      if (!integrationId) {
        const integration = await integrationService.createIntegration({
          provider,
          name: integrationName || `${providerDisplayName} Production`,
          category: PROVIDER_CATEGORY[provider] || 'siem',
          config: buildConfig(provider, formValues) as any,
          authType: getAuthType(provider, formValues),
          credentials: buildCredentials(provider, formValues),
        });
        integrationId = integration.id;
        setCreatedIntegrationId(integrationId);
      } else {
        await integrationService.updateCredentials(
          integrationId,
          buildConfig(provider, formValues) as any,
          buildCredentials(provider, formValues)
        );
      }

      const result = await integrationService.testConnection(integrationId);
      setTestResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection test failed');
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      if (!createdIntegrationId && !isEditMode) {
        // Create integration if not yet created (user clicked Save before Test)
        const integration = await integrationService.createIntegration({
          provider,
          name: integrationName || `${providerDisplayName} Production`,
          category: PROVIDER_CATEGORY[provider] || 'siem',
          config: buildConfig(provider, formValues) as any,
          authType: getAuthType(provider, formValues),
          credentials: buildCredentials(provider, formValues),
        });
        setCreatedIntegrationId(integration.id);
      } else if (createdIntegrationId && !isEditMode) {
        await integrationService.updateCredentials(
          createdIntegrationId,
          undefined,
          undefined,
          integrationName || `${providerDisplayName} Production`
        );
      }
      onConnected();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = async () => {
    // Clean up if we created an integration but user cancels
    if (createdIntegrationId && !isEditMode && !testResult?.success) {
      try {
        await integrationService.deleteIntegration(createdIntegrationId);
      } catch {
        // Best effort cleanup
      }
    }
    onCancel();
  };

  const nameRequired = isAdditionalConnection && !integrationName.trim();
  const visibleFields = fields.filter(f => isFieldVisible(provider, f, formValues));

  return (
    <div className="border border-outline-variant/20 rounded-xl bg-surface-container/60 overflow-hidden">
      <div className="p-5 space-y-3">
        {/* Setup guide */}
        <SetupGuideAccordion provider={provider} />

        {/* Connection name (new connections only) */}
        {!isEditMode && (
          <div>
            <label className="block text-xs font-medium text-on-surface-variant mb-1">
              Connection Name
              {isAdditionalConnection && <span className="text-error ml-0.5">*</span>}
            </label>
            <input
              type="text"
              value={integrationName}
              onChange={e => setIntegrationName(e.target.value)}
              placeholder={isAdditionalConnection
                ? `e.g. ${providerDisplayName} - Testing`
                : `e.g. ${providerDisplayName} Production`
              }
              className={`w-full px-3 py-2 bg-surface-container-high border rounded-lg text-sm text-on-surface placeholder-on-surface-variant/50 focus:outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 ${
                isAdditionalConnection && !integrationName.trim()
                  ? 'border-error/30'
                  : 'border-outline-variant/20'
              }`}
            />
            {isAdditionalConnection && (
              <p className="text-[11px] text-on-surface-variant/60 mt-1">
                Give this connection a distinct name (e.g. Production, Testing)
              </p>
            )}
          </div>
        )}

        {/* Form fields */}
        {visibleFields.map(field => (
          <FieldRenderer
            key={field.key}
            field={field}
            value={formValues[field.key]}
            onChange={(val) => setFormValues(v => ({ ...v, [field.key]: val }))}
          />
        ))}

        {/* Error display */}
        {error && (
          <div className="p-3 rounded-lg bg-error/10 border border-error/20 text-error text-xs">
            {error}
          </div>
        )}

        {/* Test result */}
        {testResult && (
          <div className={`p-3 rounded-xl border ${
            testResult.success
              ? 'bg-[#4D7C6F]/5 border-[#4D7C6F]/20'
              : 'bg-[#A63D40]/5 border-[#A63D40]/20'
          }`}>
            <div className="flex items-center gap-2">
              <Icon
                name={testResult.success ? 'check-circle' : 'alert-circle'}
                className={`w-4 h-4 ${testResult.success ? 'text-[#4D7C6F]' : 'text-[#A63D40]'}`}
              />
              <span className={`text-sm font-medium ${testResult.success ? 'text-[#4D7C6F]' : 'text-[#A63D40]'}`}>
                {testResult.success ? 'Connection Successful' : 'Connection Failed'}
              </span>
            </div>
            <p className="text-xs text-on-surface-variant ml-6 mt-1">{testResult.message}</p>
            {testResult.latency_ms > 0 && (
              <p className="text-[10px] text-on-surface-variant/50 ml-6 mt-0.5">
                Latency: {testResult.latency_ms}ms
              </p>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-3 pt-2">
          <Button
            color="secondary"
            variant="tonal"
            size="md"
            leadingIcon="zap"
            onClick={handleTestConnection}
            disabled={testing || nameRequired}
            loading={testing}
          >
            {testing ? 'Testing...' : 'Test Connection'}
          </Button>

          <Button
            color="primary"
            size="md"
            leadingIcon="check"
            onClick={handleSave}
            disabled={saving || testing || nameRequired}
            loading={saving}
          >
            {isEditMode ? 'Save Changes' : 'Save Connection'}
          </Button>

          <Button
            color="surface"
            variant="text"
            size="md"
            onClick={handleCancel}
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
};

// =============================================================================
// Field Renderer
// =============================================================================

const FieldRenderer: React.FC<{
  field: IntegrationFieldDef;
  value: string | number | boolean | undefined;
  onChange: (value: string | number | boolean) => void;
}> = ({ field, value, onChange }) => {
  if (field.type === 'checkbox') {
    return (
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={!!value}
          onChange={e => onChange(e.target.checked)}
          className="w-4 h-4 rounded border-outline-variant accent-primary"
        />
        <span className="text-xs text-on-surface">{field.label}</span>
      </label>
    );
  }

  if (field.type === 'select') {
    return (
      <div>
        <label className="block text-xs font-medium text-on-surface-variant mb-1">{field.label}</label>
        <Select
          value={String(value || '')}
          onChange={(nextValue) => onChange(nextValue)}
          aria-label={field.label}
          size="sm"
          className="w-full"
          options={[...(field.options?.map((opt) => ({ value: opt.value, label: opt.label })) ?? [])]}
        />
      </div>
    );
  }

  return (
    <div>
      <label className="block text-xs font-medium text-on-surface-variant mb-1">
        {field.label}
        {field.required && <span className="text-error ml-0.5">*</span>}
      </label>
      <input
        type={field.type}
        value={String(value ?? '')}
        placeholder={field.placeholder}
        onChange={e => onChange(field.type === 'number' ? Number(e.target.value) : e.target.value)}
        className="w-full px-3 py-2 bg-surface-container-high border border-outline-variant/20 rounded-lg text-sm text-on-surface placeholder-on-surface-variant/50 focus:outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
      />
    </div>
  );
};
