'use client';

import { useState, ReactNode } from 'react';
import { useProjectDetailsStore } from '@/hooks/useProjectDetailsStore';
import { useCompanyStore } from '@/hooks';
import { Card } from '@/components/ui';
import { cn, getBCJobPlanningLinesUrl, getBCJobLedgerEntriesUrl } from '@/utils';
import {
  ClockIcon,
  CalendarDaysIcon,
  BanknotesIcon,
  CurrencyPoundIcon,
  EyeIcon,
  EyeSlashIcon,
} from '@heroicons/react/24/outline';

// Per-widget visibility toggle: an Eye / Eye-slash button that masks just this
// widget's amount. Hidden from print (the PDF export controls its own masking).
function VisibilityToggle({
  hidden,
  onToggle,
  label,
}: {
  hidden: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="focus:ring-thyme-500 focus:ring-offset-dark-800 rounded text-gray-600 transition-colors hover:text-gray-400 focus:ring-1 focus:ring-offset-1 focus:outline-none print:hidden"
      aria-label={hidden ? `Show ${label} amount` : `Hide ${label} amount`}
      aria-pressed={hidden}
      title={hidden ? 'Show amount' : 'Hide amount'}
    >
      {hidden ? <EyeSlashIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
    </button>
  );
}

// Format hours with days equivalent
function formatHoursWithDays(hours: number, hoursPerDay: number): string {
  const days = hours / hoursPerDay;
  if (hours === 0) return '0h (0d)';
  return `${hours.toFixed(1)}h (${days.toFixed(1)}d)`;
}

// Format currency using the company's currency code from BC
function formatCurrency(amount: number, currencyCode: string): string {
  // Map currency code to locale for proper formatting
  const localeMap: Record<string, string> = {
    GBP: 'en-GB',
    USD: 'en-US',
    EUR: 'de-DE',
    CAD: 'en-CA',
    AUD: 'en-AU',
  };
  const locale = localeMap[currencyCode] || 'en-GB';

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currencyCode,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function ProjectKPICards() {
  const { analytics, isLoadingAnalytics, showPrices, currencyCode, project } =
    useProjectDetailsStore();
  const selectedCompany = useCompanyStore((state) => state.selectedCompany);
  const companyName = selectedCompany?.name;
  const projectCode = project?.code;

  // Per-widget amount visibility. Keyed by KPI label; resets on reload (not persisted).
  const [hiddenCards, setHiddenCards] = useState<Set<string>>(new Set());
  const toggleCardHidden = (label: string) =>
    setHiddenCards((prev) => {
      const next = new Set(prev);
      if (next.has(label)) {
        next.delete(label);
      } else {
        next.add(label);
      }
      return next;
    });
  const maskedValue = '•••••';

  if (isLoadingAnalytics) {
    return (
      <div className="space-y-4">
        {/* Hours row skeleton (4 cards) */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} variant="bordered" className="animate-pulse p-4">
              <div className="bg-dark-600 h-20 rounded" />
            </Card>
          ))}
        </div>
        {/* Financials row skeleton (4 cards) */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[5, 6, 7, 8].map((i) => (
            <Card key={i} variant="bordered" className="animate-pulse p-4">
              <div className="bg-dark-600 h-20 rounded" />
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
  const hoursPerDay = analytics?.hoursPerDay ?? 8; // From BC Resource Unit of Measure
  const hoursRemaining = hoursPlanned - hoursSpent;
  const hasPlannedHours = hoursPlanned > 0;
  const percentUsed = hasPlannedHours ? Math.round((hoursSpent / hoursPlanned) * 100) : 0;

  // Time KPIs (4 cards - always visible) - Reordered: Budgeted, Spent, Unposted, Posted
  const hoursKpis = [
    {
      label: 'Time Budgeted',
      value: hasPlannedHours ? formatHoursWithDays(hoursPlanned, hoursPerDay) : 'N/A',
      subLabel: hasPlannedHours
        ? `${formatHoursWithDays(hoursRemaining, hoursPerDay)} remaining`
        : 'No budget set in BC',
      icon: CalendarDaysIcon,
      color: hoursRemaining < 0 ? 'text-red-400' : 'text-blue-400',
    },
    {
      label: 'Time Spent',
      value: formatHoursWithDays(hoursSpent, hoursPerDay),
      subLabel: hasPlannedHours
        ? `${percentUsed}% of ${formatHoursWithDays(hoursPlanned, hoursPerDay)} budgeted`
        : 'From timesheets',
      icon: ClockIcon,
      color: 'text-thyme-400',
      progress: hasPlannedHours ? Math.min(percentUsed, 100) : undefined,
      progressColor:
        percentUsed > 100 ? 'bg-red-500' : percentUsed > 80 ? 'bg-amber-500' : 'bg-thyme-500',
    },
    {
      label: 'Time Unposted',
      value: formatHoursWithDays(hoursUnposted, hoursPerDay),
      subLabel: hoursUnposted > 0 ? 'In timesheets, not posted' : 'All time posted',
      icon: ClockIcon,
      color: hoursUnposted > 0 ? 'text-amber-400' : 'text-gray-500',
    },
    {
      label: 'Time Posted',
      value: formatHoursWithDays(hoursPosted, hoursPerDay),
      subLabel: 'In Job Ledger Entry',
      icon: ClockIcon,
      color: 'text-green-400',
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

  // Helper to create BC link for subLabel
  const jobPlanningLinesLink = projectCode ? (
    <>
      From{' '}
      <a
        href={getBCJobPlanningLinesUrl(projectCode, companyName)}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-400 hover:text-blue-300 hover:underline"
        onClick={(e) => e.stopPropagation()}
      >
        Job Planning Lines
      </a>
    </>
  ) : (
    'From Job Planning Lines'
  );

  const jobLedgerEntryLink = projectCode ? (
    <>
      From{' '}
      <a
        href={getBCJobLedgerEntriesUrl(projectCode, companyName)}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-400 hover:text-blue-300 hover:underline"
        onClick={(e) => e.stopPropagation()}
      >
        Job Ledger Entry
      </a>
    </>
  ) : (
    'From Job Ledger Entry'
  );

  // Financial KPIs - 4 cards matching BC structure
  // Budget Cost and Actual Cost are internal; Billable Price and Invoiced Price
  // are customer-facing. Each card's amount can be hidden individually via its
  // Eye toggle (see hiddenCards); the value/breakdown masking happens at render.
  const financialKpis: {
    label: string;
    value: string;
    subLabel: ReactNode;
    breakdown: typeof budgetBreakdown | null;
    icon: typeof BanknotesIcon;
    color: string;
    isInternal?: boolean;
  }[] = [
    {
      label: 'Budget Cost',
      value: formatCurrency(budgetCost, currencyCode),
      subLabel: jobPlanningLinesLink,
      breakdown: budgetBreakdown,
      icon: BanknotesIcon,
      color: 'text-amber-400',
      isInternal: true,
    },
    {
      label: 'Actual Cost',
      value: formatCurrency(actualCost, currencyCode),
      subLabel: jobLedgerEntryLink,
      breakdown: actualBreakdown,
      icon: BanknotesIcon,
      color: actualCost > budgetCost && budgetCost > 0 ? 'text-red-400' : 'text-amber-400',
      isInternal: true,
    },
    {
      label: 'Billable Price',
      value: formatCurrency(billablePrice, currencyCode),
      subLabel: jobPlanningLinesLink,
      breakdown: billableBreakdown,
      icon: CurrencyPoundIcon,
      color: 'text-blue-400',
    },
    {
      label: 'Invoiced Price',
      value: formatCurrency(invoicedPrice, currencyCode),
      subLabel: jobLedgerEntryLink,
      breakdown: invoicedBreakdown,
      icon: CurrencyPoundIcon,
      color: 'text-green-400',
    },
  ];

  return (
    <div className="space-y-4">
      {/* Row 1: Hours (4 cards) */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 print:grid-cols-4">
        {hoursKpis.map((kpi) => {
          const isHidden = hiddenCards.has(kpi.label);
          return (
            <Card key={kpi.label} variant="bordered" className="relative p-4">
              <div className="absolute top-3 right-3">
                <VisibilityToggle
                  hidden={isHidden}
                  onToggle={() => toggleCardHidden(kpi.label)}
                  label={kpi.label}
                />
              </div>
              <div className="flex items-start gap-3">
                <div
                  className={`bg-dark-600 rounded-lg p-2 ${kpi.color} ${isHidden ? 'opacity-50' : ''}`}
                >
                  <kpi.icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-gray-400">{kpi.label}</p>
                  <p className={`text-2xl font-bold ${isHidden ? 'text-gray-600' : 'text-white'}`}>
                    {isHidden ? maskedValue : kpi.value}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">{kpi.subLabel}</p>
                  {kpi.progress !== undefined && !isHidden && (
                    <div className="bg-dark-600 mt-2 h-1.5 w-full overflow-hidden rounded-full">
                      <div
                        className={`h-full rounded-full transition-all ${kpi.progressColor}`}
                        style={{ width: `${kpi.progress}%` }}
                      />
                    </div>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Row 2: Financials (4 cards matching BC) - hidden in print only for "Without Financials" export */}
      <div
        className={cn(
          'grid gap-4 sm:grid-cols-2 lg:grid-cols-4 print:grid-cols-4',
          !showPrices && 'print:hidden'
        )}
      >
        {financialKpis.map((kpi) => {
          const isHidden = hiddenCards.has(kpi.label);
          const breakdown = kpi.breakdown;
          return (
            <Card key={kpi.label} variant="bordered" className="relative p-4">
              <div className="absolute top-3 right-3">
                <VisibilityToggle
                  hidden={isHidden}
                  onToggle={() => toggleCardHidden(kpi.label)}
                  label={kpi.label}
                />
              </div>
              <div className="flex items-start gap-3">
                <div
                  className={`bg-dark-600 rounded-lg p-2 ${kpi.color} ${isHidden ? 'opacity-50' : ''}`}
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
                    {isHidden ? maskedValue : kpi.value}
                  </p>
                  {/* Breakdown by type - always show all 3 lines */}
                  {breakdown && !isHidden && (
                    <div className="mt-1 space-y-0.5 text-xs text-gray-500">
                      <div className="flex justify-between">
                        <span>Resource:</span>
                        <span>{formatCurrency(breakdown.resource, currencyCode)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Item:</span>
                        <span>{formatCurrency(breakdown.item, currencyCode)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>G/L Account:</span>
                        <span>{formatCurrency(breakdown.glAccount, currencyCode)}</span>
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
