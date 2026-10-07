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

function setup(hiddenKpis: string[]) {
  useProjectDetailsStore.setState({
    project: { id: 'p1', number: 'PR001', name: 'Contoso Website', isInternal: false },
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
