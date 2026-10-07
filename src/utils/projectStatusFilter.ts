import type { Project } from '@/types';

export type ProjectStatus = Project['status'];

export interface ProjectStatusOption {
  value: ProjectStatus;
  label: string;
  hint: string;
}

export const PROJECT_STATUS_OPTIONS: ProjectStatusOption[] = [
  { value: 'active', label: 'Active', hint: 'In progress (Status: Open or Planning)' },
  {
    value: 'completed',
    label: 'Completed',
    hint: 'Finished, still open for posting (Status: Completed)',
  },
  { value: 'archived', label: 'Archived', hint: 'Blocked in Business Central' },
];

export const DEFAULT_PROJECT_STATUSES: ProjectStatus[] = ['active'];

/** Toggle one status in the selection, keeping the canonical option order. */
export function toggleProjectStatus(
  selected: ProjectStatus[],
  status: ProjectStatus
): ProjectStatus[] {
  const next = selected.includes(status)
    ? selected.filter((s) => s !== status)
    : [...selected, status];
  return PROJECT_STATUS_OPTIONS.map((o) => o.value).filter((v) => next.includes(v));
}

/** Keep only projects whose status is selected. An empty selection matches nothing. */
export function filterProjectsByStatus<T extends { status: ProjectStatus }>(
  projects: T[],
  selected: ProjectStatus[]
): T[] {
  return projects.filter((p) => selected.includes(p.status));
}

/** True when the selection is the default (Active only). */
export function isDefaultProjectStatuses(selected: ProjectStatus[]): boolean {
  return (
    selected.length === DEFAULT_PROJECT_STATUSES.length &&
    DEFAULT_PROJECT_STATUSES.every((s) => selected.includes(s))
  );
}

/** Button label summarising the selection, e.g. "Active, Completed". */
export function projectStatusSummary(selected: ProjectStatus[]): string {
  if (selected.length === 0) return 'No statuses';
  if (selected.length === PROJECT_STATUS_OPTIONS.length) return 'All statuses';
  return PROJECT_STATUS_OPTIONS.filter((o) => selected.includes(o.value))
    .map((o) => o.label)
    .join(', ');
}
