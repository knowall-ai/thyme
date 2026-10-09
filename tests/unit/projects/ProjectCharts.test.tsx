import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { format, startOfWeek, subWeeks } from 'date-fns';

vi.mock('@/services/bc/bcClient', () => ({
  bcClient: { getCompanyInfo: vi.fn(async () => ({ currencyCode: 'GBP' })) },
}));

vi.mock('@/services/bc/projectDetailsService', () => ({
  projectDetailsService: { getProjectDetails: vi.fn(), getProjectAnalytics: vi.fn() },
}));

vi.mock('@/hooks/usePlanStore', () => ({
  usePlanStore: { getState: () => ({ clearCache: vi.fn() }) },
}));

vi.mock('@/hooks/useProjectsStore', async () => {
  const { create } = await import('zustand');
  return { useProjectsStore: create(() => ({ projects: [], selectedProject: null })) };
});

import { ProjectCharts } from '@/components/projects/ProjectCharts';
import { useProjectDetailsStore, DEFAULT_HIDDEN_KPIS } from '@/hooks/useProjectDetailsStore';

// ISO week strings ("2026-W41") for the last few weeks, so they fall in the visible window
const isoWeek = (weeksAgo: number) =>
  format(startOfWeek(subWeeks(new Date(), weeksAgo), { weekStartsOn: 1 }), "RRRR-'W'II");

const weeklyData = [3, 2, 1, 0].map((weeksAgo, i) => ({
  week: isoWeek(weeksAgo),
  hours: 8,
  approvedHours: 8,
  pendingHours: 0,
  plannedHours: 0,
  cumulative: 8 * (i + 1),
}));

function setup(hiddenKpis: string[], startDate?: string) {
  useProjectDetailsStore.setState({
    project: { id: 'p1', number: 'PR001', name: 'Contoso Website', isInternal: false, startDate },
    analytics: {
      weeklyData,
      hoursSpent: 32,
      hoursPlanned: 80,
      estimateHours: 80,
      hoursPerDay: 8,
      invoicedPrice: 3200,
      unpostedBillable: 0,
      billablePriceBreakdown: { resource: 8000 },
    },
    isLoadingAnalytics: false,
    currencyCode: 'GBP',
    hiddenKpis,
  } as unknown as Parameters<typeof useProjectDetailsStore.setState>[0]);
  render(<ProjectCharts />);
  fireEvent.click(screen.getByRole('button', { name: 'Spend vs Budget' }));
}

const chooseUnit = (label: string) =>
  fireEvent.click(screen.getByRole('button', { name: label, pressed: false }));

describe('Spend vs Budget chart with hidden figures', () => {
  beforeEach(() => {
    useProjectDetailsStore.setState({ hiddenKpis: [...DEFAULT_HIDDEN_KPIS] });
  });

  it('draws the £ chart when Billable Price is visible', () => {
    setup([...DEFAULT_HIDDEN_KPIS]);
    chooseUnit('£');
    expect(screen.queryByText('Amounts are hidden')).toBeNull();
    expect(screen.getAllByText(/Budget: £8\.0k/).length).toBeGreaterThan(0);
  });

  it('shows an empty state instead of a flat chart when Billable Price is hidden', () => {
    setup([...DEFAULT_HIDDEN_KPIS, 'Billable Price']);
    chooseUnit('£');

    expect(screen.getByText('Amounts are hidden')).toBeTruthy();
    expect(screen.getByText('Billable Price is hidden on the cards above')).toBeTruthy();
    // No masked axis, and no figure of any kind leaks into the chart area
    expect(screen.queryByText('•••')).toBeNull();
    const chart = screen.getByRole('status');
    expect(chart.textContent).not.toMatch(/\d/);

    fireEvent.click(screen.getByRole('button', { name: 'Show amounts' }));
    expect(useProjectDetailsStore.getState().hiddenKpis).not.toContain('Billable Price');
    // Revealing one card leaves the other masks alone
    expect(useProjectDetailsStore.getState().hiddenKpis).toEqual(
      expect.arrayContaining([...DEFAULT_HIDDEN_KPIS])
    );
    expect(screen.queryByText('Amounts are hidden')).toBeNull();
    expect(screen.getAllByText(/Budget: £8\.0k/).length).toBeGreaterThan(0);
  });

  it('shows the empty state in effort mode when Estimate and Time Spent are both hidden', () => {
    setup([...DEFAULT_HIDDEN_KPIS, 'Estimate', 'Time Spent']);

    expect(screen.getByText('Effort figures are hidden')).toBeTruthy();
    expect(screen.getByText('Estimate and Time Spent are hidden on the cards above')).toBeTruthy();
    expect(screen.getByRole('status').textContent).not.toMatch(/\d/);

    fireEvent.click(screen.getByRole('button', { name: 'Show figures' }));
    const { hiddenKpis } = useProjectDetailsStore.getState();
    expect(hiddenKpis).not.toContain('Estimate');
    expect(hiddenKpis).not.toContain('Time Spent');
    expect(screen.getAllByText(/Budget: 10d/).length).toBeGreaterThan(0);
  });

  it('still draws the effort chart when only one of its cards is hidden', () => {
    setup([...DEFAULT_HIDDEN_KPIS, 'Time Spent']);
    expect(screen.queryByText('Effort figures are hidden')).toBeNull();
    expect(screen.getAllByText(/Budget: 10d/).length).toBeGreaterThan(0);
  });
});

