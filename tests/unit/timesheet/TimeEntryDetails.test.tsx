import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { ENTRY_DETAILS_HOVER_DELAY_MS, TimeEntryCell } from '@/components/timesheet/TimeEntryCell';
import { computePopoverPosition } from '@/components/timesheet/TimeEntryDetails';
import type { BCTimesheetReviewLine, Project, TimeEntry } from '@/types';

const projects: Project[] = [
  {
    id: 'p1',
    code: 'PR00020',
    name: 'Contoso Customer Portal Rebuild Phase Two',
    customerName: 'Contoso Ltd',
    color: '#3b82f6',
    status: 'active',
    isFavorite: false,
    tasks: [{ id: 't1', projectId: 'p1', code: '200', name: 'Build', isBillable: true }],
  },
];

const LONG_NOTES = [
  'Reworked the sign-in flow for the portal and paired on the API changes.',
  'Second line: reviewed the pull request and wrote up the test plan for the release.',
  'x'.repeat(400),
].join('\n');

const entry = (overrides: Partial<TimeEntry> = {}): TimeEntry => ({
  id: 'line1_2026-10-12',
  projectId: 'PR00020',
  taskId: '200',
  userId: 'u1',
  date: '2026-10-12',
  hours: 2.5,
  notes: LONG_NOTES,
  isBillable: true,
  isRunning: false,
  createdAt: '2026-10-12T09:00:00Z',
  updatedAt: '2026-10-12T09:00:00Z',
  bcTimeSheetLineNo: 10000,
  lineStatus: 'Submitted',
  ...overrides,
});

const renderCell = (
  props: Partial<Parameters<typeof TimeEntryCell>[0]> & { entries?: TimeEntry[] } = {}
) => {
  const onEditEntry = vi.fn();
  render(
    <TimeEntryCell
      entries={[entry()]}
      date="2026-10-12"
      isToday={false}
      projects={projects}
      onAddEntry={vi.fn()}
      onEditEntry={onEditEntry}
      onMoveEntry={vi.fn()}
      {...props}
    />
  );
  return { onEditEntry, card: screen.getByRole('button', { name: /Contoso Customer Portal/ }) };
};

