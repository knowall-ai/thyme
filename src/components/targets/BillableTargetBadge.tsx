'use client';

import {
  cn,
  formatTargetGap,
  getBillableTargetGap,
  BILLABLE_TARGET_BAND_COLORS,
  BILLABLE_TARGET_BAND_LABELS,
  getBillableTargetBand,
} from '@/utils';
import type { BillableTarget } from '@/utils';

export interface BillableTargetBadgeProps {
  /** Billable % achieved */
  actualPercent: number;
  /** The person's (or team's) effective target */
  target: BillableTarget;
  /** false when no hours were logged, so the % means nothing yet */
  hasHours: boolean;
  className?: string;
}

/**
 * Billable % next to its target, e.g. "72% / 80% target", coloured by how close the
 * actual is. A company-default target reads "75% default" in muted text.
 */
export function BillableTargetBadge({
  actualPercent,
  target,
  hasHours,
  className,
}: BillableTargetBadgeProps) {
  const band = getBillableTargetBand(actualPercent, target.percent, hasHours);
  const actual = hasHours ? `${actualPercent.toFixed(0)}%` : '–';
  const targetText = `${target.percent.toFixed(0)}%`;
  const source = target.isDefault ? 'company default target' : 'target';
  const summary = hasHours
    ? `Billable ${actual} against a ${source} of ${targetText} (${formatTargetGap(
        getBillableTargetGap(actualPercent, target.percent)
      )}) - ${BILLABLE_TARGET_BAND_LABELS[band]}`
    : `No billable hours yet; ${source} ${targetText}`;

  return (
    <span
      className={cn(
        'inline-flex items-baseline gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        BILLABLE_TARGET_BAND_COLORS[band],
        className
      )}
      title={summary}
      aria-label={summary}
    >
      <span>{actual}</span>
      <span aria-hidden="true">/</span>
      <span className={cn(target.isDefault && 'text-dark-400 font-normal')}>
        {targetText} {target.isDefault ? 'default' : 'target'}
      </span>
    </span>
  );
}
