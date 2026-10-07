/**
 * Billable time rules.
 *
 * Time is billable only when BOTH:
 * - its timesheet line isn't marked not chargeable in Business Central (`chargeable: false`), and
 * - its project isn't internal.
 *
 * A project is internal when it has no bill-to customer, its bill-to customer's name
 * contains the word "Internal" (e.g. "Contoso - Internal"), or the bill-to customer is
 * the company itself (its name matches the company's name). BC defaults
 * `chargeable` to true on every timesheet line, including internal projects', so the
 * line flag alone can't be relied on - but an explicit `false` is always respected.
 */

import type { BCTimeSheetDetail, BCTimeSheetLine } from '@/types';

/** User-facing explanation of the rule, shown wherever billable figures appear */
export const BILLABLE_RULE_DESCRIPTION =
  "Excludes internal projects (no bill-to customer, a customer whose name has the word 'Internal', or a customer named after the company itself) and lines marked not chargeable in Business Central.";

/** The bill-to fields of a BC project needed to tell whether it's internal */
export interface ProjectBillTo {
  billToCustomerNo?: string;
  billToCustomerName?: string;
  /**
   * The bill-to customer is the company itself (its name matches the company's name).
   * Set by bcClient when it loads projects, as the company's names aren't on the project.
   */
  billToIsCompany?: boolean;
}

/** The part of a BC timesheet line needed to tell whether its time is billable */
export interface ChargeableLine {
  chargeable?: boolean;
}

// "Internal" as a whole word (anything but a letter either side, so "Contoso_Internal"
// counts), so a customer like "Contoso International" isn't treated as internal
const INTERNAL_CUSTOMER_NAME = /(^|[^a-z])internal([^a-z]|$)/i;

/**
 * A name reduced to its letters and digits: case, punctuation (e.g. a trailing ".")
 * and spacing ignored, so "CRONUS UK Ltd.", "cronus  uk ltd" and "CRONUS-UK Ltd" match.
 */
function comparableName(name: string): string {
  return name.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

/**
 * Whether a customer name is one of the company's own names (e.g. its display name
 * or its Company Information name): a customer named after the company is the
 * company billing itself, so its projects are internal.
 */
export function isCompanyName(
  customerName: string | undefined,
  companyNames: readonly (string | undefined)[]
): boolean {
  const customer = comparableName(customerName ?? '');
  if (!customer) return false;
  return companyNames.some((name) => !!name && comparableName(name) === customer);
}

/**
 * Whether a project is internal (its time is never billable): it has no bill-to
 * customer, the bill-to customer's name contains the word "Internal", or the bill-to
 * customer is the company itself - flagged by `billToIsCompany`, or its name matches
 * one of `companyNames` when given.
 */
export function isInternalProject(
  project: ProjectBillTo,
  companyNames: readonly (string | undefined)[] = []
): boolean {
  if (!project.billToCustomerNo?.trim()) return true;
  if (project.billToIsCompany) return true;
  if (isCompanyName(project.billToCustomerName, companyNames)) return true;
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

/**
 * Whether a project task is planned absence (holiday, sick leave...): its description
 * starts with "Absence" (e.g. "Absence - Holiday"). Absence is time off, not work
 * against a budget, so budget maths on non-internal projects leaves it out.
 */
export function isAbsenceTask(description: string | undefined): boolean {
  return /^\s*absence/i.test(description ?? '');
}

/** Task numbers (jobTaskNo) of a project's absence tasks */
export function getAbsenceTaskNos(
  tasks: { jobTaskNo: string; description?: string }[]
): Set<string> {
  return new Set(tasks.filter((t) => isAbsenceTask(t.description)).map((t) => t.jobTaskNo));
}

/**
 * Drop planning lines that sit on absence tasks, so they don't count towards a
 * budget. Internal projects keep them: they have no budget, and the plan is
 * shown as plain planned time.
 */
export function withoutAbsenceLines<T extends { jobTaskNo: string }>(
  lines: T[],
  absenceTaskNos: Set<string>,
  isInternal: boolean
): T[] {
  if (isInternal || absenceTaskNos.size === 0) return lines;
  return lines.filter((line) => !absenceTaskNos.has(line.jobTaskNo));
}
