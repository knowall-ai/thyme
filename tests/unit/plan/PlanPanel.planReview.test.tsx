import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { addDays, format, startOfWeek } from 'date-fns';
import { computePlanHash } from '@/utils';
import { bcClient } from '@/services/bc';

// Monday this week, so it's inside the grid's visible range
const monday = startOfWeek(new Date(), { weekStartsOn: 1 });
const thisWeek = format(monday, 'yyyy-MM-dd');
const wednesday = format(addDays(monday, 2), 'yyyy-MM-dd');

// Sam has 7.1666667h on Wednesday: shown as 7.25h, hashed as 7.17
const planningLine = {
  id: 'PR001-1',
  jobNo: 'PR001',
  jobTaskNo: '100',
  lineNo: 1,
  planningDate: wednesday,
  lineType: 'Budget',
  type: 'Resource',
  number: 'RES02',
  description: '',
  quantity: 7.1666667,
  unitCost: 0,
  unitPrice: 0,
  totalCost: 0,
  totalPrice: 0,
  lastModifiedDateTime: '',
};

let reviewedHash = '';
let canEdit = false;
const applyPlanReviewFinding = vi.fn();

vi.mock('@/services/bc', () => ({
  ExtensionNotInstalledError: class ExtensionNotInstalledError extends Error {},
  bcClient: {
    getResources: vi.fn(async () => [
      { id: 'r1', number: 'RES01', name: 'Alex Contoso', canEditPlan: canEdit },
      { id: 'r2', number: 'RES02', name: 'Sam Contoso', canEditPlan: canEdit },
    ]),
    getProjects: vi.fn(async () => [
      { id: 'p1', number: 'PR001', displayName: 'Contoso Website', billToCustomerName: 'Contoso' },
    ]),
    getJobTasks: vi.fn(async (jobNo: string) => [
      { jobNo, jobTaskNo: '100', description: 'Build', jobTaskType: 'Posting' },
    ]),
    getJobPlanningLines: vi.fn(async () => [planningLine]),
    getResourceUnitsOfMeasure: vi.fn(async () => []),
    getTimeSheets: vi.fn(async () => []),
    getDayNotes: vi.fn(async () => undefined),
    getPlanReviews: vi.fn(async (_type: string, subjectNos: string[]) =>
      subjectNos.includes('RES02')
        ? [
            {
              id: 'rev1',
              entryNo: 1,
              subjectType: 'Resource',
              subjectNo: 'RES02',
              weekStart: thisWeek,
              planHash: reviewedHash,
              verdict: 'Check',
              summary: 'Wednesday has an odd 7.17h.',
              reviewer: 'Poppie',
              reviewedAt: '2026-10-15T10:00:00Z',
            },
          ]
        : []
    ),
    getPlanReviewLines: vi.fn(async () => [
      {
        id: '00000000-0000-0000-0000-00000000f001',
        appliedAt: '',
        appliedBy: '',
        reviewEntryNo: 1,
        lineNo: 10000,
        severity: 'Warning',
        check: 'ROUNDING',
        planningDate: wednesday,
        jobNo: 'PR001',
        resourceNo: 'RES02',
        note: "7.17h isn't a quarter hour.",
      },
    ]),
    getPlanReviewChanges: vi.fn(async () => [
      {
        reviewEntryNo: 1,
        reviewLineNo: 10000,
        changeNo: 10000,
        jobNo: 'PR001',
        jobTaskNo: '100',
        resourceNo: 'RES02',
        planningDate: wednesday,
        currentHours: 7.17,
        proposedHours: 7.25,
      },
    ]),
    applyPlanReviewFinding: (...args: unknown[]) => applyPlanReviewFinding(...args),
    getPlanReviewRequests: vi.fn(async () => []),
  },
}));

vi.mock('@/services/auth', () => ({
  useAuth: () => ({ account: { username: 'someone@contoso.com' } }),
  getUserProfilePhoto: vi.fn(async () => null),
  resolveResourceIdentity: vi.fn(async () => ({ photoUrl: null })),
}));
vi.mock('@/services/auth/reviewerIdentity', () => ({ useReviewerPhoto: () => null }));

import { PlanPanel } from '@/components/plan';
import { usePlanStore } from '@/hooks/usePlanStore';
import { useDayNotesStore } from '@/hooks/useDayNotesStore';
import { usePlanReviewStore } from '@/hooks/usePlanReviewStore';

const samsWeekHash = () =>
  computePlanHash([
    {
      jobNo: 'PR001',
      jobTaskNo: '100',
      resourceNo: 'RES02',
      planningDate: wednesday,
      hours: 7.1666667,
    },
  ]);

describe('PlanPanel plan reviews', () => {
  beforeEach(() => {
    canEdit = false;
    applyPlanReviewFinding.mockReset();
    usePlanStore.setState({ cache: null, viewMode: 'team', projects: [], teamMembers: [] });
    useDayNotesStore.getState().reset();
    usePlanReviewStore.getState().reset();
  });

  it("shows Poppie's verdict on the week and a dot on the day with a finding", async () => {
    reviewedHash = await samsWeekHash();
    render(<PlanPanel />);

    const chip = await screen.findByTestId('plan-review-week-chip');
    expect(chip).toHaveTextContent('Worth a check');
    expect(chip).not.toHaveAccessibleName(/out of date/i);
    const marker = await screen.findByTestId('plan-review-day-marker');
    expect(marker).toHaveAttribute('title', "Poppie: 7.17h isn't a quarter hour.");
  });

  it('shows the review as out of date when the plan no longer hashes the same', async () => {
    reviewedHash = 'a'.repeat(64);
    render(<PlanPanel />);
    const chip = await screen.findByTestId('plan-review-week-chip');
    await vi.waitFor(() => expect(chip).toHaveAccessibleName(/out of date/i));
  });

  it.each([
    ['applied', () => applyPlanReviewFinding.mockResolvedValue(undefined)],
    [
      'refused',
      () =>
        applyPlanReviewFinding.mockRejectedValue(
          new Error(
            'BC API Error (400): {"error":{"message":"The plan changed since Poppie looked. Ask her to re-review."}}'
          )
        ),
    ],
  ])('applies through BC and refreshes the grid when %s', async (_name, arrange) => {
    arrange();
    canEdit = true;
    reviewedHash = await samsWeekHash();
    render(<PlanPanel />);
    fireEvent.click(await screen.findByTestId('plan-review-week-chip'));
    const applyButton = await screen.findByRole('button', { name: 'Apply change' });
    const loadsBefore = vi.mocked(bcClient.getJobPlanningLines).mock.calls.length;
    fireEvent.click(applyButton);
    await waitFor(() =>
      expect(applyPlanReviewFinding).toHaveBeenCalledWith('00000000-0000-0000-0000-00000000f001')
    );
    // The grid reloads the plan whether BC applied the change or refused it
    await waitFor(() =>
      expect(vi.mocked(bcClient.getJobPlanningLines).mock.calls.length).toBeGreaterThan(loadsBefore)
    );
  });
});
