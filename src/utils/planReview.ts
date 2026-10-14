import { addDays, format, parseISO } from 'date-fns';
import type {
  BCJobPlanningLine,
  BCPlanReview,
  BCPlanReviewChange,
  BCPlanReviewLine,
  BCPlanReviewRequest,
  PlanReviewCheck,
  PlanReviewSubjectType,
  TimesheetReviewSeverity,
  TimesheetReviewVerdict,
} from '@/types';
import {
  convertFromHours,
  convertToHours,
  roundToQuarterHour,
  type UOMConversionMap,
} from './unitConversion';
import type { VerdictDisplay } from './timesheetReview';

// ============================================
// Labels
// ============================================

/** The hash a review header carries while Poppie is still writing it (never a real review) */
export const PLAN_REVIEW_PENDING_HASH = 'PENDING';

/** SHA-256 of the empty string: the plan hash of a week with no planning lines */
export const EMPTY_PLAN_HASH = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

const PLAN_VERDICT_DISPLAY: Record<TimesheetReviewVerdict, VerdictDisplay> = {
  Approve: { label: 'Looks good', tone: 'green' },
  Check: { label: 'Worth a check', tone: 'amber' },
  Query: { label: 'Needs changes', tone: 'red' },
};

/**
 * Label and colour for a plan review's verdict. An unrecognised verdict reads as
 * "Worth a check" rather than a false all-clear.
 */
export function getPlanVerdictDisplay(verdict: string): VerdictDisplay {
  return PLAN_VERDICT_DISPLAY[verdict as TimesheetReviewVerdict] ?? PLAN_VERDICT_DISPLAY.Check;
}

const CHECK_LABELS: Record<PlanReviewCheck, string> = {
  ROUNDING: 'Rounding',
  OVER_CAPACITY: 'Over capacity',
  BILLABLE_TARGET: 'Billable target',
  CALENDAR: 'Calendar',
  BUDGET_BURN: 'Budget burn',
  PLAN_SHAPE: 'Plan shape',
  OUTSIDE_PROJECT_DATES: 'Outside project dates',
  OTHER: 'Other',
};

/** A finding's check as words, e.g. OVER_CAPACITY → "Over capacity" */
export function getPlanReviewCheckLabel(check: string): string {
  return CHECK_LABELS[check as PlanReviewCheck] ?? CHECK_LABELS.OTHER;
}

const VERDICT_RANK: Record<TimesheetReviewVerdict, number> = { Query: 0, Check: 1, Approve: 2 };
const SEVERITY_RANK: Record<TimesheetReviewSeverity, number> = { Issue: 0, Warning: 1, Info: 2 };

// Unknown verdicts rank as Check, unknown severities as Info (as their displays do)
const verdictRank = (verdict: string) =>
  VERDICT_RANK[verdict as TimesheetReviewVerdict] ?? VERDICT_RANK.Check;
const severityRank = (severity: string) =>
  SEVERITY_RANK[severity as TimesheetReviewSeverity] ?? SEVERITY_RANK.Info;

// ============================================
// Plan hash (must match the plan-review skill byte for byte)
// ============================================

/** One planning line as the plan hash sees it */
export interface PlanHashEntry {
  jobNo: string;
  jobTaskNo: string;
  resourceNo: string;
  planningDate: string; // YYYY-MM-DD (longer values are cut to 10 characters)
  /** Hours from convertToHours, before any quarter-hour rounding */
  hours: number;
}

/** Hours as the hash writes them: always two decimals, e.g. 7.1666667 → "7.17", 0.5 → "0.50" */
export function formatPlanHashHours(hours: number): string {
  return (Math.round(hours * 100) / 100).toFixed(2);
}

/** `jobNo|jobTaskNo|resourceNo|planningDate|hours` */
export function planHashLine(entry: PlanHashEntry): string {
  return [
    entry.jobNo ?? '',
    entry.jobTaskNo ?? '',
    entry.resourceNo ?? '',
    (entry.planningDate ?? '').slice(0, 10),
    formatPlanHashHours(entry.hours),
  ].join('|');
}

/**
 * The canonical plan text: one line per planning line (duplicates kept), sorted in plain
 * UTF-16 code-unit order, joined with "\n" and no trailing newline.
 */
export function canonicalPlanText(entries: PlanHashEntry[]): string {
  return entries.map(planHashLine).sort().join('\n');
}

