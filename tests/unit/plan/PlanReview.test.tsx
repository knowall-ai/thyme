import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import type { BCPlanReview, BCPlanReviewChange, BCPlanReviewLine } from '@/types';
import type { PlanReviewSubjectWeek } from '@/utils';
import {
  PlanReviewDayMarker,
  PlanReviewProvider,
  PlanReviewWeekChip,
  STALE_CHANGE_MESSAGE,
  COMPANY_CHANGED_MESSAGE,
  type PlanReviewContextValue,
} from '@/components/plan/PlanReview';

vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/services/auth/reviewerIdentity', () => ({ useReviewerPhoto: () => null }));

const WEEK = '2026-10-19'; // Monday; the 22nd is a Thursday

const review = (partial: Partial<BCPlanReview> = {}): BCPlanReview => ({
  id: `rev-${partial.entryNo ?? 1}`,
  entryNo: 1,
  subjectType: 'Resource',
  subjectNo: 'R0010',
  weekStart: WEEK,
  planHash: 'abc',
  verdict: 'Check',
  summary: 'Thursday has an odd 7.17h.',
  reviewer: 'Poppie',
  reviewedAt: '2026-10-15T10:00:00Z',
  ...partial,
});

const finding: BCPlanReviewLine = {
  reviewEntryNo: 1,
  lineNo: 10000,
  severity: 'Warning',
  check: 'ROUNDING',
  planningDate: '2026-10-22',
  jobNo: 'PR00090',
  resourceNo: 'R0010',
  note: "7.17h isn't a quarter hour.",
};

const change: BCPlanReviewChange = {
  reviewEntryNo: 1,
  reviewLineNo: 10000,
  changeNo: 10000,
  jobNo: 'PR00090',
  jobTaskNo: '100',
  resourceNo: 'R0010',
  planningDate: '2026-10-22',
  currentHours: 7.17,
  proposedHours: 7.25,
};

const subject = (partial: Partial<PlanReviewSubjectWeek> = {}): PlanReviewSubjectWeek => ({
  subjectType: 'Resource',
  subjectNo: 'R0010',
  name: 'Alex Contoso',
  weekStart: WEEK,
  review: review(),
  status: 'current',
  request: null,
  hasPlan: true,
  ...partial,
});

function context(
  subjects: PlanReviewSubjectWeek[],
  overrides: Partial<PlanReviewContextValue> = {}
): PlanReviewContextValue {
  return {
    subjectType: 'Resource',
    weeks: new Map([[WEEK, subjects]]),
    lines: { 1: [finding] },
    changes: { 1: [change] },
    loadChanges: vi.fn(),
    canRequest: () => false,
    canApply: () => false,
    projectName: (jobNo) => (jobNo === 'PR00090' ? 'Contoso Rollout' : jobNo),
    resourceName: (no) => no,
    onRequest: vi.fn(async () => {}),
    onApply: vi.fn(async () => ({ status: 'applied' as const, written: 1, attempted: true })),
    ...overrides,
  };
}

function renderChip(value: PlanReviewContextValue | null) {
  return render(
    <PlanReviewProvider value={value}>
      <PlanReviewWeekChip weekStart={WEEK} weekNumber={43} />
    </PlanReviewProvider>
  );
}

const openPopover = () => {
  fireEvent.click(screen.getByTestId('plan-review-week-chip'));
  return screen.getByRole('dialog');
};

