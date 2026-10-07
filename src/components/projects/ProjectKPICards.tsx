'use client';

import { useState, ReactNode } from 'react';
import { useProjectDetailsStore } from '@/hooks/useProjectDetailsStore';
import { useCompanyStore } from '@/hooks';
import { Card, Modal } from '@/components/ui';
import {
  getBCJobPlanningLinesUrl,
  getBCJobLedgerEntriesUrl,
  describeFinishVsEndDate,
} from '@/utils';
import type { ResourceHours } from '@/services/bc/projectDetailsService';
import {
  ClockIcon,
  CalendarDaysIcon,
  BanknotesIcon,
  CurrencyPoundIcon,
  EyeIcon,
  EyeSlashIcon,
  InformationCircleIcon,
} from '@heroicons/react/24/outline';

// Resources listed on the Estimate and Planned cards before "+N more"
const MAX_RESOURCE_ROWS = 3;

// Per-widget visibility toggle: an Eye / Eye-slash button that masks just this
// widget's amount. Hidden from print; the PDF shows masked amounts as on screen.
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
      className="focus:ring-thyme-500 focus:ring-offset-dark-800 flex rounded text-gray-600 transition-colors hover:text-gray-400 focus:ring-1 focus:ring-offset-1 focus:outline-none print:hidden"
      aria-label={hidden ? `Show ${label} amount` : `Hide ${label} amount`}
      aria-pressed={hidden}
      title={hidden ? 'Show amount' : 'Hide amount'}
    >
      {hidden ? <EyeSlashIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
    </button>
  );
}

// Info tooltip component with styled popup (keyboard accessible)
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
    <div className="relative flex print:hidden">
      <button
        type="button"
        className="focus:ring-thyme-500 focus:ring-offset-dark-800 flex cursor-help rounded text-gray-600 hover:text-gray-400 focus:ring-1 focus:ring-offset-1 focus:outline-none"
        onMouseEnter={() => setIsOpen(true)}
        onMouseLeave={() => setIsOpen(false)}
        onFocus={() => setIsOpen(true)}
        onBlur={() => setIsOpen(false)}
        aria-label={`Info: ${title}`}
        aria-expanded={isOpen}
      >
        <InformationCircleIcon className="h-4 w-4" />
      </button>
      {isOpen && (
        <div
          role="tooltip"
          className="bg-dark-700 absolute top-6 right-0 z-20 w-64 rounded px-3 py-2 text-xs shadow-lg"
        >
          <div className="font-medium text-white">{title}</div>
          <div className="border-dark-500 mt-1 border-t pt-1">
            <div className="text-gray-300">{description}</div>
          </div>
          {formula && (
            <div className="border-dark-500 mt-1 border-t pt-1">
              <div className="text-gray-500">Formula:</div>
              <div className="text-thyme-400 font-mono">{formula}</div>
            </div>
          )}
          <div className="border-dark-500 mt-1 border-t pt-1">
            <div className="text-gray-500">Source:</div>
            <div className="text-blue-400">{source}</div>
          </div>
        </div>
      )}
    </div>
  );
}

