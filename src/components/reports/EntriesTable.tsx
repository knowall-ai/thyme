'use client';

import { useEffect, useMemo, useState } from 'react';
import { flushSync } from 'react-dom';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline';
import { useCompanyPath } from '@/hooks';
import { RESOURCE_PARAM } from '@/utils/teammateParam';
import { cn, formatTime, getEntryStatus, ENTRY_STATUS_LABELS } from '@/utils';
import type { EntryStatus, StagedTimeEntry } from '@/utils';

/** One logged entry with whose it is, and its project's and task's names */
export interface EntryRow {
  entry: StagedTimeEntry;
  resourceNo: string;
  resourceName: string;
  projectName: string;
  projectColor?: string;
  taskName?: string;
}

type SortKey = 'date' | 'person' | 'project' | 'hours';
type Sort = { key: SortKey; dir: 'asc' | 'desc' };

const DEFAULT_SORT: Sort = { key: 'date', dir: 'desc' };
// Rows shown at first, and added by "Show more": a year of everyone's time is thousands
const PAGE_SIZE = 200;

// The stage colours of the project page's Breakdown table
const STATUS_COLORS: Record<EntryStatus, string> = {
  unsubmitted: 'text-amber-400/60',
  submitted: 'text-amber-400',
  approved: 'text-green-400',
  partlyPosted: 'text-green-400',
  posted: 'text-thyme-600',
  rejected: 'text-red-400',
};

const byText = (a: string, b: string) =>
  a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true });

function compareRows(a: EntryRow, b: EntryRow, key: SortKey): number {
  switch (key) {
    case 'date':
      return a.entry.date.localeCompare(b.entry.date);
    case 'person':
      return byText(a.resourceName, b.resourceName);
    case 'project':
      return byText(a.entry.projectId, b.entry.projectId) || byText(a.entry.taskId, b.entry.taskId);
    case 'hours':
      return a.entry.hours - b.entry.hours;
  }
}

