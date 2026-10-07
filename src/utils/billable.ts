/**
 * Billable time rules.
 *
 * Time is billable only when BOTH:
 * - its timesheet line isn't marked not chargeable in Business Central (`chargeable: false`), and
 * - its project isn't internal.
 *
 * A project is internal when it has no bill-to customer, or its bill-to customer's
 * name contains the word "Internal" (e.g. "Contoso - Internal"). BC defaults
 * `chargeable` to true on every timesheet line, including internal projects', so the
 * line flag alone can't be relied on - but an explicit `false` is always respected.
 */

import type { BCTimeSheetDetail, BCTimeSheetLine } from '@/types';

/** User-facing explanation of the rule, shown wherever billable figures appear */
export const BILLABLE_RULE_DESCRIPTION =
  "Excludes internal projects (no bill-to customer, or a customer named '…Internal…') and lines marked not chargeable in Business Central.";

/** The bill-to fields of a BC project needed to tell whether it's internal */
export interface ProjectBillTo {
  billToCustomerNo?: string;
  billToCustomerName?: string;
}

/** The part of a BC timesheet line needed to tell whether its time is billable */
export interface ChargeableLine {
  chargeable?: boolean;
}

// "Internal" as a whole word, so a customer like "International Ltd" isn't caught
const INTERNAL_CUSTOMER_NAME = /\binternal\b/i;

/**
 * Whether a project is internal (its time is never billable): it has no bill-to
 * customer, or the bill-to customer's name contains the word "Internal".
 */
export function isInternalProject(project: ProjectBillTo): boolean {
  if (!project.billToCustomerNo?.trim()) return true;
  return INTERNAL_CUSTOMER_NAME.test(project.billToCustomerName ?? '');
}

/**
 * Whether a timesheet line's time is billable: the line isn't marked not chargeable
 * and its project isn't internal.
 *
 * When the project isn't known (not loaded, or not visible to the user) only the
 * line's own flag can be judged, so the time counts as billable unless the line says
 * otherwise.
 */
export function isBillableEntry(
  line: ChargeableLine,
  project: ProjectBillTo | null | undefined
): boolean {
  if (line.chargeable === false) return false;
  if (!project) return true;
  return !isInternalProject(project);
}

/**
 * Billable project (Job) hours on a timesheet: the same lines and details as
 * getStageHours' total, keeping only the time isBillableEntry allows.
 */
export function getBillableHours(
  lines: BCTimeSheetLine[],
  details: BCTimeSheetDetail[],
  projectsByNumber: Map<string, ProjectBillTo>
): number {
  const linesByNo = new Map(lines.map((line) => [line.lineNo, line]));
  let hours = 0;
  for (const detail of details) {
    if (!(detail.quantity > 0)) continue;
    const line = linesByNo.get(detail.timeSheetLineNo);
    if (!line || line.type !== 'Job') continue;
    const project = line.jobNo ? projectsByNumber.get(line.jobNo) : undefined;
    if (isBillableEntry(line, project)) hours += detail.quantity;
  }
  return hours;
}
