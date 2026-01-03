'use client';

import { ArrowDownTrayIcon } from '@heroicons/react/24/outline';
import { Button } from '@/components/ui';
import { useTimeEntriesStore, useProjectsStore } from '@/hooks';
import { formatDate, formatWeekRange } from '@/utils';

export function ExportButton() {
  const { entries, currentWeekStart } = useTimeEntriesStore();
  const { projects } = useProjectsStore();

  const handleExport = () => {
    if (entries.length === 0) return;

    // Build CSV content
    const headers = ['Date', 'Project', 'Task', 'Hours', 'Notes', 'Billable'];
    const rows = entries.map((entry) => {
      const project = projects.find((p) => p.id === entry.projectId);
      const task = project?.tasks.find((t) => t.id === entry.taskId);
      return [
        entry.date,
        project?.name || 'Unknown',
        task?.name || 'Unknown',
        entry.hours.toFixed(2),
        `"${(entry.notes || '').replace(/"/g, '""')}"`,
        entry.isBillable ? 'Yes' : 'No',
      ];
    });

    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');

    // Create and download file
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `thyme-export-${formatDate(currentWeekStart)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <Button
      variant="outline"
      onClick={handleExport}
      disabled={entries.length === 0}
    >
      <ArrowDownTrayIcon className="w-4 h-4 mr-2" />
      Export CSV
    </Button>
  );
}
