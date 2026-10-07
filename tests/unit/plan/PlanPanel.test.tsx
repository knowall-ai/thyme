import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { format, startOfWeek } from 'date-fns';

// Planning lines this week, so they fall inside the grid's visible range
const thisWeek = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');

const planningLine = (jobNo: string, resourceNo: string, lineNo: number, quantity = 8) => ({
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

vi.mock('@/services/bc', () => ({
  ExtensionNotInstalledError: class ExtensionNotInstalledError extends Error {},
  bcClient: {
    getResources: vi.fn(async () => [
      { id: 'r1', number: 'RES01', name: 'Alex Contoso', displayName: 'Alex Contoso' },
      { id: 'r2', number: 'RES02', name: 'Sam Contoso', displayName: 'Sam Contoso' },
    ]),
    getProjects: vi.fn(async () => [
      { id: 'p1', number: 'PR001', displayName: 'Contoso Website', billToCustomerName: 'Contoso' },
      { id: 'p2', number: 'PR002', displayName: 'Contoso App', billToCustomerName: 'Contoso' },
    ]),
    getJobTasks: vi.fn(async (jobNo: string) => [
      { jobNo, jobTaskNo: '000', description: 'Phase 1', jobTaskType: 'Heading' },
      { jobNo, jobTaskNo: '100', description: 'Build', jobTaskType: 'Posting' },
      { jobNo, jobTaskNo: '200', description: 'Design', jobTaskType: 'Posting' },
    ]),
    // Alex has 8h on PR001 and 1.5h on PR002 the same day: over an 8h day
    getJobPlanningLines: vi.fn(async (jobNo: string) =>
      jobNo === 'PR001'
        ? [planningLine('PR001', 'RES01', 1)]
        : [planningLine('PR002', 'RES02', 1), planningLine('PR002', 'RES01', 2, 1.5)]
    ),
    getResourceUnitsOfMeasure: vi.fn(async () => []),
    getTimeSheets: vi.fn(async () => []),
  },
}));

vi.mock('@/services/auth', () => ({
  useAuth: () => ({ account: { username: 'someone@contoso.com' } }),
  getUserProfilePhoto: vi.fn(async () => null),
}));

import { PlanPanel } from '@/components/plan';
import { bcClient } from '@/services/bc';
import { usePlanStore } from '@/hooks/usePlanStore';

describe('PlanPanel scoped to one project', () => {
  beforeEach(() => {
    usePlanStore.setState({ cache: null, viewMode: 'team', projects: [], teamMembers: [] });
  });

  it("shows only that project's plan, with no Team/Projects toggle", async () => {
    render(<PlanPanel projectCode="PR001" />);

    // Expanded down to the people on it
    expect(await screen.findByText('Alex Contoso')).toBeInTheDocument();
    expect(screen.getByText('Contoso Website')).toBeInTheDocument();
    expect(screen.queryByText('Contoso App')).not.toBeInTheDocument();
    expect(screen.queryByText('Sam Contoso')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Team$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Projects$/ })).not.toBeInTheDocument();
  });

  it("leaves the Plan tab's view mode and week alone", async () => {
    const weekBefore = usePlanStore.getState().currentWeekStart;
    render(<PlanPanel projectCode="PR001" />);
    await screen.findByText('Alex Contoso');

    fireEvent.click(screen.getByRole('button', { name: 'Next week' }));

    expect(usePlanStore.getState().viewMode).toBe('team');
    expect(usePlanStore.getState().currentWeekStart).toBe(weekBefore);
  });

  it('hands fullscreen to the host and leaves Escape to it', async () => {
    const onFullscreenChange = vi.fn();
    const { rerender } = render(
      <PlanPanel projectCode="PR001" isFullscreen={false} onFullscreenChange={onFullscreenChange} />
    );
    await screen.findByText('Alex Contoso');

    fireEvent.click(screen.getByRole('button', { name: 'Fullscreen' }));
    expect(onFullscreenChange).toHaveBeenCalledWith(true);

    rerender(
      <PlanPanel projectCode="PR001" isFullscreen onFullscreenChange={onFullscreenChange} />
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onFullscreenChange).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Exit fullscreen' })).toBeInTheDocument()
    );
  });

  it("lists every one of the project's tasks, even those with no one planned yet", async () => {
    render(<PlanPanel projectCode="PR001" />);
    await screen.findByText('Alex Contoso');

    expect(screen.getByText('Build')).toBeInTheDocument();
    expect(screen.getByText('Design')).toBeInTheDocument();
    // Headings aren't plannable
    expect(screen.queryByText('Phase 1')).not.toBeInTheDocument();
    // Each task can have people added
    expect(screen.getAllByText('+ Add resource')).toHaveLength(2);
  });

  it('explains a red cell: over-allocated across all projects', async () => {
    render(<PlanPanel projectCode="PR001" />);
    await screen.findByText('Alex Contoso');

    const labels = screen.getAllByText(
      /^Over-allocated: 9\.5h planned across 2 projects \(capacity 8h\)/
    );
    expect(labels.length).toBeGreaterThan(0);
    expect(labels[0]).toHaveClass('sr-only');
    expect(labels[0].textContent).toContain('Contoso Website: 8h');
    expect(labels[0].textContent).toContain('Contoso App: 1.5h');
    expect(labels[0].parentElement).toHaveAttribute('title', labels[0].textContent);
  });

  it('loads once on open, then moves between weeks without fetching', async () => {
    render(<PlanPanel projectCode="PR001" />);
    await screen.findByText('Alex Contoso');
    const calls = vi.mocked(bcClient.getJobPlanningLines).mock.calls.length;

    fireEvent.click(screen.getByRole('button', { name: 'Next week' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next week' }));

    expect(screen.getByText('Design')).toBeInTheDocument();
    expect(vi.mocked(bcClient.getJobPlanningLines).mock.calls.length).toBe(calls);
  });

  it('still shows every project with the toggle on the Plan tab', async () => {
    render(<PlanPanel />);
    expect(await screen.findByText('Alex Contoso')).toBeInTheDocument();
    expect(screen.getByText('Sam Contoso')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Team/ })).toBeInTheDocument();
  });
});
