import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';

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

import { ProjectKPICards } from '@/components/projects/ProjectKPICards';
import { useProjectDetailsStore, DEFAULT_HIDDEN_KPIS } from '@/hooks/useProjectDetailsStore';

const breakdown = (resource: number, ai = 0) => ({
  resource,
  ai,
  item: 0,
  glAccount: 0,
  total: resource + ai,
});

function setup({
  invoicedPriceLCY,
  actualCost,
  aiCost = 37.5,
  projectCurrencyCode = 'GBP',
  hiddenKpis = [] as string[],
}: {
  invoicedPriceLCY: number;
  actualCost: number;
  aiCost?: number;
  projectCurrencyCode?: string;
  hiddenKpis?: string[];
}) {
  useProjectDetailsStore.setState({
    project: { id: 'p1', code: 'PR001', name: 'Contoso Website', isInternal: false },
    analytics: {
      hoursSpent: 40,
      timesheetPostedHours: 40,
      hoursPerDay: 8,
      estimateHours: 80,
      actualCost,
      actualCostBreakdown: breakdown(actualCost - aiCost, aiCost),
      invoicedPrice: invoicedPriceLCY,
      invoicedPriceBreakdown: breakdown(invoicedPriceLCY),
      invoicedPriceLCY,
    },
    isLoadingAnalytics: false,
    currencyCode: 'GBP',
    projectCurrencyCode,
    hiddenKpis,
  } as unknown as Parameters<typeof useProjectDetailsStore.setState>[0]);
  render(<ProjectKPICards />);
}

const card = (label: string) =>
  within(screen.getByTestId(`kpi-card-${label.toLowerCase().replace(/\s+/g, '-')}`));

describe('financial KPI cards', () => {
  it('shows the AI line in the Actual Cost breakdown', () => {
    setup({ invoicedPriceLCY: 4000, actualCost: 3000 });
    const actual = card('Actual Cost');
    expect(actual.getByText('AI:')).toBeInTheDocument();
    expect(actual.getByText('£37.50')).toBeInTheDocument();
    expect(actual.getByText('£2,962.50')).toBeInTheDocument(); // Resource: people's time
  });

  it('shows the margin on Invoiced Price: Invoiced − Actual Cost and %, green when positive', () => {
    setup({ invoicedPriceLCY: 4000, actualCost: 3000 });
    const margin = card('Invoiced Price').getByText('Margin £1,000.00 · 25.0%');
    expect(margin).toHaveClass('text-green-400');
  });

  it('shows a negative margin in red', () => {
    setup({ invoicedPriceLCY: 1000, actualCost: 1250 });
    expect(card('Invoiced Price').getByText('Margin -£250.00 · -25.0%')).toHaveClass(
      'text-red-400'
    );
  });

  it('works the margin out in the company currency for a project in another currency', () => {
    setup({ invoicedPriceLCY: 4000, actualCost: 3000, projectCurrencyCode: 'EUR' });
    expect(card('Invoiced Price').getByText('Margin £1,000.00 · 25.0%')).toBeInTheDocument();
  });

  it('hides the margin with the internal costs by default, until Actual Cost is shown', () => {
    setup({ invoicedPriceLCY: 4000, actualCost: 3000, hiddenKpis: [...DEFAULT_HIDDEN_KPIS] });
    expect(card('Invoiced Price').queryByText(/^Margin/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Show Actual Cost amount' }));
    expect(card('Invoiced Price').getByText(/^Margin/)).toBeInTheDocument();
  });

  it("hides the margin with the Invoiced Price card's own Eye toggle", () => {
    setup({ invoicedPriceLCY: 4000, actualCost: 3000, hiddenKpis: ['Invoiced Price'] });
    expect(card('Invoiced Price').queryByText(/^Margin/)).not.toBeInTheDocument();
  });
});
