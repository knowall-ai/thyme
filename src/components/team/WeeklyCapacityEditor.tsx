'use client';

import { useEffect, useId, useState } from 'react';
import toast from 'react-hot-toast';
import { Button, Modal } from '@/components/ui';
import { bcClient } from '@/services/bc';
import {
  MAX_WEEKLY_CAPACITY_HOURS,
  describeCapacitySaveError,
  formatHours,
  parseWeeklyCapacityHours,
} from '@/utils';
import type { WeeklyCapacity } from '@/utils';
import type { BCResource } from '@/types';

export interface WeeklyCapacityEditorProps {
  isOpen: boolean;
  onClose: () => void;
  /** BC resource SystemId */
  resourceId: string;
  personName: string;
  /** Their weekly capacity now */
  current: WeeklyCapacity;
  /** Called with the updated resource after BC accepts the change */
  onSaved: (resource: BCResource) => void;
}

/**
 * Set one person's weekly capacity and whether they work flexible days, or put them back
 * on the default (hours per day x 5). Saves to their BC resource; BC decides whether the
 * user may.
 */
export function WeeklyCapacityEditor({
  isOpen,
  onClose,
  resourceId,
  personName,
  current,
  onSaved,
}: WeeklyCapacityEditorProps) {
  const inputId = useId();
  const [useDefault, setUseDefault] = useState(!current.isSet);
  const [value, setValue] = useState(String(current.hours));
  const [flexible, setFlexible] = useState(current.flexible);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Start from the person's current capacity each time the dialog opens
  useEffect(() => {
    if (!isOpen) return;
    setUseDefault(!current.isSet);
    setValue(String(current.hours));
    setFlexible(current.flexible);
    setError(null);
  }, [isOpen, current.isSet, current.hours, current.flexible]);

  const parsed = parseWeeklyCapacityHours(value);
  const invalid = !useDefault && parsed === null;
  const notCounted = !useDefault && parsed === 0;

  const handleSave = async () => {
    if (invalid) return;
    setIsSaving(true);
    setError(null);
    try {
      const updated = await bcClient.updateResourceWeeklyCapacity(
        resourceId,
        useDefault ? null : parsed,
        flexible
      );
      onSaved(updated);
      toast.success(`Weekly capacity updated for ${personName}`);
      onClose();
    } catch (err) {
      setError(describeCapacitySaveError(err));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Weekly capacity - ${personName}`} size="sm">
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
          Use default ({formatHours(current.defaultHours)}h: hours per day x 5)
        </label>

        <div>
          <label htmlFor={inputId} className="text-dark-200 mb-1 block text-sm font-medium">
            Hours a week
          </label>
          <input
            id={inputId}
            type="number"
            inputMode="decimal"
            min={0}
            max={MAX_WEEKLY_CAPACITY_HOURS}
            step="any"
            value={useDefault ? String(current.defaultHours) : value}
            onChange={(e) => setValue(e.target.value)}
            disabled={useDefault}
            aria-invalid={invalid}
            className="border-dark-600 bg-dark-800 text-dark-100 focus:ring-knowall-green w-28 rounded-lg border px-3 py-2 focus:ring-2 focus:outline-none disabled:opacity-50"
          />
          {invalid && (
            <p className="mt-1 text-sm text-red-400">
              Enter a number from 0 to {MAX_WEEKLY_CAPACITY_HOURS}.
            </p>
          )}
          <p className="text-dark-400 mt-1 text-xs">
            {notCounted
              ? "0 keeps them listed but leaves them out of the team's capacity, completion and billable target."
              : `The hours they work in a week, e.g. ${formatHours(current.hoursPerDay * 2)} for two days.`}
          </p>
        </div>

        <label className="text-dark-200 flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={flexible}
            onChange={(e) => setFlexible(e.target.checked)}
            className="accent-knowall-green mt-0.5 h-4 w-4"
          />
          <span>
            Flexible working days
            <span className="text-dark-400 block text-xs">
              They work their hours on any days, so timesheet checks look at their week as a whole.
              A single day is still flagged when it&apos;s over a full day.
            </span>
          </span>
        </label>

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
