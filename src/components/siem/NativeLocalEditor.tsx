import { Select } from '@/components/ui/Select';
import React, { useState } from 'react';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { nativeSiemService, type NativePreview } from '@/services/nativeSiemService';
import { schedulingFields } from '../../../supabase/functions/_shared/siem-rule-editing';

export function NativeLocalEditor({
  preview,
  onSaved,
  onCancel,
}: {
  preview: NativePreview;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const fields = schedulingFields(preview.local);
  const [form, setForm] = useState({
    name: preview.local.name,
    description: preview.local.description,
    query: preview.local.query,
    severity: preview.local.severity,
    schedule: fields.schedule,
    lookback: fields.lookback,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="space-y-3 rounded-xl border border-outline-variant p-4"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setError(null);
        try {
          await nativeSiemService.save(preview, form);
          onSaved();
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Could not save local revision');
        } finally {
          setBusy(false);
        }
      }}
    >
      <h4 className="font-semibold">Edit library revision</h4>
      <p className="text-sm text-on-surface-variant">
        Saving creates a local revision. Production stays unchanged until you review and deploy.
      </p>
      <Input
        label="Rule name"
        required
        value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
      />
      <label className="block text-sm">
        Description
        <textarea
          className="block w-full p-3 rounded-lg bg-surface-container-high mt-1"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
      </label>
      <label className="block text-sm">
        {preview.local.language} query
        <textarea
          required
          rows={8}
          className="block w-full p-3 font-mono text-xs rounded-lg bg-surface-container-high mt-1"
          value={form.query}
          onChange={(e) => setForm({ ...form, query: e.target.value })}
        />
      </label>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {fields.scheduleEditable && <Input
          label="Schedule"
          required
          value={form.schedule}
          onChange={(e) => setForm({ ...form, schedule: e.target.value })}
        />}
        {fields.lookbackEditable && <Input
          label="Lookback"
          required
          value={form.lookback}
          onChange={(e) => setForm({ ...form, lookback: e.target.value })}
        />}
        <label className="block text-sm">
          Severity
          <Select
            value={form.severity}
            onChange={(nextValue) => setForm({ ...form, severity: nextValue })}
            aria-label="Severity"
            size="md"
            className="block w-full mt-1"
            options={[
              ...['Unknown', 'Informational', 'Low', 'Medium', 'High', 'Critical']
                .filter(
                  (value) => value !== 'Critical' || !['sentinel', 'defender_xdr'].includes(preview.binding.provider),
                )
                .map((value) => ({ value: value, label: value })),
            ]}
          />
        </label>
      </div>
      {error && (
        <p role="alert" className="text-sm text-error">
          {error}
        </p>
      )}
      <Button type="submit" size="sm" disabled={busy}>
        {busy ? 'Saving…' : 'Save local revision'}
      </Button>
      <Button type="button" size="sm" variant="text" disabled={busy} onClick={onCancel}>
        Cancel
      </Button>
    </form>
  );
}
