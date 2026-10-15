import type {
  BCTimeSheet,
  BCTimeSheetDetail,
  BCTimeSheetLine,
  TimesheetDisplayStatus,
} from '@/types';

/** Badge colours for each timesheet (and timesheet line) status */
export const TIMESHEET_STATUS_COLORS: Record<TimesheetDisplayStatus, string> = {
  Open: 'bg-blue-500/20 text-blue-400',
  'Partially Submitted': 'bg-yellow-500/20 text-yellow-400',
  Submitted: 'bg-purple-500/20 text-purple-400',
  Rejected: 'bg-amber-500/20 text-amber-400',
  Approved: 'bg-green-500/20 text-green-400',
  Mixed: 'bg-orange-500/20 text-orange-400',
};

/**
 * Derive a display-friendly status from timesheet FlowFields.
 *
 * BC tracks status at the line level, so a timesheet can have lines in
 * different states. This function derives a single display status based
 * on the FlowField flags.
 */
export function getTimesheetDisplayStatus(timesheet: BCTimeSheet): TimesheetDisplayStatus {
  const { openExists, submittedExists, rejectedExists, approvedExists } = timesheet;

  // All approved, nothing else
  if (approvedExists && !openExists && !submittedExists && !rejectedExists) {
    return 'Approved';
  }
  // Any rejected
  if (rejectedExists) {
    return 'Rejected';
  }
  // All submitted, nothing open
  if (submittedExists && !openExists) {
    return 'Submitted';
  }
  // Some submitted, some open
  if (submittedExists && openExists) {
    return 'Partially Submitted';
  }
  // Mix of approved and other states
  if (approvedExists && (openExists || submittedExists)) {
    return 'Mixed';
  }
  // Default to Open
  return 'Open';
}

/**
 * Hours split by the latest timesheet stage they've reached, each hour counted once:
 * Unsubmitted (Open) → Submitted → Approved (not yet posted) → Posted. Rejected hours
 * are in the total only, matching the project page's Time Spent card.
 */
export interface StageHours {
  posted: number;
  approved: number;
  submitted: number;
  unsubmitted: number;
  total: number;
}

export function emptyStageHours(): StageHours {
  return { posted: 0, approved: 0, submitted: 0, unsubmitted: 0, total: 0 };
}

export function addStageHours(a: StageHours, b: StageHours): StageHours {
  return {
    posted: a.posted + b.posted,
    approved: a.approved + b.approved,
    submitted: a.submitted + b.submitted,
    unsubmitted: a.unsubmitted + b.unsubmitted,
    total: a.total + b.total,
  };
}

/**
 * Sum a timesheet's project (Job) hours by stage. Status comes from the line, as on the
 * project page; posting needs approval first, so a day's posted quantity only counts on
 * an Approved line and never exceeds the hours logged that day.
 */
/**
 * A day's posted hours: what's been posted of an approved line's quantity (lines stay
 * Approved once posted). The one rule for posted time on every page, from the
 * timesheet itself rather than the Job Ledger.
 */
export function getPostedHours(
  line: Pick<BCTimeSheetLine, 'status'>,
  detail: Pick<BCTimeSheetDetail, 'quantity' | 'postedQuantity'>
): number {
  if (line.status !== 'Approved' || !(detail.quantity > 0)) return 0;
  return Math.min(Math.max(detail.postedQuantity ?? 0, 0), detail.quantity);
}

export function getStageHours(lines: BCTimeSheetLine[], details: BCTimeSheetDetail[]): StageHours {
  const linesByNo = new Map(lines.map((line) => [line.lineNo, line]));
  const stages = emptyStageHours();
  for (const detail of details) {
    if (!(detail.quantity > 0)) continue;
    const line = linesByNo.get(detail.timeSheetLineNo);
    if (!line || line.type !== 'Job') continue;

    stages.total += detail.quantity;
    switch (line.status) {
      case 'Approved': {
        const posted = getPostedHours(line, detail);
        stages.posted += posted;
        stages.approved += detail.quantity - posted;
        break;
      }
      case 'Submitted':
        stages.submitted += detail.quantity;
        break;
      case 'Open':
        stages.unsubmitted += detail.quantity;
        break;
    }
  }
  return stages;
}
