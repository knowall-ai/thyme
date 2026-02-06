'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import {
  ArrowLeftIcon,
  ArrowTopRightOnSquareIcon,
  EyeIcon,
  EyeSlashIcon,
  DocumentArrowDownIcon,
  CalendarIcon,
  InformationCircleIcon,
  ChevronDownIcon,
} from '@heroicons/react/24/outline';
import { useProjectDetailsStore } from '@/hooks/useProjectDetailsStore';
import { useCompanyStore } from '@/hooks';
import { getBCJobUrl } from '@/utils';
import { cn } from '@/utils';
import type { BillingMode } from '@/services/bc/projectDetailsService';

/**
 * Format a date string for display (e.g., "15 Jan 2025")
 */
function formatDate(dateStr?: string): string {
  if (!dateStr) return 'Unspecified';
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return 'Unspecified';
  }
}

/**
 * Get badge styling for billing mode
 */
function getBillingModeStyles(mode: BillingMode): string {
  switch (mode) {
    case 'T&M':
      return 'bg-blue-500/20 text-blue-400';
    case 'Fixed Price':
      return 'bg-purple-500/20 text-purple-400';
    case 'Mixed':
      return 'bg-amber-500/20 text-amber-400';
    case 'Not Set':
    default:
      return 'bg-gray-500/20 text-gray-400';
  }
}

/**
 * Billing mode explanations for tooltip
 */
const billingModeExplanations: Record<BillingMode, string> = {
  'T&M': 'Time & Materials - Billing based on hours worked (Resource lines in BC)',
  'Fixed Price': 'Fixed Price - Billing based on deliverables (Item/G/L Account lines in BC)',
  Mixed: 'Mixed - Combination of hourly and fixed price billing',
  'Not Set': 'No billable lines configured in Business Central',
};

interface BillingModeBadgeProps {
  mode: BillingMode;
  showTooltip?: boolean;
}

function BillingModeBadge({ mode, showTooltip = true }: BillingModeBadgeProps) {
  const [isTooltipVisible, setIsTooltipVisible] = useState(false);

  return (
    <span className="relative inline-flex items-center gap-1">
      <span className={cn('rounded px-2 py-0.5 text-xs font-medium', getBillingModeStyles(mode))}>
        {mode}
      </span>
      {showTooltip && (
        <button
          type="button"
          className="text-gray-500 hover:text-gray-400 print:hidden"
          onMouseEnter={() => setIsTooltipVisible(true)}
          onMouseLeave={() => setIsTooltipVisible(false)}
          onFocus={() => setIsTooltipVisible(true)}
          onBlur={() => setIsTooltipVisible(false)}
          aria-label="Billing mode info"
        >
          <InformationCircleIcon className="h-4 w-4" />
        </button>
      )}
      {isTooltipVisible && (
        <div className="border-dark-600 bg-dark-800 absolute top-full left-0 z-50 mt-2 w-64 rounded-lg border p-3 text-xs shadow-lg">
          <p className="font-medium text-white">{mode}</p>
          <p className="mt-1 text-gray-400">{billingModeExplanations[mode]}</p>
        </div>
      )}
    </span>
  );
}