describe('PlanReviewWeekChip', () => {
  it('shows nothing when plan reviews are unavailable', () => {
    renderChip(null);
    expect(screen.queryByTestId('plan-review-week-chip')).not.toBeInTheDocument();
  });

  it('shows nothing for an unreviewed week to someone who may not ask for a review', () => {
    renderChip(context([subject({ review: null, status: 'none' })]));
    expect(screen.queryByTestId('plan-review-week-chip')).not.toBeInTheDocument();
  });

  it('offers "Ask Poppie" on an unreviewed week to someone who may change plans', () => {
    renderChip(context([subject({ review: null, status: 'none' })], { canRequest: () => true }));
    expect(screen.getByTestId('plan-review-week-chip')).toHaveTextContent('Ask Poppie');
  });

  it('shows the worst verdict with a count, in its colour', () => {
    renderChip(
      context([
        subject({ review: review({ verdict: 'Approve' }) }),
        subject({ subjectNo: 'R0020', name: 'Sam Contoso', review: review({ entryNo: 2 }) }),
        subject({ subjectNo: 'R0030', name: 'Jo Contoso', review: review({ entryNo: 3 }) }),
      ])
    );
    const chip = screen.getByTestId('plan-review-week-chip');
    expect(chip).toHaveTextContent('2 to check');
    expect(chip).toHaveClass('text-amber-400');
    expect(chip).not.toHaveAccessibleName(/out of date/i);
  });

  it('shows "Out of date" when a subject\'s plan changed since the review', () => {
    renderChip(context([subject({ review: review({ verdict: 'Query' }), status: 'outOfDate' })]));
    const chip = screen.getByTestId('plan-review-week-chip');
    expect(chip).toHaveTextContent('Needs changes');
    expect(chip).toHaveAccessibleName(/out of date/i);
    expect(chip).toHaveClass('border-dashed');
  });

  it('shows a queued request on a week with no review yet', () => {
    renderChip(
      context([
        subject({
          review: null,
          status: 'awaiting',
          request: { status: 'Requested' } as PlanReviewSubjectWeek['request'],
        }),
      ])
    );
    expect(screen.getByTestId('plan-review-week-chip')).toHaveTextContent('Queued…');
  });
});

