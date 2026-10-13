'use client';

import type { ReactNode } from 'react';
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { Card, DatePicker } from '@/components/ui';
import {
  PERIOD_PRESETS,
  currentPeriod,
  customPeriod,
  formatPeriod,
  getPresetPeriod,
  isCurrentPeriod,
  matchPreset,
  stepPeriod,
} from '@/utils';
import type { PeriodPreset, PeriodUnit, ReportPeriod } from '@/utils';

const CUSTOM = 'custom';

// What the period dropdown shows once stepped away from every preset, e.g. three
// months back is "Month: July 2026" in the label beside it
const UNIT_LABELS: Record<PeriodUnit, string> = {
  week: 'Week',
  month: 'Month',
  quarter: 'Quarter',
  year: 'Year',
  yearToDate: 'Year to date',
  custom: 'Custom range',
};

const navButtonClass =
  'bg-dark-700 text-dark-300 hover:bg-dark-600 rounded-lg p-2 transition-colors hover:text-white';

export interface ReportPeriodPickerProps {
  period: ReportPeriod;
  onChange: (period: ReportPeriod) => void;
  /** Other controls shown beside the period dropdown, e.g. the resource filter */
  children?: ReactNode;
}

/**
 * Picks the report's period: a preset (this week ... last year), a custom date range,
 * and arrows to step back and forward by the period's own length.
 */
export function ReportPeriodPicker({ period, onChange, children }: ReportPeriodPickerProps) {
  const preset = matchPreset(period);
  const isCustom = period.unit === 'custom';
  const selectValue = preset ?? (isCustom ? CUSTOM : '');

  const handleSelect = (value: string) => {
    // A custom range starts as the period on screen, ready to adjust
    if (value === CUSTOM) onChange(customPeriod(period.from, period.to));
    else onChange(getPresetPeriod(value as PeriodPreset));
  };

  return (
    <Card variant="bordered" className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => onChange(stepPeriod(period, -1))}
            className={navButtonClass}
            aria-label="Previous period"
          >
            <ChevronLeftIcon className="h-5 w-5" />
          </button>
          <button
            onClick={() => onChange(stepPeriod(period, 1))}
            className={navButtonClass}
            aria-label="Next period"
          >
            <ChevronRightIcon className="h-5 w-5" />
          </button>
          {!isCustom && !isCurrentPeriod(period) && (
            <button
              onClick={() => onChange(currentPeriod(period))}
              className="bg-dark-700 text-dark-300 hover:bg-dark-600 rounded-lg px-3 py-2 text-sm transition-colors hover:text-white"
            >
              Today
            </button>
          )}
          <CalendarIcon className="text-dark-400 ml-2 h-5 w-5" />
          <span className="text-dark-100" aria-live="polite">
            {formatPeriod(period)}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          {children}
          <label className="sr-only" htmlFor="report-period">
            Period
          </label>
          <select
            id="report-period"
            value={selectValue}
            onChange={(e) => handleSelect(e.target.value)}
            className="border-dark-600 bg-dark-700 hover:border-dark-500 focus:border-thyme-500 focus:ring-thyme-500 text-dark-200 h-10 rounded-lg border px-3 text-sm focus:ring-1 focus:outline-none"
          >
            {/* Stepped away from every preset: name the kind of period instead */}
            {selectValue === '' && (
              <option value="" disabled>
                {UNIT_LABELS[period.unit]}
              </option>
            )}
            {PERIOD_PRESETS.map(({ id, label }) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
            <option value={CUSTOM}>Custom range…</option>
          </select>
        </div>
      </div>

      {isCustom && (
        <div className="border-dark-700 mt-4 flex flex-wrap items-end gap-4 border-t pt-4">
          <div className="min-w-[160px]">
            <label className="text-dark-400 mb-1 block text-xs font-medium">From</label>
            <DatePicker
              selectedDate={period.from}
              // A start after the end moves the end with it
              onDateSelect={(from) =>
                onChange(customPeriod(from, from > period.to ? from : period.to))
              }
            />
          </div>
          <div className="min-w-[160px]">
            <label className="text-dark-400 mb-1 block text-xs font-medium">To</label>
            <DatePicker
              selectedDate={period.to}
              onDateSelect={(to) => onChange(customPeriod(to < period.from ? to : period.from, to))}
            />
          </div>
        </div>
      )}
    </Card>
  );
}
