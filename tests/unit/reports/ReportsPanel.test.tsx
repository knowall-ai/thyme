import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';

const person = (number: string, name: string, extra: Record<string, unknown> = {}) => ({
  id: `id-${number}`,
  number,
  name,
  displayName: name,
  type: 'Person' as const,
  useTimeSheet: true,
  timeSheetOwnerUserId: number,
  billableTargetSet: true,
  billableTargetPercent: 75,
  ...extra,
});

let resources: ReturnType<typeof person>[] = [];
// Hours per resource number this period: [total, billable], all on one day
let hours: Record<string, [number, number]> = {};
let projectsUnavailable = false;

const loadTeamHours = vi.fn();

vi.mock('@/services/bc', async () => {
  const utils = await vi.importActual<typeof import('@/utils')>('@/utils');
  return {
    ExtensionNotInstalledError: class ExtensionNotInstalledError extends Error {},
    loadTeamHours: (from: Date, to: Date) => {
      loadTeamHours(from, to);
      const uoms = utils.buildUOMConversionMap(
        resources.map((r) => ({
          resourceNo: r.number,
          code: 'HOUR',
          qtyPerUnitOfMeasure: 7.5,
        })) as import('@/types').BCResourceUnitOfMeasure[]
      );
      return Promise.resolve({
        projectsUnavailable,
        people: resources.map((resource) => {
          const weekly = utils.resolveWeeklyCapacity(resource, uoms, 40);
          const [total, billable] = hours[resource.number] ?? [0, 0];
          const date = utils.formatDate(from);
          const entry = (id: string, h: number, isBillable: boolean) => ({
            id,
            projectId: 'PR-CONTOSO',
            taskId: '1000',
            userId: resource.number,
            date,
            hours: h,
            isBillable,
            isRunning: false,
            createdAt: '',
            updatedAt: '',
          });
          return {
            resource,
            capacity: weekly.hours,
            weekly,
            stages: { ...utils.emptyStageHours(), unsubmitted: total, total },
            billableHours: billable,
            entries: [
              ...(billable > 0 ? [entry(`${resource.number}-b`, billable, true)] : []),
              ...(total > billable ? [entry(`${resource.number}-n`, total - billable, false)] : []),
            ],
          };
        }),
      });
    },
    bcClient: { tenantId: 'tenant', environment: 'Sandbox' },
  };
});

vi.mock('@/services/bc/bcClient', () => ({
  bcClient: { getThymeSetup: vi.fn(async () => ({ id: 's', defaultBillableTargetPercent: 75 })) },
}));

vi.mock('@/hooks/useProjectsStore', () => ({
  useProjectsStore: () => ({ projects: [], fetchProjects: () => {} }),
}));

vi.mock('@/services/auth', () => ({
  useAuth: () => ({ account: { username: 'someone@contoso.com' } }),
  resolveResourceIdentity: vi.fn(async () => ({ photoUrl: null })),
}));

import { ReportsPanel } from '@/components/reports/ReportsPanel';
import { useBillableTargetStore } from '@/hooks/useBillableTargetStore';

const day = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** The pill under the Billable % card */
const targetPill = () => screen.findByText(/target$/, { selector: 'p' });

describe('ReportsPanel', () => {
  beforeEach(() => {
    // Only Date is faked: Tuesday 13 October 2026
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 13, 12));
    loadTeamHours.mockClear();
    projectsUnavailable = false;
    useBillableTargetStore.setState({
      companyDefaultPercent: null,
      setupAvailable: null,
      loadedForCompanyVersion: -1,
      isLoading: false,
    });
    resources = [
      person('R1', 'Alex Contoso'),
      person('R2', 'Sam Contoso', { billableTargetSet: false }),
      person('R3', 'Contoso Agent', { weeklyCapacitySet: true, weeklyCapacityHours: 0 }),
    ];
    hours = { R1: [10, 6.96], R3: [5, 1] };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('colours the billable % against target by the unrounded %, as the Team page does', async () => {
    // Only Alex counts and has hours: 69.6% against 75% is 5.4 short, so amber, even
    // though it shows as "70%"
    hours = { R1: [10, 6.96] };
    render(<ReportsPanel />);
    const pill = await targetPill();
    expect(pill).toHaveTextContent('75% team target');
    expect(pill.className).toContain('bg-yellow-500/20');
    expect(screen.getAllByText('70%').length).toBeGreaterThan(0);
  });

  it("shows the Team page's people table with capacity for the period", async () => {
    render(<ReportsPanel />);
    const table = await screen.findByRole('table');
    const alex = within(table).getByText('Alex Contoso').closest('tr')!;
    // A week: their weekly capacity (7.5h x 5)
    expect(within(alex).getByText('37.5')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Period'), { target: { value: 'thisMonth' } });
    await waitFor(() =>
      expect(
        within(screen.getByRole('table')).getByText('Alex Contoso').closest('tr')
      ).toHaveTextContent(
        // October 2026 has 22 working days: 37.5 x 22 / 5
        '165.0'
      )
    );
  });

  it('loads a whole year and breaks it down by month', async () => {
    render(<ReportsPanel />);
    await screen.findByRole('table');
    fireEvent.change(screen.getByLabelText('Period'), { target: { value: 'lastYear' } });
    await screen.findByText('Monthly Breakdown');
    const [from, to] = loadTeamHours.mock.calls.at(-1)!;
    expect([day(from), day(to)]).toEqual(['2025-01-01', '2025-12-31']);
    expect(screen.getByText('2025')).toBeInTheDocument();
  });

  it('shows one person when their name is clicked, with no target for someone not counted', async () => {
    render(<ReportsPanel />);
    const table = await screen.findByRole('table');
    fireEvent.click(within(table).getByRole('button', { name: 'Contoso Agent' }));

    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Contoso Agent/ })).toBeInTheDocument();
    // 20% billable, but a weekly capacity of 0 means no target, as on the Team page
    expect(screen.getByText('20%')).toBeInTheDocument();
    expect(screen.queryByText(/target$/, { selector: 'p' })).not.toBeInTheDocument();
  });

  it("warns when projects couldn't be loaded", async () => {
    projectsUnavailable = true;
    render(<ReportsPanel />);
    expect(await screen.findByText('Billable figures may be too high')).toBeInTheDocument();
  });
});