export function ProjectHeader() {
  const { project, analytics, showCosts, setShowCosts, showPrices, setShowPrices } =
    useProjectDetailsStore();
  const selectedCompany = useCompanyStore((state) => state.selectedCompany);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  // Close export dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
        setIsExportMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!project) return null;

  const handleExportPDF = (withFinancials: boolean) => {
    setIsExportMenuOpen(false);
    const originalShowCosts = showCosts;
    const originalShowPrices = showPrices;

    // "With Financials" respects current toggle state (internal costs stay hidden if toggle is off)
    // "Without Financials" always hides costs AND unit price/total price for customer-friendly export
    if (!withFinancials) {
      // Hide both internal costs and customer-facing prices
      if (showCosts) setShowCosts(false);
      if (showPrices) setShowPrices(false);

      // Use afterprint event to restore state when print dialog closes (handles cancel too)
      const handleAfterPrint = () => {
        setShowCosts(originalShowCosts);
        setShowPrices(originalShowPrices);
        window.removeEventListener('afterprint', handleAfterPrint);
      };
      window.addEventListener('afterprint', handleAfterPrint);

      // Wait for React re-render before printing
      requestAnimationFrame(() => {
        setTimeout(() => {
          window.print();
        }, 0);
      });
    } else {
      // "With Financials" - no state change needed, print immediately
      window.print();
    }
  };

  return (
    <div className="space-y-4">
      {/* Back link */}
      <Link
        href="/projects"
        className="inline-flex items-center gap-2 text-sm text-gray-400 transition-colors hover:text-white print:hidden"
      >
        <ArrowLeftIcon className="h-4 w-4" />
        Back to Projects
      </Link>

      {/* Project header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          {/* Color indicator */}
          <div
            className="mt-1.5 h-4 w-4 shrink-0 rounded-full"
            style={{ backgroundColor: project.color }}
          />

          <div>
            <div className="flex items-center gap-3">
              <span className="font-mono text-sm text-gray-400">{project.code}</span>
              <span
                className={cn(
                  'rounded px-2 py-0.5 text-xs font-medium',
                  project.status === 'active'
                    ? 'bg-green-500/20 text-green-400'
                    : project.status === 'completed'
                      ? 'bg-gray-500/20 text-gray-400'
                      : 'bg-amber-500/20 text-amber-400'
                )}
              >
                {project.status}
              </span>
              {analytics?.billingMode && <BillingModeBadge mode={analytics.billingMode} />}
            </div>
            <h1 className="mt-1 text-2xl font-bold text-white">{project.name}</h1>
            {project.customerName && <p className="mt-1 text-gray-400">{project.customerName}</p>}
            {/* Project dates */}
            <div className="mt-2 flex items-center gap-4 text-sm text-gray-500">
              <div className="flex items-center gap-1.5">
                <CalendarIcon className="h-4 w-4" />
                <span>Start: {formatDate(project.startDate)}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CalendarIcon className="h-4 w-4" />
                <span>End: {formatDate(project.endDate)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          {/* Cost visibility toggle - hidden in print */}
          <button
            onClick={() => setShowCosts(!showCosts)}
            className={cn(
              'flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors print:hidden',
              showCosts
                ? 'border-amber-500/50 bg-amber-900/20 text-amber-400 hover:bg-amber-900/30'
                : 'border-dark-600 bg-dark-700 text-gray-400 hover:border-gray-500 hover:text-gray-300'
            )}
            title={showCosts ? 'Hide internal costs' : 'Show internal costs'}
          >
            {showCosts ? (
              <>
                <EyeIcon className="h-4 w-4" />
                <span className="hidden sm:inline">Costs visible</span>
              </>
            ) : (
              <>
                <EyeSlashIcon className="h-4 w-4" />
                <span className="hidden sm:inline">Costs hidden</span>
              </>
            )}
          </button>

          {/* PDF Export dropdown - hidden in print */}
          <div className="relative print:hidden" ref={exportMenuRef}>
            <button
              onClick={() => setIsExportMenuOpen(!isExportMenuOpen)}
              className="border-dark-600 bg-dark-700 hover:border-thyme-500/50 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm text-gray-300 transition-colors hover:text-white"
              title="Export to PDF"
            >
              <DocumentArrowDownIcon className="h-4 w-4" />
              <span className="hidden sm:inline">Export PDF</span>
              <ChevronDownIcon
                className={cn('h-4 w-4 transition-transform', isExportMenuOpen && 'rotate-180')}
              />
            </button>

            {/* Export dropdown menu */}
            {isExportMenuOpen && (
              <div className="border-dark-700 bg-dark-800 absolute top-full right-0 z-50 mt-2 w-48 rounded-lg border py-1 shadow-lg">
                <button
                  onClick={() => handleExportPDF(true)}
                  className="text-dark-300 hover:bg-dark-700 flex w-full items-center gap-2 px-4 py-2 text-sm transition-colors hover:text-white"
                >
                  <EyeIcon className="h-4 w-4" />
                  With Financials
                </button>
                <button
                  onClick={() => handleExportPDF(false)}
                  className="text-dark-300 hover:bg-dark-700 flex w-full items-center gap-2 px-4 py-2 text-sm transition-colors hover:text-white"
                >
                  <EyeSlashIcon className="h-4 w-4" />
                  Without Financials
                </button>
              </div>
            )}
          </div>

          {/* BC Link */}
          <a
            href={getBCJobUrl(project.code, selectedCompany?.name)}
            target="_blank"
            rel="noopener noreferrer"
            className="border-dark-600 bg-dark-700 hover:border-thyme-500/50 flex items-center gap-2 rounded-lg border px-4 py-2 text-sm text-gray-300 transition-colors hover:text-white"
          >
            <ArrowTopRightOnSquareIcon className="h-4 w-4" />
            <span className="hidden sm:inline">Open in Business Central</span>
          </a>
        </div>
      </div>
    </div>
  );
}
