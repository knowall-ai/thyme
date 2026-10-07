'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeftIcon,
  ArrowTopRightOnSquareIcon,
  DocumentArrowDownIcon,
  CalendarIcon,
  InformationCircleIcon,
  PencilIcon,
  CheckIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import {
  useProjectDetailsStore,
  PROJECT_NAME_MAX_LENGTH,
  ProjectRenamePermissionError,
} from '@/hooks/useProjectDetailsStore';
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
  Mixed: 'Mixed - More than one kind of billable line (Resource, Item, G/L Account) in BC',
  'Not Set': 'No billable lines configured in Business Central',
};

// How the badge is derived (see billingMode in projectDetailsService), shown in its tooltip
const billingModeRules: { lines: string; mode: BillingMode }[] = [
  { lines: 'Resource lines only', mode: 'T&M' },
  { lines: 'Item or G/L Account lines only', mode: 'Fixed Price' },
  { lines: 'More than one kind', mode: 'Mixed' },
  { lines: 'None', mode: 'Not Set' },
];

interface BillingModeBadgeProps {
  mode: BillingMode;
  showTooltip?: boolean;
}

function BillingModeBadge({ mode, showTooltip = true }: BillingModeBadgeProps) {
  const [isTooltipVisible, setIsTooltipVisible] = useState(false);
  const tooltipId = useId();

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
          aria-describedby={isTooltipVisible ? tooltipId : undefined}
        >
          <InformationCircleIcon className="h-4 w-4" />
        </button>
      )}
      {isTooltipVisible && (
        <div
          id={tooltipId}
          role="tooltip"
          className="border-dark-600 bg-dark-800 absolute top-full left-0 z-50 mt-2 w-80 rounded-lg border p-3 text-xs shadow-lg print:hidden"
        >
          <p className="font-medium text-white">{mode}</p>
          <p className="mt-1 text-gray-400">{billingModeExplanations[mode]}</p>
          {/* BC has no billing-type field, so show how the badge is worked out */}
          <p className="border-dark-600 mt-2 border-t pt-2 text-gray-400">
            Worked out from the project&apos;s <span className="text-white">Billable</span> planning
            lines:
          </p>
          <table className="mt-1 w-full">
            <thead>
              <tr className="text-left text-gray-500">
                <th className="py-1 font-medium">Billable lines</th>
                <th className="py-1 text-right font-medium">Badge</th>
              </tr>
            </thead>
            <tbody>
              {billingModeRules.map((rule) => (
                <tr
                  key={rule.mode}
                  className={cn(
                    'border-dark-600 border-t',
                    rule.mode === mode ? 'text-white' : 'text-gray-400'
                  )}
                >
                  <td className="py-1">{rule.lines}</td>
                  <td className="py-1 text-right font-medium">{rule.mode}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </span>
  );
}

interface ProjectNameProps {
  projectId: string;
  name: string;
}

/**
 * Project title with an inline rename. BC decides whether the user may rename
 * (Job modify permission), so a refusal is shown inline and the name is left as it was.
 */
function ProjectName({ projectId, name }: ProjectNameProps) {
  const renameProject = useProjectDetailsStore((state) => state.renameProject);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(false);

  // Drop an open edit when navigating to another project
  useEffect(() => {
    setIsEditing(false);
    setError(null);
  }, [projectId]);

  // Focus the input when editing starts, and return focus to the pencil when it ends
  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    } else if (wasEditing.current) {
      editButtonRef.current?.focus();
    }
    wasEditing.current = isEditing;
  }, [isEditing]);

  const startEditing = () => {
    setDraft(name);
    setError(null);
    setIsEditing(true);
  };

  const cancel = () => {
    setIsEditing(false);
    setError(null);
  };

  const save = async () => {
    const trimmed = draft.trim();
    if (!trimmed) {
      setError('Project name cannot be empty');
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      await renameProject(trimmed);
      setIsEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rename the project');
      // Retrying won't help without permission, so revert to the saved name; otherwise keep the draft to retry
      if (err instanceof ProjectRenamePermissionError) setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  };

  if (!isEditing) {
    return (
      <div className="mt-1">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-white">{name}</h1>
          <button
            ref={editButtonRef}
            type="button"
            onClick={startEditing}
            className="focus:ring-thyme-500 focus:ring-offset-dark-800 hover:text-thyme-400 rounded p-1 text-gray-500 transition-colors focus:ring-1 focus:ring-offset-1 focus:outline-none print:hidden"
            title="Rename project"
            aria-label="Rename project"
          >
            <PencilIcon className="h-4 w-4" />
          </button>
        </div>
        {error && (
          <p className="mt-1 text-sm text-red-400 print:hidden" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="mt-1">
      <h1 className="hidden text-2xl font-bold text-white print:block">{name}</h1>
      <form
        className="flex items-center gap-2 print:hidden"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              cancel();
            }
          }}
          maxLength={PROJECT_NAME_MAX_LENGTH}
          disabled={isSaving}
          aria-label="Project name"
          aria-invalid={error ? true : undefined}
          className="border-dark-600 bg-dark-700 focus:border-thyme-500 focus:ring-thyme-500 w-full max-w-xl rounded-lg border px-3 py-1 text-2xl font-bold text-white focus:ring-1 focus:outline-none disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={isSaving}
          className="bg-thyme-600 hover:bg-thyme-500 rounded-lg p-2 text-white transition-colors disabled:opacity-50"
          title="Save name"
          aria-label="Save name"
        >
          <CheckIcon className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={cancel}
          disabled={isSaving}
          className="border-dark-600 bg-dark-700 rounded-lg border p-2 text-gray-300 transition-colors hover:text-white disabled:opacity-50"
          title="Cancel"
          aria-label="Cancel renaming"
        >
          <XMarkIcon className="h-4 w-4" />
        </button>
      </form>
      {error ? (
        <p className="mt-1 text-sm text-red-400 print:hidden" role="alert">
          {error}
        </p>
      ) : (
        <p className="mt-1 text-xs text-gray-500 print:hidden">
          {isSaving ? 'Saving…' : 'Enter to save, Esc to cancel'}
        </p>
      )}
    </div>
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
            <ProjectName projectId={project.id} name={project.name} />
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
