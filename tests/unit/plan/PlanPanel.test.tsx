import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { format, startOfWeek } from 'date-fns';

// Planning lines this week, so they fall inside the grid's visible range
const thisWeek = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');

const planningLine = (jobNo: string, resourceNo: string, lineNo: number) => ({
  id: `${jobNo}-${lineNo}`,
  jobNo,
  jobTaskNo: '100',
  lineNo,
  planningDate: thisWeek,
  lineType: 'Budget',
  type: 'Resource',
  number: resourceNo,
  description: '',
  quantity: 8,
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
      { jobNo, jobTaskNo: '100', description: 'Build' },
    ]),
    getJobPlanningLines: vi.fn(async (jobNo: string) =>
      jobNo === 'PR001' ? [planningLine('PR001', 'RES01', 1)] : [planningLine('PR002', 'RES02', 1)]
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

  it('still shows every project with the toggle on the Plan tab', async () => {
    render(<PlanPanel />);
    expect(await screen.findByText('Alex Contoso')).toBeInTheDocument();
    expect(screen.getByText('Sam Contoso')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Team/ })).toBeInTheDocument();
  });
});
