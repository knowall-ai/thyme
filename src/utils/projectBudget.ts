/**
 * Budget figures shared by the Projects list and the project page.
 *
 * A project is tracked against its Estimate: the quoted time on Billable Resource lines
 * (see sumEstimateHours). Internal projects (see billable.ts) have no budget: their Plan
 * is just planned time, so there's no "remaining" to work out and nothing can be over
 * budget.
 */

import type { BCJobPlanningLine, Project } from '@/types';
import { isBillablePlanningLine } from './unitConversion';

type BudgetFigures = Pick<Project, 'isInternal' | 'estimateHours' | 'totalHours'>;

/**
 * Time spent as a whole-number percentage of the estimate, as the project page's Time
 * Spent card shows it, or undefined when there's no estimate to measure against
 */
export function getPercentOfEstimate(
  spentHours: number,
  estimateHours: number
): number | undefined {
  return estimateHours > 0 ? Math.round((spentHours / estimateHours) * 100) : undefined;
}

/** Hours left against the estimate, or undefined when there's no budget to measure against */
export function getRemainingHours(project: BudgetFigures): number | undefined {
  if (project.isInternal) return undefined;
  const { estimateHours, totalHours } = project;
  if (estimateHours === undefined || totalHours === undefined) return undefined;
  return estimateHours - totalHours;
}

/**
 * Compare two projects by hours remaining. Internal projects sort last in either
 * direction (they have nothing remaining); other projects without an estimate count
 * as 0 remaining, as before.
 */
export function compareByRemaining(a: BudgetFigures, b: BudgetFigures, dir: 1 | -1): number {
  if (a.isInternal !== b.isInternal) return a.isInternal ? 1 : -1;
  if (a.isInternal) return 0;
  const remA = (a.estimateHours ?? 0) - (a.totalHours ?? 0);
  const remB = (b.estimateHours ?? 0) - (b.totalHours ?? 0);
  return dir * (remA - remB);
}

// Billing mode derived from Job Planning Line configuration
export type BillingMode = 'T&M' | 'Fixed Price' | 'Mixed' | 'Not Set';

/**
 * A project's billing mode, from the price on its Billable planning lines by type:
 * T&M is Resource lines only (hourly billing), Fixed Price is Item or G/L Account lines
 * only (deliverable billing), Mixed is more than one type, Not Set is no Billable lines.
 */
export function getBillingModeFromLines(planningLines: BCJobPlanningLine[]): BillingMode {
  const priceByType = { resource: 0, item: 0, glAccount: 0 };
  for (const line of planningLines) {
    if (!isBillablePlanningLine(line.lineType)) continue;
    if (line.type === 'Resource') priceByType.resource += line.totalPrice;
    else if (line.type === 'Item') priceByType.item += line.totalPrice;
    else if (line.type === 'G/L Account') priceByType.glAccount += line.totalPrice;
  }
  const hasResource = priceByType.resource > 0;
  const typeCount = [hasResource, priceByType.item > 0, priceByType.glAccount > 0].filter(
    Boolean
  ).length;
  return typeCount === 0
    ? 'Not Set'
    : typeCount > 1
      ? 'Mixed'
      : hasResource
        ? 'T&M'
        : 'Fixed Price';
}
