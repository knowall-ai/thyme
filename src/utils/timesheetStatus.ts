import type { BCTimeSheet, TimesheetDisplayStatus } from '@/types';

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
