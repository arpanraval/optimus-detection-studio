import React, { useState } from 'react';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { nativeSiemService, type NativePreview } from '@/services/nativeSiemService';

export function NativeLocalEditor({
  preview,
  onSaved,
  onCancel,
}: {
  preview: NativePreview;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const operation = preview.local.config.operation as { schedule?: { definition?: string } };
  const search = preview.local.config.search as { lookback?: string };
  const [form, setForm] = useState({
    name: preview.local.name,
    description: preview.local.description,
    query: preview.local.query,
    severity: preview.local.severity,
    schedule: operation?.schedule?.definition || '',
    lookback: search?.lookback || '',
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
        CQL query
        <textarea
          required
          rows={8}
          className="block w-full p-3 font-mono text-xs rounded-lg bg-surface-container-high mt-1"
          value={form.query}
          onChange={(e) => setForm({ ...form, query: e.target.value })}
        />
      </label>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Input
          label="Schedule"
          required
          value={form.schedule}
          onChange={(e) => setForm({ ...form, schedule: e.target.value })}
        />
        <Input
          label="Lookback"
          required
          value={form.lookback}
          onChange={(e) => setForm({ ...form, lookback: e.target.value })}
        />
        <label className="block text-sm">
          Severity
          <select
            className="block w-full p-3 rounded-lg bg-surface-container-high mt-1"
            value={form.severity}
            onChange={(e) => setForm({ ...form, severity: e.target.value })}
          >
            {['Informational', 'Low', 'Medium', 'High', 'Critical'].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
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