describe('TimeEntryCell entry details', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the full details after resting the pointer on an entry', () => {
    const { card } = renderCell({ readOnly: true });
    fireEvent.mouseEnter(card);
    act(() => vi.advanceTimersByTime(ENTRY_DETAILS_HOVER_DELAY_MS - 50));
    expect(screen.queryByRole('tooltip')).toBeNull();

    act(() => vi.advanceTimersByTime(50));
    const tooltip = screen.getByRole('tooltip');
    expect(card).toHaveAttribute('aria-describedby', tooltip.id);
    const details = within(tooltip);
    expect(details.getByText('Contoso Customer Portal Rebuild Phase Two')).toBeInTheDocument();
    expect(details.getByText('PR00020')).toBeInTheDocument();
    expect(tooltip).toHaveTextContent('Contoso Ltd');
    expect(tooltip).toHaveTextContent('Build (200)');
    expect(tooltip).toHaveTextContent('Mon, 12 Oct');
    expect(tooltip).toHaveTextContent('2h 30m');
    expect(details.getByText('Submitted')).toBeInTheDocument();
    expect(details.getByText('Billable')).toBeInTheDocument();
  });

  it('does not show when the pointer moves on before the delay', () => {
    const { card } = renderCell({ readOnly: true });
    fireEvent.mouseEnter(card);
    act(() => vi.advanceTimersByTime(100));
    fireEvent.mouseLeave(card);
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('renders long notes in full, keeping their line breaks', () => {
    const { card } = renderCell({ readOnly: true });
    fireEvent.click(card);
    const notes = within(screen.getByRole('tooltip')).getByText((_, el) =>
      Boolean(el?.tagName === 'P' && el.textContent === LONG_NOTES)
    );
    expect(notes).toHaveClass('whitespace-pre-wrap');
  });

  it('read-only: keyboard focus then Enter shows the details, Escape closes them', () => {
    const { card } = renderCell({ readOnly: true });
    expect(card).toHaveAttribute('tabindex', '0');
    expect(card).toHaveAccessibleName(/Show details/);

    act(() => card.focus());
    fireEvent.keyDown(card, { key: 'Enter' });
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    expect(card).toHaveAttribute('aria-expanded', 'true');

    fireEvent.keyDown(card, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).toBeNull();
    expect(card).toHaveAttribute('aria-expanded', 'false');
  });

  it('read-only: a click or tap toggles the details', () => {
    const { card, onEditEntry } = renderCell({ readOnly: true });
    fireEvent.click(card);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    fireEvent.click(card);
    expect(screen.queryByRole('tooltip')).toBeNull();
    expect(onEditEntry).not.toHaveBeenCalled();
  });

  it('Escape closes details opened by hover', () => {
    const { card } = renderCell({ readOnly: true });
    fireEvent.mouseEnter(card);
    act(() => vi.advanceTimersByTime(ENTRY_DETAILS_HOVER_DELAY_MS));
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('editable: a click still opens the edit form, and hover still shows the details', () => {
    const { card, onEditEntry } = renderCell();
    expect(card).toHaveAccessibleName(/^Edit /);

    fireEvent.mouseEnter(card);
    act(() => vi.advanceTimersByTime(ENTRY_DETAILS_HOVER_DELAY_MS));
    expect(screen.getByRole('tooltip')).toBeInTheDocument();

    fireEvent.click(card);
    expect(onEditEntry).toHaveBeenCalledWith(expect.objectContaining({ id: 'line1_2026-10-12' }));
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('editable: Enter opens the edit form', () => {
    const { card, onEditEntry } = renderCell();
    fireEvent.keyDown(card, { key: 'Enter' });
    expect(onEditEntry).toHaveBeenCalledTimes(1);
  });

  it('hides the details while an entry is dragged', () => {
    const { card } = renderCell();
    fireEvent.mouseEnter(card);
    act(() => vi.advanceTimersByTime(ENTRY_DETAILS_HOVER_DELAY_MS));
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    fireEvent.dragStart(card, { dataTransfer: { setData: vi.fn(), effectAllowed: '' } });
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it("shows Poppie's notes on the line, non-billable and Open status", () => {
    const reviewNotes: BCTimesheetReviewLine[] = [
      {
        id: 'n1',
        reviewEntryNo: 1,
        lineNo: 1,
        timeSheetNo: 'TS00001',
        timeSheetLineNo: 10000,
        severity: 'Warning',
        note: 'Description is vague for a billable client entry.',
      },
    ];
    const { card } = renderCell({
      readOnly: true,
      entries: [entry({ isBillable: false, lineStatus: 'Open' })],
      reviewNotesByLine: new Map([[10000, reviewNotes]]),
    });
    fireEvent.click(card);
    const tooltip = within(screen.getByRole('tooltip'));
    expect(tooltip.getByText('Description is vague for a billable client entry.')).toBeVisible();
    expect(tooltip.getByText('Non-billable')).toBeInTheDocument();
    expect(tooltip.getByText('Open')).toBeInTheDocument();
  });
});

describe('computePopoverPosition', () => {
  const viewport = { width: 1200, height: 800 };
  const popover = { width: 288, height: 200 };

  it('sits below the card, lined up with its left edge', () => {
    const anchor = { top: 100, bottom: 150, left: 200, right: 360 };
    expect(computePopoverPosition(anchor, popover, viewport)).toEqual({
      top: 156,
      left: 200,
      placement: 'bottom',
    });
  });

  it('lines up with the right edge near the right of the screen (Sat/Sun)', () => {
    const anchor = { top: 100, bottom: 150, left: 1030, right: 1190 };
    expect(computePopoverPosition(anchor, popover, viewport).left).toBe(1190 - 288);
  });

  it('goes above the card when there is no room below', () => {
    const anchor = { top: 700, bottom: 750, left: 200, right: 360 };
    const position = computePopoverPosition(anchor, popover, viewport);
    expect(position.placement).toBe('top');
    expect(position.top).toBe(700 - 6 - 200);
  });
});