/** Every entry in the report: one row per person, line and day */
export function EntriesTable({ rows }: { rows: EntryRow[] }) {
  const companyPath = useCompanyPath();
  const [sort, setSort] = useState<Sort>(DEFAULT_SORT);
  const [shown, setShown] = useState(PAGE_SIZE);

  // A printout has every entry, not just those shown so far. flushSync commits them
  // before the browser captures the page for the print preview
  useEffect(() => {
    const showAll = () => flushSync(() => setShown(Infinity));
    window.addEventListener('beforeprint', showAll);
    return () => window.removeEventListener('beforeprint', showAll);
  }, []);

  const sorted = useMemo(() => {
    const sign = sort.dir === 'asc' ? 1 : -1;
    // Ties by date (newest first), then person, so the order is always the same
    return [...rows].sort(
      (a, b) =>
        sign * compareRows(a, b, sort.key) ||
        compareRows(b, a, 'date') ||
        compareRows(a, b, 'person') ||
        compareRows(a, b, 'project')
    );
  }, [rows, sort]);

  const totalHours = rows.reduce((sum, row) => sum + row.entry.hours, 0);
  const billableHours = rows.reduce(
    (sum, row) => sum + (row.entry.isBillable ? row.entry.hours : 0),
    0
  );

  // Click a column: its natural order first (newest, A-Z, most hours), then reversed
  const header = (key: SortKey, label: string, className?: string) => {
    const active = sort.key === key;
    const firstDir = key === 'person' || key === 'project' ? 'asc' : 'desc';
    return (
      <th
        className={cn('px-3 py-3 text-sm font-medium text-gray-400', className)}
        aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      >
        <button
          type="button"
          onClick={() => {
            setSort(
              active ? { key, dir: sort.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: firstDir }
            );
          }}
          className="focus-visible:ring-thyme-500 inline-flex items-center gap-0.5 rounded hover:text-white focus:outline-none focus-visible:ring-1"
          title={`Sort by ${label.toLowerCase()}`}
        >
          {active &&
            (sort.dir === 'desc' ? (
              <ChevronDownIcon className="h-3 w-3" />
            ) : (
              <ChevronUpIcon className="h-3 w-3" />
            ))}
          {label}
        </button>
      </th>
    );
  };

  return (
    <div className="space-y-3">
      <div className="border-dark-600 overflow-x-auto rounded-lg border">
        <table className="w-full">
          <thead className="bg-dark-700 text-left">
            <tr>
              {header('date', 'Date', 'whitespace-nowrap')}
              {header('person', 'Person')}
              {header('project', 'Project / Task')}
              <th className="px-3 py-3 text-sm font-medium text-gray-400">Description</th>
              <th className="px-3 py-3 text-sm font-medium text-gray-400">Status</th>
              {header('hours', 'Hours', 'text-right')}
            </tr>
          </thead>
          <tbody className="divide-dark-600 divide-y">
            {sorted.slice(0, shown).map(({ entry, resourceNo, resourceName, ...row }) => {
              const status = getEntryStatus(entry);
              return (
                <tr key={`${resourceNo}|${entry.id}`} className="break-inside-avoid text-sm">
                  <td className="px-3 py-2 whitespace-nowrap">
                    {/* Their timesheet for that week, where the entry can be seen or changed */}
                    <Link
                      href={companyPath(
                        `/time?week=${entry.date}&${RESOURCE_PARAM}=${encodeURIComponent(resourceNo)}`
                      )}
                      className="text-dark-200 hover:text-thyme-400 underline-offset-4 hover:underline"
                      title="Open this timesheet"
                    >
                      {format(parseISO(entry.date), 'EEE d MMM yyyy')}
                    </Link>
                  </td>
                  <td className="text-dark-200 px-3 py-2">{resourceName}</td>
                  <td className="px-3 py-2">
                    <Link
                      href={companyPath(`/projects/${encodeURIComponent(entry.projectId)}`)}
                      className="hover:text-thyme-400 flex items-center gap-2 text-white underline-offset-4 hover:underline"
                    >
                      <span
                        className="h-2.5 w-2.5 flex-none rounded-full"
                        style={{ backgroundColor: row.projectColor ?? '#6B7280' }}
                        aria-hidden="true"
                      />
                      {row.projectName}
                    </Link>
                    <span className="text-dark-400 mt-0.5 block text-xs">
                      <span className="font-mono">{entry.projectId}</span>
                      {entry.taskId && (
                        <>
                          {' · '}
                          <span className="font-mono">{entry.taskId}</span>
                          {row.taskName && ` ${row.taskName}`}
                        </>
                      )}
                    </span>
                  </td>
                  <td className="text-dark-300 px-3 py-2">{entry.notes || '–'}</td>
                  <td className={cn('px-3 py-2 whitespace-nowrap', STATUS_COLORS[status])}>
                    {ENTRY_STATUS_LABELS[status]}
                    {status === 'partlyPosted' && (
                      <span className="text-dark-400 block text-xs">
                        {formatTime(entry.stages.posted)} posted
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <span className="text-white">{formatTime(entry.hours)}</span>
                    <span className="text-dark-400 block text-xs">
                      {entry.isBillable ? 'Billable' : 'Unbillable'}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="bg-dark-700">
            <tr className="text-sm">
              <td colSpan={5} className="px-3 py-3 font-medium text-white">
                {rows.length} {rows.length === 1 ? 'entry' : 'entries'}
              </td>
              <td className="px-3 py-3 text-right whitespace-nowrap">
                <span className="font-bold text-white">{formatTime(totalHours)}</span>
                <span className="text-dark-400 block text-xs">
                  {formatTime(billableHours)} billable
                </span>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      {sorted.length > shown && (
        <div className="flex justify-center print:hidden">
          <button
            type="button"
            onClick={() => setShown((n) => n + PAGE_SIZE)}
            className="bg-dark-700 hover:bg-dark-600 rounded-lg px-4 py-2 text-sm text-gray-400 transition-colors hover:text-white"
          >
            Show {Math.min(PAGE_SIZE, sorted.length - shown)} more of {sorted.length - shown}
          </button>
        </div>
      )}
    </div>
  );
}
