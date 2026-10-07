import type { Project, TimeEntry } from '@/types';

export const CSV_HEADERS = ['Date', 'Project', 'Task', 'Hours', 'Notes', 'Billable'];

/**
 * Build the CSV rows for the Reports export.
 *
 * `entry.projectId` holds the Business Central project number (e.g. "PR00100")
 * and `entry.taskId` the job task number (e.g. "1000"), not the GUIDs held in
 * `project.id` / `task.id`, so match on `project.code` and `task.code`.
 */
export function buildCsvRows(entries: TimeEntry[], projects: Project[]): string[][] {
  return entries.map((entry) => {
    const project = projects.find((p) => p.code === entry.projectId);
    const task = project?.tasks.find((t) => t.code === entry.taskId);
    return [
      entry.date,
      project?.name || 'Unknown',
      task?.name || 'Unknown',
      entry.hours.toFixed(2),
      `"${(entry.notes || '').replace(/"/g, '""')}"`,
      entry.isBillable ? 'Yes' : 'No',
    ];
  });
}

export function buildCsv(entries: TimeEntry[], projects: Project[]): string {
  const rows = buildCsvRows(entries, projects);
  return [CSV_HEADERS.join(','), ...rows.map((r) => r.join(','))].join('\n');
}
