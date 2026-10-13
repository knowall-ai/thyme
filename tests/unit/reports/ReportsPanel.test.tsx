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
// More time per resource number, on any project and stage, on the period's first day
type Stage = 'posted' | 'approved' | 'submitted' | 'unsubmitted';
let extra: Record<string, { projectId: string; hours: number; billable: boolean; stage: Stage }[]> =
  {};
let projectsUnavailable = false;

// CRONUS UK Ltd.-style demo projects: two customers' and an internal one
const demoProjects = new Map([
  [
    'PR-CONTOSO',
    {
      displayName: 'Contoso Website',
      billToCustomerNo: 'C10000',
      billToCustomerName: 'Contoso Ltd.',
    },
  ],
  [
    'PR-FABRIKAM',
    {
      displayName: 'Fabrikam Rollout',
      billToCustomerNo: 'C20000',
      billToCustomerName: 'Fabrikam, Inc.',
    },
  ],
  [
    'PR-FABRIKAM-2',
    {
      displayName: 'Fabrikam Support',
      billToCustomerNo: 'C20000',
      billToCustomerName: 'Fabrikam, Inc.',
    },
  ],
  [
    'INT-ADMIN',
    { displayName: 'Admin', billToCustomerNo: 'C99999', billToCustomerName: 'CRONUS - Internal' },
  ],
]);

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
        projectsByNumber: projectsUnavailable ? new Map() : demoProjects,
        people: resources.map((resource) => {
          const weekly = utils.resolveWeeklyCapacity(resource, uoms, 40);
          const [total, billable] = hours[resource.number] ?? [0, 0];
          const date = utils.formatDate(from);
          const entry = (
            id: string,
            h: number,
            isBillable: boolean,
            projectId = 'PR-CONTOSO',
            stage: Stage = 'unsubmitted'
          ) => ({
            id,
            projectId,
            taskId: '1000',
            userId: resource.number,
            date,
            hours: h,
            isBillable,
            isRunning: false,
            createdAt: '',
            updatedAt: '',
            stages: { ...utils.emptyStageHours(), [stage]: h, total: h },
          });
          const entries = [
            ...(billable > 0 ? [entry(`${resource.number}-b`, billable, true)] : []),
            ...(total > billable ? [entry(`${resource.number}-n`, total - billable, false)] : []),
            ...(extra[resource.number] ?? []).map((e, i) =>
              entry(`${resource.number}-x${i}`, e.hours, e.billable, e.projectId, e.stage)
            ),
          ];
          return {
            resource,
            capacity: weekly.hours,
            weekly,
            stages: entries.reduce(
              (sum, e) => utils.addStageHours(sum, e.stages),
              utils.emptyStageHours()
            ),
            billableHours: entries.filter((e) => e.isBillable).reduce((sum, e) => sum + e.hours, 0),
            entries,
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

// The entries the Export button would write to the CSV
vi.mock('@/components/reports/ExportButton', () => ({
  ExportButton: ({ entries }: { entries: { id: string }[] }) => (
    <div data-testid="export-entries">{entries.map((e) => e.id).join(',')}</div>
  ),
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
    extra = {};
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

  it('keeps the table sort when another period loads', async () => {
    render(<ReportsPanel />);
    fireEvent.click(await screen.findByRole('columnheader', { name: /^Hours/ }));
    expect(screen.getByRole('columnheader', { name: /^Hours/ })).toHaveAttribute(
      'aria-sort',
      'ascending'
    );
    fireEvent.change(screen.getByLabelText('Period'), { target: { value: 'lastMonth' } });
    await waitFor(() => expect(loadTeamHours).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole('columnheader', { name: /^Hours/ })).toHaveAttribute(
      'aria-sort',
      'ascending'
    );
  });

  it("warns when projects couldn't be loaded", async () => {
    projectsUnavailable = true;
    render(<ReportsPanel />);
    expect(await screen.findByText('Billable figures may be too high')).toBeInTheDocument();
  });
});

describe('ReportsPanel client and project filters', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 13, 12));
    projectsUnavailable = false;
    useBillableTargetStore.setState({
      companyDefaultPercent: null,
      setupAvailable: null,
      loadedForCompanyVersion: -1,
      isLoading: false,
    });
    resources = [
      person('R1', 'Alex Contoso'),
      person('R2', 'Sam Contoso'),
      person('R3', 'Contoso Agent', { weeklyCapacitySet: true, weeklyCapacityHours: 0 }),
    ];
    // Alex: 10h on Contoso (unsubmitted), 4h on Fabrikam (submitted), 2h internal
    // (approved). Sam: 3h on Fabrikam's other project (posted). The agent isn't counted.
    hours = { R1: [10, 6.96], R3: [5, 1] };
    extra = {
      R1: [
        { projectId: 'PR-FABRIKAM', hours: 4, billable: true, stage: 'submitted' },
        { projectId: 'INT-ADMIN', hours: 2, billable: false, stage: 'approved' },
      ],
      R2: [{ projectId: 'PR-FABRIKAM-2', hours: 3, billable: true, stage: 'posted' }],
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** A summary card's figure, by its label */
  const cardValue = (label: string) =>
    [...document.querySelectorAll('p')].find(
      (p) => p.textContent?.startsWith(label) && p.nextElementSibling
    )?.nextElementSibling?.textContent;

  /** Opens a filter, toggles each option, and closes it */
  const pick = (menu: string, ...options: RegExp[]) => {
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${menu}:`) }));
    const group = screen.getByRole('group', { name: `Filter by ${menu}` });
    for (const option of options) {
      fireEvent.click(within(group).getByRole('button', { name: option }));
    }
    fireEvent.keyDown(group, { key: 'Escape' });
  };

  const peopleInTable = () =>
    within(screen.getByRole('table'))
      .getAllByRole('button', { name: /Contoso/ })
      .map((b) => b.textContent);

  const optionNames = (menu: string) => {
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${menu}:`) }));
    const group = screen.getByRole('group', { name: `Filter by ${menu}` });
    const names = within(group)
      .getAllByRole('button')
      .map((b) => b.textContent);
    fireEvent.keyDown(group, { key: 'Escape' });
    return names;
  };

  const breakdownText = () =>
    screen.getByText('Daily Breakdown').closest('.p-6')?.textContent ?? '';

  it('lists clients by bill-to customer, with internal projects under Internal', async () => {
    render(<ReportsPanel />);
    await screen.findByRole('table');
    expect(optionNames('Client')).toEqual([
      'All Clients',
      'Contoso Ltd.1 project',
      'Fabrikam, Inc.2 projects',
      'Internal1 project',
    ]);
  });

  it('applies a client filter to the cards, people, projects, breakdown and export', async () => {
    render(<ReportsPanel />);
    await screen.findByRole('table');
    expect(cardValue('Total Hours')).toBe('19h');
    // Capacity is shown per day without a filter
    expect(breakdownText()).toMatch(/\/ [\d.]+h/);

    pick('Client', /Fabrikam/);

    expect(cardValue('Total Hours')).toBe('7h');
    expect(cardValue('Billable Hours')).toBe('7h');
    expect(cardValue('Projects')).toBe('2');
    expect(cardValue('Billable %')).toBe('100%');
    // Targets are for all of a person's time, so there's none for one client's
    expect(screen.queryByText(/target$/, { selector: 'p' })).not.toBeInTheDocument();

    // Only the people with Fabrikam time, without completion, capacity or targets
    const table = screen.getByRole('table');
    expect(within(table).getByText('Alex Contoso')).toBeInTheDocument();
    expect(within(table).getByText('Sam Contoso')).toBeInTheDocument();
    expect(within(table).queryByText('Contoso Agent')).not.toBeInTheDocument();
    expect(within(table).getByText('Alex Contoso').closest('tr')).toHaveTextContent('4.0');
    expect(
      screen.queryByRole('columnheader', { name: /Timesheet completion/ })
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: /Capacity/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Hours on Fabrikam, Inc\. only/)).toBeInTheDocument();

    expect(screen.getByText('Fabrikam Rollout')).toBeInTheDocument();
    expect(screen.getByText('Fabrikam Support')).toBeInTheDocument();
    expect(screen.queryByText('Contoso Website')).not.toBeInTheDocument();
    // No capacity against one client's hours
    expect(breakdownText()).not.toMatch(/\/ [\d.]+h/);
    expect(screen.getByTestId('export-entries')).toHaveTextContent(/^R1-x0,R2-x0$/);
  });

  it('narrows projects to the client, and clears every filter', async () => {
    render(<ReportsPanel />);
    await screen.findByRole('table');
    expect(optionNames('Project')).toHaveLength(5);

    pick('Project', /Contoso Website/);
    expect(cardValue('Total Hours')).toBe('10h');
    expect(screen.getByRole('button', { name: 'Project: Contoso Website' })).toBeInTheDocument();

    // Another client's project can't stay picked
    pick('Client', /Fabrikam/);
    expect(
      screen.getByRole('button', { name: 'Project: All Fabrikam, Inc. Projects' })
    ).toBeInTheDocument();
    expect(optionNames('Project')).toEqual([
      'All Fabrikam, Inc. Projects',
      'Fabrikam RolloutPR-FABRIKAM',
      'Fabrikam SupportPR-FABRIKAM-2',
    ]);

    pick('Project', /Fabrikam Rollout/);
    expect(cardValue('Total Hours')).toBe('4h');
    expect(within(screen.getByRole('table')).queryByText('Sam Contoso')).not.toBeInTheDocument();
    expect(screen.getByTestId('export-entries')).toHaveTextContent(/^R1-x0$/);

    // With a person picked too, clearing goes back to everyone and everything
    pick('Resource', /Alex Contoso/);
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(cardValue('Total Hours')).toBe('19h');
    expect(screen.getByRole('button', { name: 'Client: All Clients' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Resource: All Resources' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /Timesheet completion/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument();
  });

  it('sums the hours of several clients, and lists all their projects', async () => {
    render(<ReportsPanel />);
    await screen.findByRole('table');

    fireEvent.click(screen.getByRole('button', { name: 'Client: All Clients' }));
    const group = screen.getByRole('group', { name: 'Filter by Client' });
    fireEvent.click(within(group).getByRole('button', { name: /Contoso Ltd\./ }));
    // The menu stays open for more picks, with each pick ticked
    fireEvent.click(within(group).getByRole('button', { name: /Fabrikam/ }));
    expect(within(group).getByRole('button', { name: /Contoso Ltd\./ })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(within(group).getByRole('button', { name: 'All Clients' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    fireEvent.keyDown(group, { key: 'Escape' });

    // Contoso's 10h and Fabrikam's 4h + 3h
    expect(cardValue('Total Hours')).toBe('17h');
    expect(cardValue('Projects')).toBe('3');
    const trigger = screen.getByRole('button', { name: 'Client: Contoso Ltd., Fabrikam, Inc.' });
    expect(trigger).toHaveTextContent('2 clients');
    expect(screen.getByText(/Hours on Contoso Ltd\., Fabrikam, Inc\. only/)).toBeInTheDocument();
    expect(screen.getByTestId('export-entries')).toHaveTextContent(/^R1-b,R1-n,R1-x0,R2-x0$/);
    expect(optionNames('Project')).toEqual([
      'All Projects',
      'Contoso WebsitePR-CONTOSO · Contoso Ltd.',
      'Fabrikam RolloutPR-FABRIKAM · Fabrikam, Inc.',
      'Fabrikam SupportPR-FABRIKAM-2 · Fabrikam, Inc.',
    ]);

    // "All Clients" clears the picks
    pick('Client', /^All Clients$/);
    expect(cardValue('Total Hours')).toBe('19h');
    expect(screen.getByRole('button', { name: 'Client: All Clients' })).toBeInTheDocument();
  });

  it("matches any picked project of the picked clients, dropping an unpicked client's", async () => {
    render(<ReportsPanel />);
    await screen.findByRole('table');
    pick('Client', /Contoso Ltd\./, /Fabrikam/);
    pick('Project', /Contoso Website/, /Fabrikam Rollout/);
    expect(cardValue('Total Hours')).toBe('14h');
    expect(screen.getByRole('button', { name: /^Project:/ })).toHaveTextContent('2 projects');
    expect(
      screen.getByRole('button', { name: 'Project: Contoso Website, Fabrikam Rollout' })
    ).toBeInTheDocument();

    // Contoso's no longer picked: its project goes too
    pick('Client', /Contoso Ltd\./);
    expect(cardValue('Total Hours')).toBe('4h');
    expect(screen.getByRole('button', { name: 'Project: Fabrikam Rollout' })).toBeInTheDocument();
    expect(screen.getByTestId('export-entries')).toHaveTextContent(/^R1-x0$/);
  });

  it('keeps a picked project when adding a client in a period without time on it', async () => {
    render(<ReportsPanel />);
    await screen.findByRole('table');
    pick('Client', /Fabrikam/);
    pick('Project', /Fabrikam Rollout/);
    expect(screen.getByRole('button', { name: 'Project: Fabrikam Rollout' })).toBeInTheDocument();

    // Last month has no time on Fabrikam Rollout
    extra = { R2: [{ projectId: 'PR-FABRIKAM-2', hours: 3, billable: true, stage: 'posted' }] };
    const loads = loadTeamHours.mock.calls.length;
    fireEvent.change(screen.getByLabelText('Period'), { target: { value: 'lastMonth' } });
    await waitFor(() => expect(loadTeamHours.mock.calls.length).toBeGreaterThan(loads));
    await waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument());

    // Adding Contoso keeps Fabrikam Rollout picked, so the report doesn't widen to
    // every project of both clients
    pick('Client', /Contoso Ltd\./);
    expect(screen.getByRole('button', { name: 'Project: Fabrikam Rollout' })).toBeInTheDocument();
    expect(cardValue('Total Hours')).toBe('0m');
  });

  it("shows several people's hours, table and combined target, and one person on a name click", async () => {
    resources = [
      person('R1', 'Alex Contoso'),
      person('R2', 'Sam Contoso', { billableTargetPercent: 45 }),
      person('R3', 'Contoso Agent', { weeklyCapacitySet: true, weeklyCapacityHours: 0 }),
    ];
    render(<ReportsPanel />);
    await screen.findByRole('table');
    expect(await targetPill()).toHaveTextContent(/team target$/);

    pick('Resource', /Alex Contoso/, /Sam Contoso/);
    // Alex's 16h and Sam's 3h
    expect(cardValue('Total Hours')).toBe('19h');
    const trigger = screen.getByRole('button', { name: 'Resource: Alex Contoso, Sam Contoso' });
    expect(trigger).toHaveTextContent('2 resources');
    expect(peopleInTable()).toEqual(['Alex Contoso', 'Sam Contoso']);
    // 75% and 45%, on the same capacity
    expect(await targetPill()).toHaveTextContent('60% combined target');

    // Adding someone not counted: their hours, but no say in the target
    pick('Resource', /Contoso Agent/);
    expect(cardValue('Total Hours')).toBe('24h');
    expect(trigger).toHaveTextContent('3 resources');
    expect(peopleInTable()).toHaveLength(3);
    expect(await targetPill()).toHaveTextContent('60% combined target');

    // A name in the table shows just that person's report
    fireEvent.click(within(screen.getByRole('table')).getByRole('button', { name: 'Sam Contoso' }));
    expect(screen.getByRole('button', { name: 'Resource: Sam Contoso' })).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(cardValue('Total Hours')).toBe('3h');
    expect(await targetPill()).toHaveTextContent(/^45% target$/);
  });

  it('opens with the picked option focused, moves with arrow keys and closes on Escape', async () => {
    render(<ReportsPanel />);
    await screen.findByRole('table');
    const trigger = screen.getByRole('button', { name: 'Client: All Clients' });
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const group = screen.getByRole('group', { name: 'Filter by Client' });
    expect(within(group).getByRole('button', { name: 'All Clients' })).toHaveFocus();
    fireEvent.keyDown(group, { key: 'ArrowDown' });
    expect(within(group).getByRole('button', { name: /Contoso Ltd\./ })).toHaveFocus();
    fireEvent.keyDown(group, { key: 'Escape' });
    expect(screen.queryByRole('group', { name: 'Filter by Client' })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("splits each project's hours by stage, with a legend of the stages' totals", async () => {
    render(<ReportsPanel />);
    await screen.findByRole('table');
    // Counted people only: the agent's 5h on Contoso Website are left out
    expect(screen.getByText('Posted 3h')).toBeInTheDocument();
    expect(screen.getByText('Approved 2h')).toBeInTheDocument();
    expect(screen.getByText('Submitted 4h')).toBeInTheDocument();
    expect(screen.getByText('Unsubmitted 10h')).toBeInTheDocument();
    expect(
      screen.getByText('Posted 0m · Approved 0m · Submitted 4h · Unsubmitted 0m')
    ).toBeInTheDocument();
    expect(
      screen.getByText('Posted 0m · Approved 0m · Submitted 0m · Unsubmitted 10h')
    ).toBeInTheDocument();
  });
});
