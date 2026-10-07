'use client';

import { useEffect, useId, useState } from 'react';
import toast from 'react-hot-toast';
import { ChartPieIcon } from '@heroicons/react/24/outline';
import { Button, Card } from '@/components/ui';
import { bcClient } from '@/services/bc';
import { useBillableTargetStore, useCompanyStore } from '@/hooks';
import { describeTargetSaveError, parseTargetPercent } from '@/utils';

/**
 * Settings card for the company default billable target (Thyme Setup in BC).
 * Hidden when the installed Thyme BC Extension doesn't support targets.
 */
export function CompanyBillableTargetSettings() {
  const inputId = useId();
  const { companyVersion } = useCompanyStore();
  const {
    companyDefaultPercent,
    setupAvailable,
    loadedForCompanyVersion,
    loadCompanyDefault,
    setCompanyDefault,
  } = useBillableTargetStore();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    void loadCompanyDefault(companyVersion);
  }, [companyVersion, loadCompanyDefault]);

  // Show the saved default whenever it (re)loads
  useEffect(() => {
    setValue(companyDefaultPercent === null ? '' : String(companyDefaultPercent));
    setError(null);
  }, [companyDefaultPercent]);

  // Only once the current company's setup has loaded, so another company's default never shows
  if (
    !setupAvailable ||
    companyDefaultPercent === null ||
    loadedForCompanyVersion !== companyVersion
  ) {
    return null;
  }

  const parsed = parseTargetPercent(value);
  const invalid = parsed === null;
  const unchanged = parsed === companyDefaultPercent;

  const handleSave = async () => {
    if (parsed === null) return;
    // The company the save is for; ignored by the store if the user switches company meanwhile
    const savedForCompanyVersion = companyVersion;
    setIsSaving(true);
    setError(null);
    try {
      const saved = await bcClient.updateDefaultBillableTarget(parsed);
      setCompanyDefault(saved.defaultBillableTargetPercent ?? parsed, savedForCompanyVersion);
      toast.success('Company billable target updated');
    } catch (err) {
      setError(describeTargetSaveError(err));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card variant="bordered" className="p-6">
      <div className="mb-4 flex items-center gap-3">
        <ChartPieIcon className="text-thyme-500 h-6 w-6" />
        <h2 className="text-lg font-semibold text-white">Billable Target</h2>
      </div>
      <form
        className="flex flex-wrap items-end justify-between gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void handleSave();
        }}
      >
        <div>
          <label htmlFor={inputId} className="text-dark-100 block">
            Company default billable target (%)
          </label>
          <p className="text-dark-400 text-sm">
            Applies to everyone without their own target. Set a person&apos;s own target from the
            Team page.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            id={inputId}
            type="number"
            inputMode="decimal"
            min={0}
            max={100}
            step="any"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-invalid={invalid}
            className="border-dark-600 bg-dark-800 text-dark-100 focus:ring-thyme-500 w-24 rounded-lg border px-3 py-2 focus:ring-2 focus:outline-none"
          />
          <Button type="submit" size="sm" disabled={invalid || unchanged || isSaving}>
            {isSaving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </form>
      {invalid && <p className="mt-2 text-sm text-red-400">Enter a number from 0 to 100.</p>}
      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-red-500/10 p-3 text-sm text-red-400">
          {error}
        </p>
      )}
    </Card>
  );
}