/** Lowercase hex SHA-256 of text as UTF-8 (Web Crypto) */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** A subject-week's planHash, the version stamp Poppie puts on her review */
export function computePlanHash(entries: PlanHashEntry[]): Promise<string> {
  return sha256Hex(canonicalPlanText(entries));
}

/**
 * Hash entries from raw BC planning lines: only Resource lines with a quantity above 0 count
 * (the lines the Plan grid shows), their quantity converted to hours from the resource's unit.
 */
export function planHashEntriesFromLines(
  lines: Pick<
    BCJobPlanningLine,
    'jobNo' | 'jobTaskNo' | 'number' | 'planningDate' | 'type' | 'quantity'
  >[],
  uomConversionMap: UOMConversionMap
): PlanHashEntry[] {
  return lines
    .filter((line) => line.type === 'Resource' && line.quantity > 0)
    .map((line) => ({
      jobNo: line.jobNo,
      jobTaskNo: line.jobTaskNo,
      resourceNo: line.number,
      planningDate: line.planningDate,
      hours: convertToHours(line.number, line.quantity, uomConversionMap),
    }));
}

/** The Plan store's allocation fields the hash needs */
export interface PlanHashAllocation {
  projectNumber: string;
  taskNumber?: string;
  resourceNumber: string;
  startDate: string;
  /** Hours before quarter-hour rounding (the grid shows rounded hours) */
  rawHours: number;
}

/** The last day (Sunday) of the week starting on weekStart, YYYY-MM-DD */
export function planWeekEnd(weekStart: string): string {
  return format(addDays(parseISO(weekStart), 6), 'yyyy-MM-dd');
}

/**
 * The hash entries for one subject-week from the Plan store's allocations (one per planning
 * line): a person's lines on every project, or every person's lines on a project.
 */
export function planHashEntriesForSubjectWeek(
  allocations: PlanHashAllocation[],
  subjectType: PlanReviewSubjectType,
  subjectNo: string,
  weekStart: string
): PlanHashEntry[] {
  const weekEnd = planWeekEnd(weekStart);
  return allocations
    .filter((a) => {
      const date = a.startDate.slice(0, 10);
      const isSubject =
        subjectType === 'Resource' ? a.resourceNumber === subjectNo : a.projectNumber === subjectNo;
      return isSubject && date >= weekStart && date <= weekEnd;
    })
    .map((a) => ({
      jobNo: a.projectNumber,
      jobTaskNo: a.taskNumber ?? '',
      resourceNo: a.resourceNumber,
      planningDate: a.startDate,
      hours: a.rawHours,
    }));
}

// ============================================
// Records off the wire
// ============================================

/** A BC date as YYYY-MM-DD, '' for blanks and BC's 0001-01-01 "no date" */
function bcDate(value: string | undefined | null): string {
  const date = (value ?? '').slice(0, 10);
  return !date || date.startsWith('0001-') ? '' : date;
}

const toNumber = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

/** A plan hash in lowercase hex, or PENDING for a header still being written */
function normalizePlanHash(value: string | undefined): string {
  const hash = (value ?? '').trim();
  return hash.toUpperCase() === PLAN_REVIEW_PENDING_HASH
    ? PLAN_REVIEW_PENDING_HASH
    : hash.toLowerCase();
}

export function normalizePlanReview(raw: Partial<BCPlanReview> & { id: string }): BCPlanReview {
  return {
    id: raw.id,
    entryNo: toNumber(raw.entryNo),
    subjectType: raw.subjectType === 'Project' ? 'Project' : 'Resource',
    subjectNo: raw.subjectNo ?? '',
    weekStart: bcDate(raw.weekStart),
    planHash: normalizePlanHash(raw.planHash),
    verdict: (raw.verdict ?? 'Check') as TimesheetReviewVerdict,
    summary: raw.summary ?? '',
    reviewer: raw.reviewer ?? '',
    reviewedAt: raw.reviewedAt ?? '',
  };
}

export function normalizePlanReviewLine(raw: Partial<BCPlanReviewLine>): BCPlanReviewLine {
  return {
    reviewEntryNo: toNumber(raw.reviewEntryNo),
    lineNo: toNumber(raw.lineNo),
    severity: (raw.severity ?? 'Info') as TimesheetReviewSeverity,
    check: raw.check || 'OTHER',
    planningDate: bcDate(raw.planningDate),
    jobNo: raw.jobNo ?? '',
    resourceNo: raw.resourceNo ?? '',
    note: raw.note ?? '',
  };
}

