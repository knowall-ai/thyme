/**
 * Budget figures for the Projects list.
 *
 * Internal projects (see billable.ts) have no budget: their Plan is just planned
 * time, so there's no "remaining" to work out and nothing can be over budget.
 */

import type { Project } from '@/types';

type BudgetFigures = Pick<Project, 'isInternal' | 'budgetHours' | 'totalHours'>;

/** Hours left against the budget, or undefined when there's no budget to measure against */
export function getRemainingHours(project: BudgetFigures): number | undefined {
  if (project.isInternal) return undefined;
  const { budgetHours, totalHours } = project;
  if (budgetHours === undefined || totalHours === undefined) return undefined;
  return budgetHours - totalHours;
}

/**
 * Compare two projects by hours remaining. Internal projects sort last in either
 * direction (they have nothing remaining); other projects without a budget count
 * as 0 remaining, as before.
 */
export function compareByRemaining(a: BudgetFigures, b: BudgetFigures, dir: 1 | -1): number {
  if (a.isInternal !== b.isInternal) return a.isInternal ? 1 : -1;
  if (a.isInternal) return 0;
  const remA = (a.budgetHours ?? 0) - (a.totalHours ?? 0);
  const remB = (b.budgetHours ?? 0) - (b.totalHours ?? 0);
  return dir * (remA - remB);
}
