import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { format, startOfWeek } from 'date-fns';

// Monday this week, so it's inside the grid's visible range
const monday = startOfWeek(new Date(), { weekStartsOn: 1 });
const thisWeek = format(monday, 'yyyy-MM-dd');

const planningLine = (jobNo: string, resourceNo: string, lineNo: number, quantity: number) => ({
  id: `${jobNo}-${lineNo}`,
  jobNo,
  jobTaskNo: '100',
  lineNo,
  planningDate: thisWeek,
  lineType: 'Budget',
  type: 'Resource',
  number: resourceNo,
  description: '',
  quantity,
  unitCost: 0,
  unitPrice: 0,
  totalCost: 0,
  totalPrice: 0,
  lastModifiedDateTime: '',
});

// Whether BC says the signed-in user may change plans
let canEdit = false;

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
    // Sam has 6h on Monday: short of an 8h day, were it not the off-site
    getJobPlanningLines: vi.fn(async () => [planningLine('PR001', 'RES02', 1, 6)]),
    getResourceUnitsOfMeasure: vi.fn(async () => []),
    getTimeSheets: vi.fn(async () => []),
    getDayNotes: vi.fn(async () => [
      {
        id: 'n1',
        entryNo: 1,
        noteDate: thisWeek,
        resourceNo: '',
        note: 'Company Off-Site',
        noProjectWork: true,
      },
    ]),
  },
}));

vi.mock('@/services/auth', () => ({
  useAuth: () => ({ account: { username: 'someone@contoso.com' } }),
  getUserProfilePhoto: vi.fn(async () => null),
  resolveResourceIdentity: vi.fn(async () => ({ photoUrl: null })),
}));

import { PlanPanel } from '@/components/plan';
import { usePlanStore } from '@/hooks/usePlanStore';
import { useDayNotesStore } from '@/hooks/useDayNotesStore';

describe('PlanPanel day notes', () => {
  beforeEach(() => {
    canEdit = false;
    usePlanStore.setState({ cache: null, viewMode: 'team', projects: [], teamMembers: [] });
    useDayNotesStore.getState().reset();
  });

  it('shows the note in the header and treats the day as having no capacity', async () => {
    render(<PlanPanel />);
    await screen.findByText('Sam Contoso');

    expect(await screen.findByTestId('day-note-marker')).toHaveTextContent('Company Off-Site');
    const [label] = await screen.findAllByText(
      /^Company Off-Site: no project work, but 6h planned/
    );
    expect(label.parentElement).toHaveClass('ring-red-500');
    expect(label.parentElement).not.toHaveClass('ring-amber-400');
    expect(screen.queryByText(/^Under capacity:/)).not.toBeInTheDocument();
  });

  it('hides the edit controls without permission to change plans', async () => {
    render(<PlanPanel />);
    await screen.findByTestId('day-note-marker');
    fireEvent.click(screen.getByRole('button', { name: /: 1 note, show/ }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Company Off-Site');
    expect(screen.queryByRole('button', { name: '+ Add note' })).not.toBeInTheDocument();
  });

  it('offers Add, Edit and Delete with permission', async () => {
    canEdit = true;
    render(<PlanPanel />);
    await screen.findByTestId('day-note-marker');
    fireEvent.click(screen.getByRole('button', { name: /: 1 note, show/ }));
    expect(screen.getByRole('button', { name: '+ Add note' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Edit note "Company Off-Site"' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Delete note "Company Off-Site"' })
    ).toBeInTheDocument();
  });
});