describe('Chart time range', () => {
  const pressed = () =>
    screen.getByRole('group', { name: 'Chart time range' }).querySelector('[aria-pressed="true"]')
      ?.textContent;
  const isDisabled = (name: string | RegExp) =>
    (screen.getByRole('button', { name }) as HTMLButtonElement).disabled;

  beforeEach(() => {
    useProjectDetailsStore.setState({ hiddenKpis: [...DEFAULT_HIDDEN_KPIS] });
  });

  it('defaults to 6M and scrolls further at 1Y', () => {
    setup([...DEFAULT_HIDDEN_KPIS]);
    expect(pressed()).toBe('6M');
    expect(screen.getByRole('button', { name: 'Previous week' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '1 year' }));
    expect(pressed()).toBe('1Y');
    expect(screen.getByRole('button', { name: 'Previous 4 weeks' })).toBeTruthy();
  });

  it('disables the week navigation on All, and re-enables it on another range', () => {
    // Started a year ago, so 3M can scroll back
    setup([...DEFAULT_HIDDEN_KPIS], format(subWeeks(new Date(), 52), 'yyyy-MM-dd'));
    fireEvent.click(screen.getByRole('button', { name: 'Whole project' }));
    expect(pressed()).toBe('All');
    expect(isDisabled(/^Previous/)).toBe(true);
    expect(isDisabled(/^Next/)).toBe(true);
    expect(isDisabled('This Week')).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: '3 months' }));
    expect(pressed()).toBe('3M');
    expect(isDisabled(/^Previous/)).toBe(false);
  });

  it('stops the back arrow at the start of the project', () => {
    // Only 4 weeks of data and no dates: a 6-month window already shows it all
    setup([...DEFAULT_HIDDEN_KPIS]);
    expect(isDisabled(/^Previous/)).toBe(true);
  });

  it('drops the tooltip, rather than crashing, when the hovered week leaves the window', () => {
    setup([...DEFAULT_HIDDEN_KPIS], format(subWeeks(new Date(), 52), 'yyyy-MM-dd'));
    fireEvent.click(screen.getByRole('button', { name: '1 year' }));
    // Hover the earliest week of the year, then narrow the range so it's out of view
    const hoverColumns = document.querySelectorAll('.h-full.flex-1.cursor-pointer');
    expect(hoverColumns).toHaveLength(52);
    fireEvent.mouseEnter(hoverColumns[0]);
    expect(screen.getAllByText(/^\d+\.\d hours/)).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: '3 months' }));
    expect(screen.queryByText(/^\d+\.\d hours/)).toBeNull();
  });

  it('keeps the range when switching chart views', () => {
    setup([...DEFAULT_HIDDEN_KPIS]);
    fireEvent.click(screen.getByRole('button', { name: '3 months' }));
    fireEvent.click(screen.getByRole('button', { name: 'Hours per Week' }));
    expect(pressed()).toBe('3M');
  });
});
