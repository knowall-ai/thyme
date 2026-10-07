import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';

const person = (id: string, number: string, name: string, extra: Record<string, unknown> = {}) => ({
  id,
  number,
  name,
  displayName: name,
  type: 'Person' as const,
  useTimeSheet: true,
  timeSheetOwnerUserId: number,
  billableTargetSet: false,
  billableTargetPercent: 0,
  ...extra,
});

let resources: ReturnType<typeof person>[] = [];
// Hours logged this week per resource number (all unsubmitted, all billable)
let hours: Record<string, number> = {};

vi.mock('react-chartjs-2', () => ({ Pie: () => null }));

vi.mock('@/services/bc', async () => {
  const utils = await vi.importActual<typeof import('@/utils')>('@/utils');
  return {
    ExtensionNotInstalledError: class ExtensionNotInstalledError extends Error {},
    loadTeamHours: vi.fn(async () => {
      // Everyone works 7.5h days
      const uoms = utils.buildUOMConversionMap(
        resources.map((r) => ({
          resourceNo: r.number,
          code: 'HOUR',
          qtyPerUnitOfMeasure: 7.5,
        })) as import('@/types').BCResourceUnitOfMeasure[]
      );
      return {
        people: resources.map((resource) => {
          const weekly = utils.resolveWeeklyCapacity(resource, uoms, 40);
          const total = hours[resource.number] ?? 0;
          return {
            resource,
            capacity: weekly.hours,
            weekly,
            stages: { ...utils.emptyStageHours(), unsubmitted: total, total },
            billableHours: total,
            entries: [],
          };
        }),
      };
    }),
    bcClient: {
      tenantId: 'tenant',
      environment: 'Sandbox',
      getResourceByEmail: vi.fn(async () => null),
      getThymeSetup: vi.fn(async () => ({ id: 's', defaultBillableTargetPercent: 75 })),
    },
  };
});

vi.mock('@/services/auth', () => ({
  useAuth: () => ({ account: { username: 'someone@contoso.com' } }),
  resolveResourceIdentity: vi.fn(async () => ({ photoUrl: null })),
}));

import { TeamList } from '@/components/team';

/** The value shown on a summary card, found by its label */
const cardValue = (label: string) =>
  screen.getByText(label, { selector: 'p' }).nextElementSibling?.textContent;

describe('TeamList weekly capacity', () => {
  beforeEach(() => {
    resources = [];
    hours = {};
  });

  it('keeps the current behaviour on extensions without weekly capacity', async () => {
    resources = [person('r1', 'R9001', 'Alex Contoso')];
    render(<TeamList />);
    expect(await screen.findByText('Alex Contoso')).toBeInTheDocument();
    expect(cardValue('Team Capacity')).toBe('37.5');
    expect(screen.queryByRole('button', { name: /Edit weekly capacity/ })).toBeNull();
  });

  it("uses a part-timer's own weekly capacity and lists people on 0 without counting them", async () => {
    resources = [
      person('r1', 'R9001', 'Alex Contoso', { weeklyCapacitySet: false, weeklyCapacityHours: 0 }),
      person('r2', 'R9002', 'Sam Contoso', {
        weeklyCapacitySet: true,
        weeklyCapacityHours: 15,
        flexibleWorkingDays: true,
      }),
      person('r3', 'R9003', 'Contoso Agent', { weeklyCapacitySet: true, weeklyCapacityHours: 0 }),
    ];
    hours = { R9001: 30, R9002: 15, R9003: 12 };
    render(<TeamList />);
    expect(await screen.findByText('Sam Contoso')).toBeInTheDocument();

    // 37.5 (default) + 15 (own) + 0 (not counted); the agent's 12h aren't in the totals
    expect(cardValue('Team Capacity')).toBe('52.5');
    expect(cardValue('Total Hours')).toBe('45.0');
    expect(cardValue('Timesheet completion')).toBe('86%');

    const sam = screen.getByText('Sam Contoso').closest('tr')!;
    expect(within(sam).getByText('flexible')).toBeInTheDocument();
    expect(within(sam).getByTitle('15h a week, flexible days')).toHaveTextContent('15.0');
    expect(within(sam).getByRole('meter')).toHaveAttribute('aria-valuenow', '100');

    const agent = screen.getByTestId('team-member-not-counted');
    expect(within(agent).getByText('Contoso Agent')).toBeInTheDocument();
    expect(within(agent).queryByRole('meter')).toBeNull();
    expect(within(agent).getByTitle(/^Not counted: weekly capacity is 0/)).toHaveTextContent('0.0');
    // Their hours are still shown on their row
    expect(within(agent).getByText('12.0')).toBeInTheDocument();

    // Admins can edit everyone's capacity once the extension supports it
    expect(screen.getAllByRole('button', { name: /Edit weekly capacity/ })).toHaveLength(3);
  });
});
