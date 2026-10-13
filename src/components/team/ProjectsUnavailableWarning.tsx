import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';

/**
 * Shown when projects couldn't be loaded with the hours: without their bill-to
 * customers, internal projects' time can't be told apart and counts as billable.
 */
export function ProjectsUnavailableWarning() {
  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4"
    >
      <ExclamationTriangleIcon className="h-5 w-5 shrink-0 text-amber-500" />
      <div className="text-sm">
        <p className="font-medium text-amber-400">Billable figures may be too high</p>
        <p className="text-dark-300 mt-1">
          Projects couldn&apos;t be loaded from Business Central, so time on internal projects
          can&apos;t be told apart and is counted as billable. Refresh the page to try again.
        </p>
      </div>
    </div>
  );
}
