'use client';

import { DocumentArrowDownIcon } from '@heroicons/react/24/outline';
import type { Project, TimeEntry } from '@/types';
import { buildCsv } from '@/utils';

interface ExportButtonProps {
  entries: TimeEntry[];
  projects: Project[];
  /** Used in the downloaded file name, e.g. the start of the report period */
  fileSuffix: string;
}

export function ExportButton({ entries, projects, fileSuffix }: ExportButtonProps) {
  const handleExport = () => {
    if (entries.length === 0) return;

    const csv = buildCsv(entries, projects);

    // Create and download file
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `thyme-export-${fileSuffix}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <button
      onClick={handleExport}
      disabled={entries.length === 0}
      className="bg-dark-700 text-dark-300 hover:bg-dark-600 flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
    >
      <DocumentArrowDownIcon className="h-4 w-4" />
      Export
    </button>
  );
}
