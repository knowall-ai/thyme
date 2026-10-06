'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeftIcon,
  ArrowTopRightOnSquareIcon,
  DocumentArrowDownIcon,
  CalendarIcon,
  InformationCircleIcon,
} from '@heroicons/react/24/outline';
import { useProjectDetailsStore } from '@/hooks/useProjectDetailsStore';
import { useCompanyStore } from '@/hooks';
import { cn, DATE_FORMAT_FULL, formatDate as formatDateUtil, getBCJobUrl } from '@/utils';
import type { BillingMode } from '@/services/bc/projectDetailsService';

/**
 * Format a date string for display (e.g., "15 Jan 2025").
 *
 * Treats BC's null-date sentinel ("0001-..." — typically "0001-01-01") as
 * unspecified. The sentinel arrives as a non-empty ISO string, so the
 * empty-check alone misses it; `new Date(...).toLocaleDateString` then
 * renders it as e.g. "31 Dec 1" — the timezone shift in negative-UTC zones
 * flips the calendar day, and the year prints unpadded as "1".
 */
function formatDate(dateStr?: string): string {
  if (!dateStr || dateStr.startsWith('0001-')) return 'Unspecified';
  try {
    return formatDateUtil(dateStr, DATE_FORMAT_FULL);
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
  const { project, analytics } = useProjectDetailsStore();
  const selectedCompany = useCompanyStore((state) => state.selectedCompany);

  if (!project) return null;

  // Prints the page exactly as shown - amounts hidden via their Eye toggles stay masked
  const handleExportPDF = () => {
    // Set document title for PDF filename: "Customer - Project Code - Project Report"
    const originalTitle = document.title;
    const parts = [project.customerName, project.code, 'Project Report'].filter(Boolean);
    document.title = parts.join(' - ');

    // Restore title after print dialog closes (handles cancel too)
    const handleAfterPrint = () => {
      document.title = originalTitle;
      window.removeEventListener('afterprint', handleAfterPrint);
    };
    window.addEventListener('afterprint', handleAfterPrint);

    window.print();
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
          {/* PDF Export - hidden in print */}
          <button
            onClick={handleExportPDF}
            className="border-dark-600 bg-dark-700 hover:border-thyme-500/50 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm text-gray-300 transition-colors hover:text-white print:hidden"
            title="Export to PDF (hidden amounts stay masked)"
          >
            <DocumentArrowDownIcon className="h-4 w-4" />
            <span className="hidden sm:inline">Export PDF</span>
          </button>

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
