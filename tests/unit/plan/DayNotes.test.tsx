import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { BCDayNote } from '@/types';
import { buildDayNotesIndex } from '@/utils';
import {
  DayHeaderNotes,
  DayNotesProvider,
  PersonDayNoteMarker,
  type DayNotesContextValue,
} from '@/components/plan/DayNotes';

vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

const DAY = new Date(2026, 9, 14); // Wed 14 Oct 2026

const note = (partial: Partial<BCDayNote>): BCDayNote => ({
  id: `n${partial.entryNo ?? 1}`,
  entryNo: 1,
  noteDate: '2026-10-14',
  resourceNo: '',
  note: 'Company Off-Site',
  noProjectWork: true,
  '@odata.etag': 'W/"1"',
  ...partial,
});

function context(notes: BCDayNote[], overrides: Partial<DayNotesContextValue> = {}) {
  return {
    index: buildDayNotesIndex(notes),
    canEdit: false,
    people: [
      { number: 'R001', name: 'Alex Contoso' },
      { number: 'R002', name: 'Sam Contoso' },
    ],
    onCreate: vi.fn(async () => ({ revalidated: true })),
    onUpdate: vi.fn(async () => ({ revalidated: true })),
    onDelete: vi.fn(async () => ({ revalidated: true })),
    ...overrides,
  } satisfies DayNotesContextValue;
}

function renderHeader(value: DayNotesContextValue | null) {
  return render(
    <DayNotesProvider value={value}>
      <DayHeaderNotes day={DAY} className="header">
        <span>Wed</span>
        <span>14</span>
      </DayHeaderNotes>
    </DayNotesProvider>
  );
}

describe('DayHeaderNotes', () => {
  it('is a plain header when day notes are unavailable', () => {
    renderHeader(null);
    expect(screen.getByText('Wed')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows a company-wide note under the date, with it as the tooltip', () => {
    renderHeader(context([note({})]));
    const button = screen.getByRole('button', { name: /Wednesday 14 October: 1 note/ });
    expect(button).toHaveAttribute('title', 'Company Off-Site (no project work)');
    expect(screen.getByTestId('day-note-marker')).toHaveTextContent('Company Off-Site');
  });

  it('shows a count for several company-wide notes, and none for only personal ones', () => {
    const { unmount } = renderHeader(
      context([note({}), note({ entryNo: 2, note: 'Release day', noProjectWork: false })])
    );
    expect(screen.getByTestId('day-note-marker')).toHaveTextContent('2 notes');
    unmount();

    renderHeader(context([note({ resourceNo: 'R001', note: 'Dentist' })]));
    expect(screen.queryByTestId('day-note-marker')).not.toBeInTheDocument();
  });

  it("lists the day's notes read-only without permission", () => {
    renderHeader(context([note({}), note({ entryNo: 2, resourceNo: 'R002', note: 'Dentist' })]));
    fireEvent.click(screen.getByRole('button', { name: /Wednesday 14 October/ }));

    const dialog = screen.getByRole('dialog', { name: 'Notes for Wed 14 Oct' });
    expect(dialog).toHaveTextContent('Everyone');
    expect(dialog).toHaveTextContent('Sam Contoso');
    expect(dialog).toHaveTextContent('Dentist');
    expect(screen.queryByRole('button', { name: /Add note/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Edit note/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Delete note/ })).not.toBeInTheDocument();
  });

  it('closes on Escape and gives focus back to the header', async () => {
    renderHeader(context([note({})]));
    const button = screen.getByRole('button', { name: /Wednesday 14 October/ });
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Close notes' })).toHaveFocus());

    fireEvent.keyDown(document.activeElement ?? document, { key: 'Escape' });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(button).toHaveFocus();
  });

  it('adds a note for a person, with no project work, when the user may edit plans', async () => {
    const value = context([], { canEdit: true });
    renderHeader(value);
    fireEvent.click(screen.getByRole('button', { name: /Wednesday 14 October: no notes, add/ }));
    fireEvent.click(screen.getByRole('button', { name: '+ Add note' }));

    const input = screen.getByLabelText('Note');
    expect(input).toHaveAttribute('maxLength', '100');
    fireEvent.change(input, { target: { value: 'Client workshop' } });
    fireEvent.change(screen.getByLabelText('For'), { target: { value: 'R001' } });
    fireEvent.click(screen.getByLabelText('No project work'));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(value.onCreate).toHaveBeenCalledWith({
        noteDate: '2026-10-14',
        resourceNo: 'R001',
        note: 'Client workshop',
        noProjectWork: true,
      })
    );
  });

  it('edits and deletes notes when the user may edit plans', async () => {
    const existing = note({});
    const value = context([existing], { canEdit: true });
    renderHeader(value);
    fireEvent.click(screen.getByRole('button', { name: /Wednesday 14 October/ }));

    fireEvent.click(screen.getByRole('button', { name: 'Edit note "Company Off-Site"' }));
    fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'Off-Site (London)' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(value.onUpdate).toHaveBeenCalledWith(existing, {
        noteDate: '2026-10-14',
        resourceNo: '',
        note: 'Off-Site (London)',
        noProjectWork: true,
      })
    );

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Delete note "Company Off-Site"' })).toBeVisible()
    );
    fireEvent.click(screen.getByRole('button', { name: 'Delete note "Company Off-Site"' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(value.onDelete).toHaveBeenCalledWith(existing));
  });
});

describe('PersonDayNoteMarker', () => {
  it("marks a person's day with their note as the tooltip", () => {
    render(
      <DayNotesProvider value={context([note({ resourceNo: 'R001', note: 'Dentist' })])}>
        <PersonDayNoteMarker resourceNumber="R001" date="2026-10-14" />
        <PersonDayNoteMarker resourceNumber="R002" date="2026-10-14" />
      </DayNotesProvider>
    );
    const markers = screen.getAllByTestId('person-day-note');
    expect(markers).toHaveLength(1);
    expect(markers[0]).toHaveAttribute('title', 'Dentist (no project work)');
    expect(markers[0]).toHaveAccessibleName('Note: Dentist (no project work)');
  });
});

describe('DayNotesPopover', () => {
  it('scrolls within the screen height when there are many notes', () => {
    renderHeader(context([note({})]));
    fireEvent.click(screen.getByRole('button', { name: /Wednesday 14 October/ }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveClass('max-h-[calc(100vh-16px)]', 'overflow-y-auto');
  });

  it('says so when a change saved but the notes could not be re-read', async () => {
    const toast = (await import('react-hot-toast')).default;
    const value = context([note({})], {
      canEdit: true,
      onDelete: vi.fn(async () => ({ revalidated: false })),
    });
    renderHeader(value);
    fireEvent.click(screen.getByRole('button', { name: /Wednesday 14 October/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete note "Company Off-Site"' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Note deleted'));
    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/couldn't be refreshed/));
  });
});