describe('PlanReview popover', () => {
  it("lists the week's reviews and their findings and changes", () => {
    renderChip(context([subject()]));
    const dialog = openPopover();
    expect(dialog).toHaveTextContent('Alex Contoso');
    expect(dialog).toHaveTextContent('Worth a check');
    // A single review opens straight to its findings
    expect(dialog).toHaveTextContent("7.17h isn't a quarter hour.");
    expect(dialog).toHaveTextContent('Rounding · Thu 22');
    expect(dialog).toHaveTextContent('Thu 22 · PR00090 · Contoso Rollout · 7.17h → 7.25h');
  });

  it('hides Apply change and Ask Poppie without permission to change plans', () => {
    renderChip(context([subject()]));
    openPopover();
    expect(screen.queryByRole('button', { name: 'Apply change' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Ask Poppie to re-review' })
    ).not.toBeInTheDocument();
  });

  it('offers Apply change only for changes to projects the user may plan', () => {
    renderChip(
      context([subject()], { canApply: (c) => c.jobNo === 'PR00090', canRequest: () => true })
    );
    openPopover();
    expect(screen.getByRole('button', { name: 'Apply change' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ask Poppie to re-review' })).toBeInTheDocument();
  });

  it("applies a finding's changes", async () => {
    const value = context([subject()], { canApply: () => true });
    renderChip(value);
    openPopover();
    fireEvent.click(screen.getByRole('button', { name: 'Apply change' }));
    expect(value.onApply).toHaveBeenCalledWith([change]);
    expect(await screen.findByText('Applied')).toBeInTheDocument();
  });

  it('says the plan changed when a cell no longer matches, and stops offering the change', async () => {
    const value = context([subject()], {
      canApply: () => true,
      onApply: vi.fn(async () => ({
        status: 'stale' as const,
        change,
        actualHours: 7.5,
        attempted: false,
        rolledBack: true,
      })),
    });
    renderChip(value);
    openPopover();
    fireEvent.click(screen.getByRole('button', { name: 'Apply change' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(STALE_CHANGE_MESSAGE);
    expect(screen.queryByRole('button', { name: 'Apply change' })).not.toBeInTheDocument();
  });

  it('says to edit the cell by hand instead of offering Apply for a Billable or multi-line cell', () => {
    renderChip(
      context([subject()], {
        canApply: () => true,
        manualReason: () => "its planning line is Billable, part of the project's budget estimate",
      })
    );
    const dialog = openPopover();
    expect(screen.queryByRole('button', { name: 'Apply change' })).not.toBeInTheDocument();
    expect(dialog).toHaveTextContent(
      "Edit this cell by hand: its planning line is Billable, part of the project's budget estimate."
    );
  });

  it('shows why Apply stopped when BC says the cell must be edited by hand', async () => {
    renderChip(
      context([subject()], {
        canApply: () => true,
        onApply: vi.fn(async () => ({
          status: 'manual' as const,
          change,
          reason: 'this day has several planning lines for the task',
          attempted: false as const,
        })),
      })
    );
    openPopover();
    fireEvent.click(screen.getByRole('button', { name: 'Apply change' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Edit this cell by hand: this day has several planning lines for the task.'
    );
  });

  it('reports a failed write, and whether it was undone', async () => {
    renderChip(
      context([subject()], {
        canApply: () => true,
        onApply: vi.fn(async () => ({
          status: 'failed' as const,
          message: 'BC API Error (500)',
          attempted: true as const,
          rolledBack: false,
        })),
      })
    );
    openPopover();
    fireEvent.click(screen.getByRole('button', { name: 'Apply change' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /undoing the part already written failed too\. Check this week's plan/
    );
  });

  it('stops and says so when the company changes while applying', async () => {
    renderChip(
      context([subject()], {
        canApply: () => true,
        onApply: vi.fn(async () => ({ status: 'companyChanged' as const, attempted: true })),
      })
    );
    openPopover();
    fireEvent.click(screen.getByRole('button', { name: 'Apply change' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(COMPANY_CHANGED_MESSAGE);
  });

  it('asks Poppie to review an unreviewed subject, and shows a request in progress', async () => {
    const value = context(
      [
        subject({ review: null, status: 'none' }),
        subject({
          subjectNo: 'R0020',
          name: 'Sam Contoso',
          review: review({ entryNo: 2 }),
          status: 'awaiting',
          request: {
            status: 'Running',
            progress: 'Checking the calendar',
          } as PlanReviewSubjectWeek['request'],
        }),
      ],
      { canRequest: () => true }
    );
    renderChip(value);
    const dialog = openPopover();
    expect(within(dialog).getByText('Checking the calendar')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Ask Poppie to review' }));
    await waitFor(() => expect(value.onRequest).toHaveBeenCalledWith('R0010', WEEK));
  });

  it('loads changes when a subject is expanded', () => {
    const value = context(
      [
        subject(),
        subject({ subjectNo: 'R0020', name: 'Sam Contoso', review: review({ entryNo: 2 }) }),
      ],
      { changes: {} }
    );
    renderChip(value);
    openPopover();
    expect(value.loadChanges).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /^Sam Contoso: Worth a check\. Show/ }));
    expect(value.loadChanges).toHaveBeenCalledWith([2]);
  });

  it('closes on Escape and returns focus to the chip', () => {
    renderChip(context([subject()]));
    openPopover();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByTestId('plan-review-week-chip')).toHaveFocus();
  });
});

describe('PlanReviewDayMarker', () => {
  it('marks a day with findings for that subject, with the note as its tooltip', () => {
    render(
      <PlanReviewProvider value={context([subject()])}>
        <PlanReviewDayMarker subjectNo="R0010" date="2026-10-22" />
        <PlanReviewDayMarker subjectNo="R0010" date="2026-10-21" />
        <PlanReviewDayMarker subjectNo="R0020" date="2026-10-22" />
      </PlanReviewProvider>
    );
    const markers = screen.getAllByTestId('plan-review-day-marker');
    expect(markers).toHaveLength(1);
    expect(markers[0]).toHaveAttribute('title', "Poppie: 7.17h isn't a quarter hour.");
    expect(markers[0]).toHaveClass('bg-amber-400', 'left-0.5');
  });
});
