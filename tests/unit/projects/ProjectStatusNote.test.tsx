import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import type { BCProjectNote } from '@/types';

const getProjectNotes = vi.fn();
const addProjectNote = vi.fn();
vi.mock('@/services/bc', () => ({
  bcClient: {
    getProjectNotes: (...args: unknown[]) => getProjectNotes(...args),
    addProjectNote: (...args: unknown[]) => addProjectNote(...args),
  },
}));

import { ProjectStatusNote } from '@/components/projects/ProjectStatusNote';

const note = (id: number, text: string, createdAt: string): BCProjectNote => ({
  id,
  jobNo: 'PR00060',
  note: text,
  createdAt,
  createdBy: 'KATHERINE',
  createdByName: 'Katherine Hull',
});

beforeEach(() => {
  getProjectNotes.mockReset();
  addProjectNote.mockReset();
});

describe('ProjectStatusNote', () => {
  it('shows the latest note as the status, with who and when, and the earlier ones on request', async () => {
    getProjectNotes.mockResolvedValue([
      note(2, 'Blocked on the Azure database', '2026-10-15T15:20:00Z'),
      note(1, 'Design signed off', '2026-10-01T09:00:00Z'),
    ]);
    render(<ProjectStatusNote jobNo="PR00060" />);
    expect(await screen.findByText('Blocked on the Azure database')).toBeInTheDocument();
    expect(screen.getByText(/Katherine Hull · 15 Oct 2026/)).toBeInTheDocument();
    expect(screen.queryByText('Design signed off')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Earlier notes (1)' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Design signed off')).toBeInTheDocument();
    expect(within(dialog).getByText(/current status/)).toBeInTheDocument();
  });

  it('posts a new status, which becomes the latest', async () => {
    getProjectNotes.mockResolvedValue([note(1, 'Design signed off', '2026-10-01T09:00:00Z')]);
    addProjectNote.mockResolvedValue(note(2, 'Live on Friday', '2026-10-15T16:00:00Z'));
    render(<ProjectStatusNote jobNo="PR00060" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Update status' }));
    fireEvent.change(screen.getByLabelText(/Where things stand/), {
      target: { value: '  Live on Friday ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Post' }));
    await waitFor(() => expect(addProjectNote).toHaveBeenCalledWith('PR00060', 'Live on Friday'));
    expect(await screen.findByText('Live on Friday')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Earlier notes (1)' })).toBeInTheDocument();
  });

  it('updates the status from the earlier notes list too', async () => {
    getProjectNotes.mockResolvedValue([
      note(2, 'Blocked on the Azure database', '2026-10-15T15:20:00Z'),
      note(1, 'Design signed off', '2026-10-01T09:00:00Z'),
    ]);
    addProjectNote.mockResolvedValue(note(3, 'Unblocked', '2026-10-16T09:00:00Z'));
    render(<ProjectStatusNote jobNo="PR00060" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Earlier notes (1)' }));
    const list = await screen.findByRole('dialog', { name: 'Project notes' });
    fireEvent.click(within(list).getByRole('button', { name: 'Update status' }));

    const editor = await screen.findByRole('dialog', { name: 'Update project status' });
    expect(screen.queryByRole('dialog', { name: 'Project notes' })).not.toBeInTheDocument();
    fireEvent.change(within(editor).getByLabelText(/Where things stand/), {
      target: { value: 'Unblocked' },
    });
    fireEvent.click(within(editor).getByRole('button', { name: 'Post' }));
    await waitFor(() => expect(addProjectNote).toHaveBeenCalledWith('PR00060', 'Unblocked'));
    expect(await screen.findByRole('button', { name: 'Earlier notes (2)' })).toBeInTheDocument();
  });

  it('offers to add one when there are none, and shows nothing on an older extension', async () => {
    getProjectNotes.mockResolvedValue([]);
    const { unmount } = render(<ProjectStatusNote jobNo="PR00060" />);
    expect(await screen.findByRole('button', { name: /Add a status note/ })).toBeInTheDocument();
    unmount();

    getProjectNotes.mockResolvedValue(undefined);
    const { container } = render(<ProjectStatusNote jobNo="PR00060" />);
    await waitFor(() => expect(getProjectNotes).toHaveBeenCalledTimes(2));
    expect(container).toBeEmptyDOMElement();
  });
});
