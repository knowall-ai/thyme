/**
 * Billable targets.
 *
 * Each person's effective billable target is their own (set on their BC resource) or,
 * if they don't have one, the company default (Thyme Setup in BC). Older Thyme BC
 * Extension versions don't have targets at all; then nothing here is shown.
 */

import { teamConfig } from '@/config';
import type { BillableTargetBands } from '@/config';
import type { BCResource } from '@/types';

/** A person's effective billable target and where it came from */
export interface BillableTarget {
  percent: number;
  /** true when it's the company default rather than the person's own target */
  isDefault: boolean;
}

/** on = at/above target or close to it; near = a little short; off = well short; none = no hours */
export type BillableTargetBand = 'on' | 'near' | 'off' | 'none';

/** Tailwind classes for each band, for pills showing "actual / target" */
export const BILLABLE_TARGET_BAND_COLORS: Record<BillableTargetBand, string> = {
  on: 'bg-green-500/20 text-green-400',
  near: 'bg-yellow-500/20 text-yellow-400',
  off: 'bg-red-500/20 text-red-400',
  none: 'bg-dark-700 text-dark-300',
};

/** Screen-reader / tooltip wording for each band */
export const BILLABLE_TARGET_BAND_LABELS: Record<BillableTargetBand, string> = {
  on: 'on target',
  near: 'just below target',
  off: 'well below target',
  none: 'no hours logged',
};

const isValidPercent = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100;

/**
 * Whether the installed Thyme BC Extension exposes billable targets on resources.
 * Older versions don't return the fields at all.
 */
export function hasBillableTargetFields(resources: Pick<BCResource, 'billableTargetSet'>[]) {
  return resources.some((resource) => typeof resource.billableTargetSet === 'boolean');
}

/**
 * A person's effective billable target: their own when set (and valid), otherwise
 * the company default.
 */
export function resolveBillableTarget(
  resource: Pick<BCResource, 'billableTargetPercent' | 'billableTargetSet'>,
  companyDefaultPercent: number
): BillableTarget {
  if (resource.billableTargetSet && isValidPercent(resource.billableTargetPercent)) {
    return { percent: resource.billableTargetPercent, isDefault: false };
  }
  return { percent: companyDefaultPercent, isDefault: true };
}

/** The company default from Thyme Setup, or the config fallback when BC has none */
export function resolveCompanyDefault(defaultPercent: number | null | undefined): number {
  return isValidPercent(defaultPercent)
    ? defaultPercent
    : teamConfig.billableTarget.fallbackDefaultPercent;
}

/**
 * Colour band for a billable % against its target. Being over target is always
 * fine (billable can exceed it); only a shortfall counts against someone.
 */
export function getBillableTargetBand(
  actualPercent: number,
  targetPercent: number,
  hasHours = true,
  bands: BillableTargetBands = teamConfig.billableTarget.bands
): BillableTargetBand {
  if (!hasHours) return 'none';
  const shortfall = targetPercent - actualPercent;
  if (shortfall <= bands.onTarget) return 'on';
  if (shortfall <= bands.nearTarget) return 'near';
  return 'off';
}

/**
 * The team's billable target: everyone's effective target weighted by their capacity,
 * so someone working half the hours counts half as much. Null when there's no
 * capacity to weight by.
 */
export function getWeightedBillableTarget(
  members: { capacity: number; targetPercent: number }[]
): number | null {
  let weightedSum = 0;
  let totalCapacity = 0;
  for (const { capacity, targetPercent } of members) {
    if (!(capacity > 0) || !isValidPercent(targetPercent)) continue;
    weightedSum += capacity * targetPercent;
    totalCapacity += capacity;
  }
  return totalCapacity > 0 ? weightedSum / totalCapacity : null;
}

/** Points above (+) or below (-) target, e.g. for sorting by gap */
export function getBillableTargetGap(actualPercent: number, targetPercent: number): number {
  return actualPercent - targetPercent;
}

/** e.g. "+3 pts", "-8 pts", "0 pts" */
export function formatTargetGap(gap: number): string {
  const rounded = Math.round(gap);
  return `${rounded > 0 ? '+' : ''}${rounded} pts`;
}

/**
 * Parse a target typed into an input: a number from 0 to 100 (decimals allowed,
 * rounded to 2dp), or null when it isn't one.
 */
export function parseTargetPercent(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const value = Number(trimmed);
  if (!isValidPercent(value)) return null;
  return Math.round(value * 100) / 100;
}

/** A friendly message for a failed target save; BC decides who may change targets */
export function describeTargetSaveError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('(403)')) {
    return "You don't have permission in Business Central to change billable targets. Ask an administrator.";
  }
  if (message.includes('(412)')) {
    return 'Someone else changed this target in the meantime. Refresh and try again.';
  }
  if (message.includes('(404)')) {
    return 'Billable targets need a newer version of the Thyme BC Extension.';
  }
  return 'Failed to save the billable target. Please try again.';
}
