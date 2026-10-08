import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { PoppieSuggestionsPanel } from '@/components/timesheet/PoppieSuggestionsPanel';
import type { BCTimeSuggestion, Project } from '@/types';

const addEntry = vi.fn();
const accept = vi.fn();
const toastSuccess = vi.fn();
const toastError = vi.fn();

const suggestion = (overrides: Partial<BCTimeSuggestion>): BCTimeSuggestion => ({
  id: 's1',
  entryNo: 1,
  resourceNo: 'R0010',
  date: '2026-10-06',
  quantity: 1,
  jobNo: 'PR00010',
  jobTaskNo: '100',
  description: 'Contoso stand-up',
  source: 'Calendar',
  confidence: 'High',
  status: 'Pending',
  ...overrides,
});

let suggestions: BCTimeSuggestion[] = [];

vi.mock('@/hooks', () => ({
  useTimeEntriesStore: () => ({ addEntry }),
  useSettingsStore: () => ({ requireTimesheetComments: false }),
}));
vi.mock('@/hooks/useTimeSuggestions', () => ({
  useTimeSuggestions: () => ({
    suggestions,
    isLoading: false,
    isAvailable: true,
    accept,
    dismiss: vi.fn(),
    restore: vi.fn(),
  }),
}));
vi.mock('@/services/auth', () => ({ useAuth: () => ({ account: { localAccountId: 'u1' } }) }));
vi.mock('@/services/bc', () => ({
  timeEntryService: { getTimeSheetLineNo: () => 10000 },
}));
vi.mock('react-hot-toast', () => ({
  default: Object.assign(vi.fn(), {
    success: (...a: unknown[]) => toastSuccess(...a),
    error: (...a: unknown[]) => toastError(...a),
    dismiss: vi.fn(),
  }),
}));
// Stand-in for the entry dialog: shows which suggestion it was opened with
vi.mock('@/components/timesheet/TimeEntryModal', () => ({
  TimeEntryModal: ({ isOpen, prefill }: { isOpen: boolean; prefill: { key: string } | null }) =>
    isOpen ? <div role="dialog">Editing {prefill?.key}</div> : null,
}));

const projects = [
  {
    id: 'p1',
    code: 'PR00010',
    name: 'Support',
    customerName: 'Contoso Ltd',
    status: 'active',
    tasks: [{ id: 't1', code: '100', name: 'Support', isBillable: true }],
  },
] as unknown as Project[];

const renderPanel = (canEdit = true) =>
  render(
    <PoppieSuggestionsPanel
      resourceNo="R0010"
      weekStart={new Date('2026-10-05')}
      entries={[]}
      entriesLoading={false}
      projects={projects}
      canEdit={canEdit}
    />
  );

const row = (text: string) => screen.getByText(text).closest('li') as HTMLElement;

describe('PoppieSuggestionsPanel Add and Edit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    addEntry.mockResolvedValue({ id: 'e1', bcTimeSheetNo: 'TS001', bcTimeSheetLineId: 'x' });
    accept.mockResolvedValue(undefined);
  });

  it('adds a suggestion with a known project and task in one click', async () => {
    suggestions = [suggestion({})];
    renderPanel();

    const add = within(row('Contoso stand-up')).getByTitle('Add to timesheet');
    fireEvent.click(add);

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Time entry added'));
    expect(addEntry).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 'PR00010', taskId: '100', hours: 1 })
    );
    expect(accept).toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows an error toast when the one-click add fails', async () => {
    suggestions = [suggestion({})];
    addEntry.mockRejectedValue(new Error('BC down'));
    renderPanel();

    fireEvent.click(within(row('Contoso stand-up')).getByTitle('Add to timesheet'));

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith('Failed to add time entry. Please try again.')
    );
  });

  it('opens the pre-filled dialog when Add has no project to go on', () => {
    suggestions = [suggestion({ id: 's2', jobNo: '', jobTaskNo: '', description: 'Intro call' })];
    renderPanel();

    fireEvent.click(within(row('Intro call')).getByTitle('Choose a project and task, then add'));

    expect(screen.getByRole('dialog')).toHaveTextContent('Editing s2');
    expect(addEntry).not.toHaveBeenCalled();
  });

  it('opens the pre-filled dialog from Edit, even when the suggestion could be added in one click', () => {
    suggestions = [suggestion({})];
    renderPanel();

    const edit = within(row('Contoso stand-up')).getByRole('button', {
      name: 'Edit before adding',
    });
    expect(edit).toHaveTextContent('Edit');
    fireEvent.click(edit);

    expect(screen.getByRole('dialog')).toHaveTextContent('Editing s1');
    expect(addEntry).not.toHaveBeenCalled();
  });

  it('hides Add and Edit when the timesheet is read-only', () => {
    suggestions = [suggestion({})];
    renderPanel(false);

    const suggestionRow = row('Contoso stand-up');
    expect(within(suggestionRow).queryByTitle('Add to timesheet')).toBeNull();
    expect(within(suggestionRow).queryByRole('button', { name: 'Edit before adding' })).toBeNull();
  });

  it('never saves a suggestion twice when Add and Add all overlap', async () => {
    suggestions = [suggestion({})];
    let finish: (v: unknown) => void = () => {};
    addEntry.mockImplementation(() => new Promise((resolve) => (finish = resolve)));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderPanel();

    const add = within(row('Contoso stand-up')).getByTitle('Add to timesheet');
    fireEvent.click(add);
    fireEvent.click(add); // a second click while the first save is pending
    const addAll = screen.getByRole('button', { name: /Add all high confidence/ });
    expect(addAll).toBeDisabled();
    fireEvent.click(addAll);

    finish({ id: 'e1', bcTimeSheetNo: 'TS001', bcTimeSheetLineId: 'x' });
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Time entry added'));
    expect(addEntry).toHaveBeenCalledTimes(1);
  });

  it('opens the entry form instead of saving when the project is no longer active', () => {
    suggestions = [suggestion({ id: 's3', jobNo: 'PR00020', description: 'Old project work' })];
    const inactive = [
      ...projects,
      {
        id: 'p2',
        code: 'PR00020',
        name: 'Old',
        customerName: 'Contoso Ltd',
        status: 'completed',
        tasks: [{ id: 't2', code: '100', name: 'Support', isBillable: true }],
      },
    ] as unknown as Project[];
    render(
      <PoppieSuggestionsPanel
        resourceNo="R0010"
        weekStart={new Date('2026-10-05')}
        entries={[]}
        entriesLoading={false}
        projects={inactive}
        canEdit
      />
    );
    const add = within(row('Old project work')).getByTitle(/no longer active/);
    fireEvent.click(add);
    expect(addEntry).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toHaveTextContent('Editing s3');
  });

  it('opens the entry form for a guessed project instead of saving it', () => {
    suggestions = [
      suggestion({
        id: 's4',
        description: 'Contoso intro',
        evidence: 'Guessed project PR00010 from customer domain contoso.com',
      }),
    ];
    renderPanel();
    const add = within(row('Contoso intro')).getByTitle('Check the guessed project, then add');
    fireEvent.click(add);
    expect(addEntry).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toHaveTextContent('Editing s4');
  });
});
