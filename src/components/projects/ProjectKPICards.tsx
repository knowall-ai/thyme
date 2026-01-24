'use client';

import { useState } from 'react';
import { useProjectDetailsStore } from '@/hooks/useProjectDetailsStore';
import { Card } from '@/components/ui';
import {
  ClockIcon,
  CalendarDaysIcon,
  BanknotesIcon,
  CurrencyPoundIcon,
  InformationCircleIcon,
} from '@heroicons/react/24/outline';

// Info tooltip component with styled popup
function InfoTooltip({
  title,
  description,
  source,
  formula,
}: {
  title: string;
  description: string;
  source: string;
  formula?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      <div
        className="cursor-help text-gray-600 hover:text-gray-400"
        onMouseEnter={() => setIsOpen(true)}
        onMouseLeave={() => setIsOpen(false)}
      >
        <InformationCircleIcon className="h-4 w-4" />
      </div>
      {isOpen && (
        <div className="absolute right-0 top-6 z-20 w-64 rounded bg-dark-700 px-3 py-2 text-xs shadow-lg">
          <div className="font-medium text-white">{title}</div>
          <div className="mt-1 border-t border-dark-500 pt-1">
            <div className="text-gray-300">{description}</div>
          </div>
          {formula && (
            <div className="mt-1 border-t border-dark-500 pt-1">
              <div className="text-gray-500">Formula:</div>
              <div className="font-mono text-thyme-400">{formula}</div>
            </div>
          )}
          <div className="mt-1 border-t border-dark-500 pt-1">
            <div className="text-gray-500">Source:</div>
            <div className="text-blue-400">{source}</div>
          </div>
        </div>
      )}
    </div>
  );
}