// Format hours with days equivalent
// YYYY-MM-DD as a local date (avoids the UTC shift of new Date('YYYY-MM-DD'))
function formatPlanDate(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

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
  // Which card's full resource list is open ('Estimate' or 'Planned'), if any
  const [resourceDialog, setResourceDialog] = useState<string | null>(null);
  const { analytics, isLoadingAnalytics, currencyCode, project, hiddenKpis, toggleKpiHidden } =
    useProjectDetailsStore();
  const selectedCompany = useCompanyStore((state) => state.selectedCompany);
  const companyName = selectedCompany?.name;
  const projectCode = project?.code;

  // Per-widget amount visibility, keyed by KPI label (shared via the store so the
  // Spend vs Budget chart and PDF export follow the same Eye toggles)
  const hiddenCards = new Set(hiddenKpis);
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
  const hoursPosted = analytics?.hoursPosted ?? 0;
  // Time Spent by stage, each counted once: Unsubmitted → Submitted → Approved (not yet posted) → Posted
  const submittedHours = analytics?.submittedHours ?? 0;
  const unsubmittedHours = analytics?.unsubmittedHours ?? 0;
  const postedHours = Math.min(hoursPosted, analytics?.approvedHours ?? 0);
  const approvedUnpostedHours = Math.max(0, (analytics?.approvedHours ?? 0) - postedHours);
  const hoursPerDay = analytics?.hoursPerDay ?? 8; // From BC Resource Unit of Measure
  // Estimate (quoted, Billable lines) is the budget; Spent + future Planned = Forecast
  const estimateHours = analytics?.estimateHours ?? 0;
  const hasEstimate = estimateHours > 0;
  const futurePlannedHours = analytics?.futurePlannedHours ?? 0;
  const forecastHours = hoursSpent + futurePlannedHours;
  const forecastVsEstimate = forecastHours - estimateHours;
  const percentOfEstimate = hasEstimate ? Math.round((hoursSpent / estimateHours) * 100) : 0;
  // When the planned work finishes, and how that sits against the project's end date
  const forecastEndDate = futurePlannedHours > 0 ? analytics?.forecastEndDate : undefined;
  const finishVsEnd = describeFinishVsEndDate(forecastEndDate, project?.endDate);

  // Time KPIs (4 cards): Estimate, Spent, Planned (future), Forecast
  // What each KPI means, shown in its (i) tooltip next to the Eye toggle
  // Hours per day can be a derived average, so round it for display
  const hoursPerDayLabel = Number(hoursPerDay.toFixed(2));
  const kpiInfo: Record<
    string,
    { title: string; description: string; formula?: string; source: string }
  > = {
    Estimate: {
      title: 'Estimate',
      description: `The quoted time: Resource lines on Job Planning Lines where lineType is "Billable" or "Both Budget and Billable" (the same lines as Billable Price). This is the budget the project is tracked against. Days = hours ÷ ${hoursPerDayLabel}.`,
      formula: 'Σ quantity (Billable Resource lines)',
      source: 'BC API: /jobPlanningLines → quantity',
    },
    'Time Spent': {
      title: 'Time Spent',
      description: `Total hours logged in timesheets for this project, shown against the Estimate and split by stage: Unsubmitted (Open timesheets), Submitted (awaiting approval), Approved (awaiting "Post Time Sheets" in BC) and Posted (in the Job Ledger Entry). Days = hours ÷ ${hoursPerDayLabel}.`,
      formula: 'Posted + Approved + Submitted + Unsubmitted = Time Spent',
      source: 'BC API: /timeSheetDetails → quantity',
    },
    Planned: {
      title: 'Planned',
      description: `Work still planned from next week on: Resource lines with lineType "Budget" on Job Planning Lines (the Plan screen's weekly allocations), in weeks after the current one. Days = hours ÷ ${hoursPerDayLabel}.`,
      formula: 'Σ quantity (Budget Resource lines, after this week)',
      source: 'BC API: /jobPlanningLines → quantity (by planningDate)',
    },
    Forecast: {
      title: 'Forecast',
      description: `Where the project is heading: time spent so far plus the work still planned, compared with the Estimate. Finishes on the last planned date (the latest Resource line with hours and lineType "Budget" or "Both Budget and Billable" after this week), compared with the project's end date. Days = hours ÷ ${hoursPerDayLabel}.`,
      formula: 'Time Spent + Planned (from next week)',
      source: 'Calculated',
    },
    'Budget Cost': {
      title: 'Budget Cost (Internal)',
      description:
        'Internal cost budget from Job Planning Lines. This is what the project is expected to cost the company. Broken down by Resource (labour), Item (materials), and G/L Account (overhead).',
      formula: 'quantity × unitCost',
      source: 'BC API: /jobPlanningLines → totalCost',
    },
    'Actual Cost': {
      title: 'Actual Cost (Internal)',
      description:
        "Internal cost incurred from posted Job Ledger Entries. Calculated when timesheets are posted using each Resource's Unit Cost. Shows £0 if timesheets are approved but not yet posted.",
      formula: 'posted hours × Resource Unit Cost',
      source: 'BC API: /timeEntries → totalCost',
    },
    'Billable Price': {
      title: 'Billable Price (Customer)',
      description:
        'Customer quote/expected revenue from Job Planning Lines. This is what the customer is expected to pay. Only includes lines where lineType is "Billable" or "Both Budget and Billable".',
      formula: 'quantity × unitPrice',
      source: 'BC API: /jobPlanningLines → totalPrice',
    },
    'Invoiced Price': {
      title: 'Invoiced Price (Customer)',
      description:
        "Amount actually invoiced to the customer from Job Ledger Entry. Calculated when timesheets are posted using each Resource's Unit Price.",
      formula: 'posted hours × Resource Unit Price',
      source: 'BC API: /timeEntries → totalPrice',
    },
  };

  // Within rounding (0.0h shown) counts as on the estimate, not over or under it
  const onEstimate = Math.abs(forecastVsEstimate) < 0.05;
  const hoursKpis: {
    label: string;
    value: string;
    subLabel: string;
    detail?: string;
    detailColor?: string;
    icon: typeof ClockIcon;
    color: string;
    subLabelColor?: string;
    progress?: number;
    progressColor?: string;
    segments?: { label: string; hours: number; color: string }[];
    resources?: ResourceHours[];
  }[] = [
    {
      label: 'Estimate',
      value: hasEstimate ? formatHoursWithDays(estimateHours, hoursPerDay) : 'N/A',
      subLabel: hasEstimate ? 'Quoted on Billable lines' : 'No estimate on Billable lines',
      resources: analytics?.estimateByResource,
      icon: CalendarDaysIcon,
      color: 'text-blue-400',
    },
    {
      label: 'Time Spent',
      value: formatHoursWithDays(hoursSpent, hoursPerDay),
      subLabel: hasEstimate
        ? `${percentOfEstimate}% of ${formatHoursWithDays(estimateHours, hoursPerDay)} estimate`
        : 'From timesheets',
      subLabelColor: percentOfEstimate > 100 ? 'text-red-400' : undefined,
      icon: ClockIcon,
      color: 'text-thyme-400',
      // Same colours as the Hours per Week bars; posted is the darker, settled green
      segments: [
        { label: 'Posted', hours: postedHours, color: 'bg-thyme-700' },
        { label: 'Approved', hours: approvedUnpostedHours, color: 'bg-thyme-500' },
        { label: 'Submitted', hours: submittedHours, color: 'bg-amber-500' },
        { label: 'Unsubmitted', hours: unsubmittedHours, color: 'bg-amber-500/40' },
      ],
    },
    {
      label: 'Planned',
      value: formatHoursWithDays(futurePlannedHours, hoursPerDay),
      subLabel: 'Still to do, from next week',
      resources: analytics?.futurePlannedByResource,
      icon: CalendarDaysIcon,
      color: 'text-gray-400',
    },
    {
      label: 'Forecast',
      value: formatHoursWithDays(forecastHours, hoursPerDay),
      subLabel: !hasEstimate
        ? 'Spent + planned'
        : onEstimate
          ? 'On estimate'
          : forecastVsEstimate > 0
            ? `▲ ${formatHoursWithDays(forecastVsEstimate, hoursPerDay)} over estimate`
            : `▼ ${formatHoursWithDays(-forecastVsEstimate, hoursPerDay)} under estimate`,
      icon: ClockIcon,
      color:
        hasEstimate && forecastVsEstimate > 0 && !onEstimate ? 'text-red-400' : 'text-green-400',
      subLabelColor: !hasEstimate
        ? undefined
        : onEstimate
          ? 'text-gray-400'
          : forecastVsEstimate > 0
            ? 'text-red-400'
            : 'text-green-400',
      detail: forecastEndDate
        ? `Finishes ${formatPlanDate(forecastEndDate)}${finishVsEnd ? ` · ${finishVsEnd.text}` : ''}`
        : undefined,
      detailColor: finishVsEnd?.isLate ? 'text-amber-400' : undefined,
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
              <div className="absolute top-3 right-3 flex items-center gap-1.5">
                <VisibilityToggle
                  hidden={isHidden}
                  onToggle={() => toggleKpiHidden(kpi.label)}
                  label={kpi.label}
                />
                {kpiInfo[kpi.label] && <InfoTooltip {...kpiInfo[kpi.label]} />}
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
                  {/* Sub-lines carry figures too, so they're masked with the value */}
                  <p className={`mt-1 text-xs ${kpi.subLabelColor ?? 'text-gray-500'}`}>
                    {isHidden ? 'Hidden' : kpi.subLabel}
                  </p>
                  {/* Who the hours belong to: top few by hours, then a count of the rest */}
                  {kpi.resources && kpi.resources.length > 0 && !isHidden && (
                    <div className="mt-1.5 space-y-0.5 text-xs text-gray-500">
                      {kpi.resources.slice(0, MAX_RESOURCE_ROWS).map((res) => (
                        <div key={res.resourceNo} className="flex justify-between gap-2">
                          <span className="truncate">{res.name}</span>
                          <span className="shrink-0">
                            {formatHoursWithDays(res.hours, hoursPerDay)}
                          </span>
                        </div>
                      ))}
                      {
                        <button
                          type="button"
                          onClick={() => setResourceDialog(kpi.label)}
                          className="text-thyme-400 hover:text-thyme-300 focus-visible:ring-thyme-500 rounded hover:underline focus:outline-none focus-visible:ring-1"
                        >
                          {kpi.resources.length > MAX_RESOURCE_ROWS
                            ? `+${kpi.resources.length - MAX_RESOURCE_ROWS} more`
                            : 'Details'}
                        </button>
                      }
                    </div>
                  )}
                  {kpi.segments && !isHidden && (
                    <>
                      {/* Stacked bar against the estimate (or total spent, if over or no estimate) */}
                      <div className="bg-dark-600 mt-2 flex h-1.5 w-full overflow-hidden rounded-full">
                        {kpi.segments.map((seg) => (
                          <div
                            key={seg.label}
                            className={`h-full transition-all ${seg.color}`}
                            style={{
                              width: `${(seg.hours / Math.max(estimateHours, hoursSpent, 1)) * 100}%`,
                            }}
                          />
                        ))}
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-500">
                        {kpi.segments.map((seg) => (
                          <span key={seg.label} className="flex items-center gap-1">
                            <span className={`inline-block h-2 w-2 rounded-sm ${seg.color}`} />
                            {seg.label} {formatHoursWithDays(seg.hours, hoursPerDay)}
                          </span>
                        ))}
                      </div>
                    </>
                  )}
                  {kpi.progress !== undefined && !isHidden && (
                    <div className="bg-dark-600 mt-2 h-1.5 w-full overflow-hidden rounded-full">
                      <div
                        className={`h-full rounded-full transition-all ${kpi.progressColor}`}
                        style={{ width: `${kpi.progress}%` }}
                      />
                    </div>
                  )}
                  {kpi.detail && !isHidden && (
                    <p className={`mt-1.5 text-xs ${kpi.detailColor ?? 'text-gray-500'}`}>
                      {kpi.detail}
                    </p>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Row 2: Financials (4 cards matching BC) - printed as shown, with hidden amounts masked */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 print:grid-cols-4">
        {financialKpis.map((kpi) => {
          const isHidden = hiddenCards.has(kpi.label);
          const breakdown = kpi.breakdown;
          return (
            <Card key={kpi.label} variant="bordered" className="relative p-4">
              <div className="absolute top-3 right-3 flex items-center gap-1.5">
                <VisibilityToggle
                  hidden={isHidden}
                  onToggle={() => toggleKpiHidden(kpi.label)}
                  label={kpi.label}
                />
                {kpiInfo[kpi.label] && <InfoTooltip {...kpiInfo[kpi.label]} />}
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

      {/* Full resource list behind a card's "+N more" */}
      {(() => {
        const kpi = hoursKpis.find((k) => k.label === resourceDialog);
        if (!kpi?.resources) return null;
        const total = kpi.resources.reduce((sum, res) => sum + res.hours, 0);
        const isPlanned = kpi.label === 'Planned';
        return (
          <Modal
            isOpen
            onClose={() => setResourceDialog(null)}
            title={isPlanned ? 'Planned: people (from next week)' : 'Estimate: resources'}
            size="lg"
          >
            <table className="w-full text-sm">
              <thead>
                <tr className="border-dark-600 border-b text-left text-xs text-gray-500">
                  <th className="py-2 font-medium">{isPlanned ? 'Person' : 'Resource'}</th>
                  <th className="py-2 text-right font-medium">Hours</th>
                  <th className="py-2 text-right font-medium">Days</th>
                  <th className="py-2 text-right font-medium">Share</th>
                  {isPlanned && <th className="py-2 text-right font-medium">Planned until</th>}
                </tr>
              </thead>
              <tbody>
                {kpi.resources.map((res) => (
                  <tr key={res.resourceNo} className="border-dark-700 border-b text-gray-300">
                    <td className="py-2">
                      {res.name}
                      {res.name !== res.resourceNo && (
                        <span className="ml-2 text-xs text-gray-500">{res.resourceNo}</span>
                      )}
                    </td>
                    <td className="py-2 text-right">{res.hours.toFixed(1)}h</td>
                    <td className="py-2 text-right">{(res.hours / hoursPerDay).toFixed(1)}d</td>
                    <td className="py-2 text-right text-gray-500">
                      {total > 0 ? Math.round((res.hours / total) * 100) : 0}%
                    </td>
                    {isPlanned && (
                      <td className="py-2 text-right text-gray-500">
                        {res.lastDate ? formatPlanDate(res.lastDate) : '–'}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-medium text-white">
                  <td className="py-2">Total</td>
                  <td className="py-2 text-right">{total.toFixed(1)}h</td>
                  <td className="py-2 text-right">{(total / hoursPerDay).toFixed(1)}d</td>
                  <td />
                  {isPlanned && <td />}
                </tr>
              </tfoot>
            </table>
          </Modal>
        );
      })()}
    </div>
  );
}