export function normalizePlanReviewChange(raw: Partial<BCPlanReviewChange>): BCPlanReviewChange {
  return {
    reviewEntryNo: toNumber(raw.reviewEntryNo),
    reviewLineNo: toNumber(raw.reviewLineNo),
    changeNo: toNumber(raw.changeNo),
    jobNo: raw.jobNo ?? '',
    jobTaskNo: raw.jobTaskNo ?? '',
    resourceNo: raw.resourceNo ?? '',
    planningDate: bcDate(raw.planningDate),
    currentHours: toNumber(raw.currentHours),
    proposedHours: toNumber(raw.proposedHours),
  };
}

export function normalizePlanReviewRequest(
  raw: Partial<BCPlanReviewRequest> & { id: string }
): BCPlanReviewRequest {
  return {
    id: raw.id,
    entryNo: toNumber(raw.entryNo),
    subjectType: raw.subjectType === 'Project' ? 'Project' : 'Resource',
    subjectNo: raw.subjectNo ?? '',
    weekStart: bcDate(raw.weekStart),
    status: raw.status ?? 'Requested',
    progress: raw.progress ?? '',
    errorMessage: raw.errorMessage ?? '',
    requestedBy: raw.requestedBy,
    requestedAt: raw.requestedAt,
    startedAt: raw.startedAt,
    finishedAt: raw.finishedAt,
  };
}

// ============================================
// Reviews and their status
// ============================================

/** Identifies a subject-week, e.g. "Resource|R0010|2026-10-19" */
export function planReviewKey(
  subjectType: PlanReviewSubjectType,
  subjectNo: string,
  weekStart: string
): string {
  return `${subjectType}|${subjectNo}|${weekStart}`;
}

// Epoch ms for a BC timestamp, 0 for blanks and BC's 0001-01-01 placeholder
function toTime(value: string | undefined): number {
  const time = value ? Date.parse(value) : NaN;
  return Number.isNaN(time) || new Date(time).getUTCFullYear() <= 1 ? 0 : time;
}

/**
 * The newest review per subject-week (planReviewKey). Headers still being written (plan hash
 * PENDING) are never reviews. Same instant: the later entry was written last.
 */
export function pickLatestPlanReviews(reviews: BCPlanReview[]): Record<string, BCPlanReview> {
  const latest: Record<string, BCPlanReview> = {};
  for (const review of reviews) {
    if (!review.planHash || review.planHash === PLAN_REVIEW_PENDING_HASH) continue;
    const key = planReviewKey(review.subjectType, review.subjectNo, review.weekStart);
    const current = latest[key];
    const time = toTime(review.reviewedAt);
    const currentTime = current ? toTime(current.reviewedAt) : -1;
    if (
      !current ||
      time > currentTime ||
      (time === currentTime && review.entryNo > current.entryNo)
    ) {
      latest[key] = review;
    }
  }
  return latest;
}

/** Requested or Running: Poppie hasn't finished it yet */
export function isOpenPlanReviewRequest(request: Pick<BCPlanReviewRequest, 'status'>): boolean {
  return request.status === 'Requested' || request.status === 'Running';
}

/**
 * Where a subject-week's review stands:
 * - awaiting: someone asked Poppie to (re-)review it and she hasn't finished
 * - none: never reviewed
 * - outOfDate: the plan changed after the review (its hash differs)
 * - current: the review describes the plan as it is now (or the hash isn't known yet)
 */
export type PlanReviewStatus = 'none' | 'current' | 'outOfDate' | 'awaiting';

export function getPlanReviewStatus({
  review,
  currentHash,
  request,
}: {
  review: Pick<BCPlanReview, 'planHash'> | null | undefined;
  /** The plan's hash now; undefined while it's being worked out */
  currentHash: string | undefined;
  request?: Pick<BCPlanReviewRequest, 'status'> | null;
}): PlanReviewStatus {
  if (request && isOpenPlanReviewRequest(request)) return 'awaiting';
  if (!review) return 'none';
  if (currentHash === undefined) return 'current';
  return review.planHash === currentHash ? 'current' : 'outOfDate';
}

