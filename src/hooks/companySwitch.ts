import type { BCCompany } from '@/types';
import { isSameCompany } from '@/utils/companyPath';
import { useCompanyStore } from './useCompanyStore';
import { useProjectDetailsStore } from './useProjectDetailsStore';
import { useProjectsStore } from './useProjectsStore';
import { useTeammateStore } from './useTeammateStore';
import { useTimeEntriesStore } from './useTimeEntriesStore';
import { useTimerStore } from './useTimerStore';

/**
 * Ask before discarding a running timer (its project belongs to the current company).
 * Returns false if the user wants to stay; otherwise stops the timer and returns true.
 */
export function confirmDiscardRunningTimer(): boolean {
  const { isRunning, reset } = useTimerStore.getState();
  if (!isRunning) return true;
  const confirmed = window.confirm(
    'You have a timer running. Switching companies will discard this timer. Continue?'
  );
  if (confirmed) reset();
  return confirmed;
}

/**
 * Make `company` the active company and drop data loaded for the previous one, so no
 * page shows the old company's projects, entries or teammate while the new data loads.
 * A no-op when it's already the active company.
 */
export function switchCompany(company: BCCompany): void {
  if (isSameCompany(useCompanyStore.getState().selectedCompany, company)) return;

  useCompanyStore.getState().selectCompany(company);
  useTimeEntriesStore.getState().clearEntries();
  useProjectsStore.getState().clearProjects();
  useProjectDetailsStore.getState().clearProject();
  useTeammateStore.getState().clearSelection();
}