// Format currency (assumes GBP for now, but could be made configurable)
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function ProjectKPICards() {
  const { analytics, isLoadingAnalytics, showCosts } = useProjectDetailsStore();

  if (isLoadingAnalytics) {
    return (
      <div className="space-y-4">
        {/* Hours row skeleton (4 cards) */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} variant="bordered" className="animate-pulse p-4">
              <div className="h-20 rounded bg-dark-600" />
            </Card>
          ))}
        </div>
        {/* Financials row skeleton (4 cards) */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[5, 6, 7, 8].map((i) => (
            <Card key={i} variant="bordered" className="animate-pulse p-4">
              <div className="h-20 rounded bg-dark-600" />
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // Calculate percentages and status
  const hoursSpent = analytics?.hoursSpent ?? 0;
  const hoursPlanned = analytics?.hoursPlanned ?? 0;
  const hoursPosted = analytics?.hoursPosted ?? 0;
  const hoursUnposted = analytics?.hoursUnposted ?? 0;
  const hoursRemaining = hoursPlanned - hoursSpent;
  const hasPlannedHours = hoursPlanned > 0;
  const percentUsed = hasPlannedHours ? Math.round((hoursSpent / hoursPlanned) * 100) : 0;

  // Hours KPIs (4 cards - always visible)
  const hoursKpis = [
    {
      label: 'Hours Spent',
      value: `${hoursSpent.toFixed(1)}h`,
      subLabel: hasPlannedHours
        ? `${percentUsed}% of ${hoursPlanned.toFixed(0)}h planned`
        : 'From timesheets',
      icon: ClockIcon,
      color: 'text-thyme-400',
      progress: hasPlannedHours ? Math.min(percentUsed, 100) : undefined,
      progressColor:
        percentUsed > 100 ? 'bg-red-500' : percentUsed > 80 ? 'bg-amber-500' : 'bg-thyme-500',
      tooltip: {
        title: 'Hours Spent',
        description:
          'Total hours logged in timesheets for this project. Includes all timesheet statuses: Open, Submitted, and Approved.',
        source: 'BC API: /timeSheetLines → totalQuantity',
      },
    },
    {
      label: 'Hours Planned',
      value: hasPlannedHours ? `${hoursPlanned.toFixed(1)}h` : 'N/A',
      subLabel: hasPlannedHours ? `${hoursRemaining.toFixed(1)}h remaining` : 'No budget set in BC',
      icon: CalendarDaysIcon,
      color: hoursRemaining < 0 ? 'text-red-400' : 'text-blue-400',
      tooltip: {
        title: 'Hours Planned',
        description:
          'Budgeted hours from Job Planning Lines. Only includes Resource lines where lineType is "Budget" or "Both Budget and Billable".',
        source: 'BC API: /jobPlanningLines → quantity',
      },
    },
    {
      label: 'Hours Posted',
      value: `${hoursPosted.toFixed(1)}h`,
      subLabel: 'In Job Ledger Entry',
      icon: ClockIcon,
      color: 'text-green-400',
      tooltip: {
        title: 'Hours Posted',
        description:
          "Hours that have been posted to the Job Ledger Entry. Posting creates cost and price entries based on the Resource's Unit Cost and Unit Price.",
        source: 'BC API: /timeEntries → quantity',
      },
    },
    {
      label: 'Hours Unposted',
      value: `${hoursUnposted.toFixed(1)}h`,
      subLabel: hoursUnposted > 0 ? 'In timesheets, not posted' : 'All hours posted',
      icon: ClockIcon,
      color: hoursUnposted > 0 ? 'text-amber-400' : 'text-gray-500',
      tooltip: {
        title: 'Hours Unposted',
        description:
          'Hours in timesheets that have not yet been posted to the Job Ledger Entry. These hours are approved but awaiting the "Post Time Sheets" action in BC.',
        formula: 'Hours Spent − Hours Posted',
        source: 'Calculated',
      },
    },
  ];

  // Financial KPIs with breakdowns
  const budgetCost = analytics?.budgetCost ?? 0;
  const budgetBreakdown = analytics?.budgetCostBreakdown ?? {
    resource: 0,
    item: 0,
    glAccount: 0,
    total: 0,
  };
  const actualCost = analytics?.actualCost ?? 0;
  const actualBreakdown = analytics?.actualCostBreakdown ?? {
    resource: 0,
    item: 0,
    glAccount: 0,
    total: 0,
  };
  const billablePrice = analytics?.billablePrice ?? 0;
  const billableBreakdown = analytics?.billablePriceBreakdown ?? {
    resource: 0,
    item: 0,
    glAccount: 0,
    total: 0,
  };
  const invoicedPrice = analytics?.invoicedPrice ?? 0;
  const invoicedBreakdown = analytics?.invoicedPriceBreakdown ?? {
    resource: 0,
    item: 0,
    glAccount: 0,
    total: 0,
  };

  // Helper to format breakdown line
  const formatBreakdownLine = (label: string, value: number, isHidden: boolean) => {
    if (isHidden) return null;
    if (value === 0) return null;
    return `${label}: ${formatCurrency(value)}`;
  };

  // Financial KPIs - 4 cards matching BC structure
  // Budget Cost and Actual Cost are internal (hideable)
  // Billable Price and Invoiced Price are customer-facing
  const financialKpis = [
    {
      label: 'Budget Cost',
      value: showCosts ? formatCurrency(budgetCost) : '•••••',
      subLabel: showCosts ? 'From Job Planning Lines' : 'Hidden',
      breakdown: showCosts ? budgetBreakdown : null,
      icon: BanknotesIcon,
      color: 'text-amber-400',
      isInternal: true,
      isHidden: !showCosts,
      tooltip: {
        title: 'Budget Cost (Internal)',
        description:
          'Internal cost budget from Job Planning Lines. This is what the project is expected to cost the company. Broken down by Resource (labour), Item (materials), and G/L Account (overhead).',
        formula: 'quantity × unitCost',
        source: 'BC API: /jobPlanningLines → totalCost',
      },
    },
    {
      label: 'Actual Cost',
      value: showCosts ? formatCurrency(actualCost) : '•••••',
      subLabel: showCosts ? 'From Job Ledger Entry' : 'Hidden',
      breakdown: showCosts ? actualBreakdown : null,
      icon: BanknotesIcon,
      color: showCosts
        ? actualCost > budgetCost && budgetCost > 0
          ? 'text-red-400'
          : 'text-amber-400'
        : 'text-gray-500',
      isInternal: true,
      isHidden: !showCosts,
      tooltip: {
        title: 'Actual Cost (Internal)',
        description:
          "Internal cost incurred from posted Job Ledger Entries. Calculated when timesheets are posted using each Resource's Unit Cost. Shows £0 if timesheets are approved but not yet posted.",
        formula: 'posted hours × Resource Unit Cost',
        source: 'BC API: /timeEntries → totalCost',
      },
    },
    {
      label: 'Billable Price',
      value: formatCurrency(billablePrice),
      subLabel: 'From Job Planning Lines',
      breakdown: billableBreakdown,
      icon: CurrencyPoundIcon,
      color: 'text-blue-400',
      tooltip: {
        title: 'Billable Price (Customer)',
        description:
          'Customer quote/expected revenue from Job Planning Lines. This is what the customer is expected to pay. Only includes lines where lineType is "Billable" or "Both Budget and Billable".',
        formula: 'quantity × unitPrice',
        source: 'BC API: /jobPlanningLines → totalPrice',
      },
    },
    {
      label: 'Invoiced Price',
      value: formatCurrency(invoicedPrice),
      subLabel: 'From Job Ledger Entry',
      breakdown: invoicedBreakdown,
      icon: CurrencyPoundIcon,
      color: 'text-green-400',
      tooltip: {
        title: 'Invoiced Price (Customer)',
        description:
          "Amount actually invoiced to the customer from Job Ledger Entry. Calculated when timesheets are posted using each Resource's Unit Price.",
        formula: 'posted hours × Resource Unit Price',
        source: 'BC API: /timeEntries → totalPrice',
      },
    },
  ];

  return (
    <div className="space-y-4">
      {/* Row 1: Hours (4 cards) */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {hoursKpis.map((kpi) => (
          <Card key={kpi.label} variant="bordered" className="relative p-4">
            <div className="absolute right-3 top-3">
              <InfoTooltip
                title={kpi.tooltip.title}
                description={kpi.tooltip.description}
                source={kpi.tooltip.source}
                formula={'formula' in kpi.tooltip ? kpi.tooltip.formula : undefined}
              />
            </div>
            <div className="flex items-start gap-3">
              <div className={`rounded-lg bg-dark-600 p-2 ${kpi.color}`}>
                <kpi.icon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-gray-400">{kpi.label}</p>
                <p className="text-2xl font-bold text-white">{kpi.value}</p>
                <p className="mt-1 text-xs text-gray-500">{kpi.subLabel}</p>
                {kpi.progress !== undefined && (
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-dark-600">
                    <div
                      className={`h-full rounded-full transition-all ${kpi.progressColor}`}
                      style={{ width: `${kpi.progress}%` }}
                    />
                  </div>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Row 2: Financials (4 cards matching BC) */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {financialKpis.map((kpi) => {
          const isHidden = 'isHidden' in kpi && kpi.isHidden;
          const breakdown = 'breakdown' in kpi ? kpi.breakdown : null;
          return (
            <Card key={kpi.label} variant="bordered" className="relative p-4">
              <div className={`absolute right-3 top-3 ${isHidden ? 'opacity-50' : ''}`}>
                <InfoTooltip
                  title={kpi.tooltip.title}
                  description={kpi.tooltip.description}
                  source={kpi.tooltip.source}
                  formula={'formula' in kpi.tooltip ? kpi.tooltip.formula : undefined}
                />
              </div>
              <div className="flex items-start gap-3">
                <div
                  className={`rounded-lg bg-dark-600 p-2 ${kpi.color} ${isHidden ? 'opacity-50' : ''}`}
                >
                  <kpi.icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className={`text-sm ${isHidden ? 'text-gray-500' : 'text-gray-400'}`}>
                      {kpi.label}
                    </p>
                    {'isInternal' in kpi && kpi.isInternal && (
                      <span className="rounded bg-amber-900/30 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">
                        Internal
                      </span>
                    )}
                  </div>
                  <p className={`text-2xl font-bold ${isHidden ? 'text-gray-600' : 'text-white'}`}>
                    {kpi.value}
                  </p>
                  {/* Breakdown by type - always show all 3 lines */}
                  {breakdown && !isHidden && (
                    <div className="mt-1 space-y-0.5 text-xs text-gray-500">
                      <div className="flex justify-between">
                        <span>Resource:</span>
                        <span>{formatCurrency(breakdown.resource)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Item:</span>
                        <span>{formatCurrency(breakdown.item)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>G/L Account:</span>
                        <span>{formatCurrency(breakdown.glAccount)}</span>
                      </div>
                    </div>
                  )}
                  <p className="mt-1 text-xs text-gray-500">{kpi.subLabel}</p>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