/** One subject (a person or a project) in one week, as the week's popover lists it */
export interface PlanReviewSubjectWeek {
  subjectType: PlanReviewSubjectType;
  subjectNo: string;
  name: string;
  weekStart: string;
  review: BCPlanReview | null;
  status: PlanReviewStatus;
  /** The latest request we know of: an open one, or one that failed */
  request: BCPlanReviewRequest | null;
  /** Whether the subject has planning lines that week */
  hasPlan: boolean;
}

export interface PlanReviewWeekSummary {
  /** The most serious verdict among the week's reviews, or null when nothing is reviewed */
  worstVerdict: TimesheetReviewVerdict | null;
  /** How many reviews have the worst verdict */
  worstCount: number;
  counts: Record<TimesheetReviewVerdict, number>;
  reviewed: number;
  outOfDate: number;
  /** Subjects with an open request; Running if any request is being worked on */
  awaiting: number;
  requestStatus: 'Requested' | 'Running' | null;
}

/** A week's reviews across the subjects in view: worst verdict, counts and staleness */
export function summarizePlanReviewWeek(subjects: PlanReviewSubjectWeek[]): PlanReviewWeekSummary {
  const counts: Record<TimesheetReviewVerdict, number> = { Approve: 0, Check: 0, Query: 0 };
  let worstVerdict: TimesheetReviewVerdict | null = null;
  let outOfDate = 0;
  let awaiting = 0;
  let requestStatus: PlanReviewWeekSummary['requestStatus'] = null;

  for (const subject of subjects) {
    if (subject.request && isOpenPlanReviewRequest(subject.request)) {
      awaiting += 1;
      if (subject.request.status === 'Running' || requestStatus === null) {
        requestStatus = subject.request.status as 'Requested' | 'Running';
      }
    }
    const review = subject.review;
    if (!review) continue;
    const verdict = (
      review.verdict in VERDICT_RANK ? review.verdict : 'Check'
    ) as TimesheetReviewVerdict;
    counts[verdict] += 1;
    if (worstVerdict === null || verdictRank(verdict) < verdictRank(worstVerdict)) {
      worstVerdict = verdict;
    }
    if (subject.status === 'outOfDate') outOfDate += 1;
  }

  return {
    worstVerdict,
    worstCount: worstVerdict ? counts[worstVerdict] : 0,
    counts,
    reviewed: counts.Approve + counts.Check + counts.Query,
    outOfDate,
    awaiting,
    requestStatus,
  };
}

/**
 * The week chip's words: the verdict for one review of that kind, else a count, e.g.
 * "Looks good", "Worth a check", "2 to check", "Needs changes", "3 need changes".
 * Null when nothing that week is reviewed.
 */
export function formatPlanReviewWeekLabel(summary: PlanReviewWeekSummary): string | null {
  const { worstVerdict, worstCount } = summary;
  if (!worstVerdict) return null;
  if (worstVerdict === 'Approve' || worstCount <= 1) {
    return getPlanVerdictDisplay(worstVerdict).label;
  }
  return worstVerdict === 'Query' ? `${worstCount} need changes` : `${worstCount} to check`;
}

/** A request's state in a few words: "Queued…", or Poppie's progress while she works */
export function planReviewRequestText(
  request: Pick<BCPlanReviewRequest, 'status' | 'progress'>
): string {
  if (request.status === 'Running') return request.progress || 'Reviewing…';
  return 'Queued…';
}

// ============================================
// Findings
// ============================================

/** Findings most severe first, then in Poppie's order */
export function sortPlanReviewLines(lines: BCPlanReviewLine[]): BCPlanReviewLine[] {
  return [...lines].sort(
    (a, b) => severityRank(a.severity) - severityRank(b.severity) || a.lineNo - b.lineNo
  );
}

/** The most severe severity among some findings, or null for none */
export function worstPlanReviewSeverity(
  lines: Pick<BCPlanReviewLine, 'severity'>[]
): TimesheetReviewSeverity | null {
  let worst: TimesheetReviewSeverity | null = null;
  for (const line of lines) {
    const severity = (
      line.severity in SEVERITY_RANK ? line.severity : 'Info'
    ) as TimesheetReviewSeverity;
    if (worst === null || severityRank(severity) < severityRank(worst)) worst = severity;
  }
  return worst;
}

