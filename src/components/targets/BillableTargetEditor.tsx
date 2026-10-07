'use client';

import { useEffect, useId, useState } from 'react';
import toast from 'react-hot-toast';
import { Button, Modal } from '@/components/ui';
import { bcClient } from '@/services/bc';
import { describeTargetSaveError, parseTargetPercent } from '@/utils';
import type { BillableTarget } from '@/utils';
import type { BCResource } from '@/types';

export interface BillableTargetEditorProps {
  isOpen: boolean;
  onClose: () => void;
  /** BC resource SystemId */
  resourceId: string;
  personName: string;
  /** Their effective target now */
  current: BillableTarget;
  companyDefaultPercent: number;
  /** Called with the updated resource after BC accepts the change */
  onSaved: (resource: BCResource) => void;
}

/**
 * Set one person's billable target, or put them back on the company default.
 * Saves to their BC resource; BC decides whether the user may.
 */
export function BillableTargetEditor({
  isOpen,
  onClose,
  resourceId,
  personName,
  current,
  companyDefaultPercent,
  onSaved,
}: BillableTargetEditorProps) {
  const inputId = useId();
  const [useDefault, setUseDefault] = useState(current.isDefault);
  const [value, setValue] = useState(String(current.percent));
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Start from the person's current target each time the dialog opens
  useEffect(() => {
    if (!isOpen) return;
    setUseDefault(current.isDefault);
    setValue(String(current.percent));
    setError(null);
  }, [isOpen, current.isDefault, current.percent]);

  const parsed = parseTargetPercent(value);
  const invalid = !useDefault && parsed === null;

  const handleSave = async () => {
    if (invalid) return;
    setIsSaving(true);
    setError(null);
    try {
      const updated = await bcClient.updateResourceBillableTarget(
        resourceId,
        useDefault ? null : parsed
      );
      onSaved(updated);
      toast.success(`Billable target updated for ${personName}`);
      onClose();
    } catch (err) {
      setError(describeTargetSaveError(err));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Billable target - ${personName}`} size="sm">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void handleSave();
        }}
      >
        <label className="text-dark-200 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={useDefault}
            onChange={(e) => setUseDefault(e.target.checked)}
            className="accent-knowall-green h-4 w-4"
          />
          Use company default ({companyDefaultPercent.toFixed(0)}%)
        </label>

        <div>
          <label htmlFor={inputId} className="text-dark-200 mb-1 block text-sm font-medium">
            Billable target (%)
          </label>
          <input
            id={inputId}
            type="number"
            inputMode="decimal"
            min={0}
            max={100}
            step="any"
            value={useDefault ? String(companyDefaultPercent) : value}
            onChange={(e) => setValue(e.target.value)}
            disabled={useDefault}
            aria-invalid={invalid}
            className="border-dark-600 bg-dark-800 text-dark-100 focus:ring-knowall-green w-28 rounded-lg border px-3 py-2 focus:ring-2 focus:outline-none disabled:opacity-50"
          />
          {invalid && <p className="mt-1 text-sm text-red-400">Enter a number from 0 to 100.</p>}
          <p className="text-dark-400 mt-1 text-xs">
            The share of logged hours expected to be billable.
          </p>
        </div>

        {error && (
          <p role="alert" className="rounded-lg bg-red-500/10 p-3 text-sm text-red-400">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button type="submit" disabled={invalid || isSaving}>
            {isSaving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