/** A finding's changes, in change order */
export function changesForLine(
  changes: BCPlanReviewChange[],
  line: Pick<BCPlanReviewLine, 'reviewEntryNo' | 'lineNo'>
): BCPlanReviewChange[] {
  return changes
    .filter((c) => c.reviewEntryNo === line.reviewEntryNo && c.reviewLineNo === line.lineNo)
    .sort((a, b) => a.changeNo - b.changeNo);
}

// ============================================
// Applying a finding's changes
// ============================================

/** Whether two hour values are the same to two decimals (how Poppie records them) */
export function sameHours(a: number, b: number): boolean {
  return Math.round(a * 100) === Math.round(b * 100);
}

/** What applying needs from BC (bcClient in the app; a fake in tests) */
export interface PlanCellWriter {
  /** The cell's planning lines as BC has them now. Throws if they can't be read. */
  getCellLines(cell: {
    jobNo: string;
    jobTaskNo: string;
    resourceNo: string;
    planningDate: string;
  }): Promise<BCJobPlanningLine[]>;
  createLine(params: {
    jobNo: string;
    jobTaskNo: string;
    resourceNo: string;
    planningDate: string;
    quantity: number;
  }): Promise<unknown>;
  updateLine(id: string, quantity: number, etag?: string): Promise<unknown>;
  deleteLine(id: string, etag?: string): Promise<unknown>;
}

export type ApplyPlanChangesResult =
  | { status: 'applied'; written: number }
  /** A cell no longer holds what Poppie saw: nothing was written */
  | { status: 'stale'; change: BCPlanReviewChange; actualHours: number };

const cellLinesOf = (lines: BCJobPlanningLine[]) => lines.filter((l) => l.type === 'Resource');

/**
 * Apply a finding's changes to the plan, all or nothing up front: every cell is read fresh
 * from BC first, and if any no longer holds the hours Poppie saw (currentHours), nothing is
 * written. Then each cell is set to its proposed hours (quarter hours, in the resource's base
 * unit): the first line is updated and any others removed, a new line is added to an empty
 * cell, and 0 removes the cell's lines.
 */
export async function applyPlanReviewChanges(
  changes: BCPlanReviewChange[],
  uomConversionMap: UOMConversionMap,
  writer: PlanCellWriter
): Promise<ApplyPlanChangesResult> {
  for (const change of changes) {
    if (!Number.isFinite(change.proposedHours) || change.proposedHours < 0) {
      throw new Error('Poppie proposed hours that cannot be planned.');
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(change.planningDate)) {
      throw new Error('Poppie proposed a change without a valid date.');
    }
  }

  const cells = await Promise.all(
    changes.map(async (change) => {
      const lines = cellLinesOf(
        await writer.getCellLines({
          jobNo: change.jobNo,
          jobTaskNo: change.jobTaskNo,
          resourceNo: change.resourceNo,
          planningDate: change.planningDate,
        })
      );
      const hours = lines.reduce(
        (sum, line) => sum + convertToHours(change.resourceNo, line.quantity, uomConversionMap),
        0
      );
      return { change, lines, hours };
    })
  );

  const stale = cells.find(({ change, hours }) => !sameHours(hours, change.currentHours));
  if (stale) return { status: 'stale', change: stale.change, actualHours: stale.hours };

  let written = 0;
  for (const { change, lines, hours } of cells) {
    const proposed = roundToQuarterHour(change.proposedHours);
    if (sameHours(hours, proposed) && lines.length <= 1) continue;

    if (proposed <= 0) {
      for (const line of lines) {
        await writer.deleteLine(line.id, line['@odata.etag']);
        written += 1;
      }
      continue;
    }

    const quantity = convertFromHours(change.resourceNo, proposed, uomConversionMap);
    const [first, ...extras] = lines;
    // Remove duplicates first, so the cell never briefly holds more than proposed
    for (const extra of extras) {
      await writer.deleteLine(extra.id, extra['@odata.etag']);
      written += 1;
    }
    if (first) {
      await writer.updateLine(first.id, quantity, first['@odata.etag']);
    } else {
      await writer.createLine({
        jobNo: change.jobNo,
        jobTaskNo: change.jobTaskNo,
        resourceNo: change.resourceNo,
        planningDate: change.planningDate,
        quantity,
      });
    }
    written += 1;
  }
  return { status: 'applied', written };
}
