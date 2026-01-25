'use client';

import { useState, useEffect, useRef } from 'react';
import {
  BuildingOffice2Icon,
  CheckIcon,
  ChevronDownIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline';
import { useCompanyStore, useProjectsStore, useTimeEntriesStore, useTimerStore } from '@/hooks';
import { useAuth } from '@/services/auth';
import { cn } from '@/utils';
import type { BCCompany, BCEnvironmentType } from '@/types';

// Environment display names
const ENV_LABELS: Record<BCEnvironmentType, string> = {
  sandbox: 'Sandbox',
  production: 'Production',
};

export function CompanySwitcher() {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedEnvs, setExpandedEnvs] = useState<Set<BCEnvironmentType>>(
    new Set(['sandbox', 'production'])
  );
  const dropdownRef = useRef<HTMLDivElement>(null);

  const {
    companies,
    selectedCompany,
    isLoading,
    fetchCompanies,
    selectCompany,
    getCompaniesByEnvironment,
    getEnvironments,
  } = useCompanyStore();
  const { fetchProjects, clearProjects } = useProjectsStore();
  const { clearEntries, fetchWeekEntries } = useTimeEntriesStore();
  const { isRunning: timerIsRunning, reset: resetTimer } = useTimerStore();
  const { account } = useAuth();
  const userEmail = account?.username || '';

  // Fetch companies on mount (Zustand actions are stable, empty dependency is intentional)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    fetchCompanies();
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const handleCompanySelect = async (company: BCCompany) => {
    // Check both ID and environment for accurate comparison
    const isSame =
      company.id === selectedCompany?.id && company.environment === selectedCompany?.environment;
    if (isSame) {
      setIsOpen(false);
      return;
    }

    // Stop timer if running (timer data belongs to old company)
    if (timerIsRunning) {
      const confirmed = window.confirm(
        'You have a timer running. Switching companies will discard this timer. Continue?'
      );
      if (!confirmed) {
        return;
      }
      resetTimer();
    }

    selectCompany(company);
    setIsOpen(false);
    setSearchQuery('');

    // Clear all data before fetching new company data
    clearEntries();
    clearProjects();
    await fetchProjects();
    // Re-fetch timesheet entries for the new company
    if (userEmail) {
      fetchWeekEntries(userEmail);
    }
  };

  const toggleEnvExpanded = (env: BCEnvironmentType) => {
    setExpandedEnvs((prev) => {
      const next = new Set(prev);
      if (next.has(env)) {
        next.delete(env);
      } else {
        next.add(env);
      }
      return next;
    });
  };

  // Filter companies by search query
  const filterCompanies = (companiesList: BCCompany[]) => {
    if (!searchQuery) return companiesList;
    return companiesList.filter((company) =>
      company.displayName.toLowerCase().includes(searchQuery.toLowerCase())
    );
  };

  const environments = getEnvironments();
  const hasAnyResults =
    searchQuery === '' ||
    companies.some((c) => c.displayName.toLowerCase().includes(searchQuery.toLowerCase()));

  // Don't show if only one company across all environments
  if (companies.length <= 1 && !isLoading) {
    return null;
  }

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors',
          'border-dark-600 bg-dark-800 hover:border-dark-500 hover:bg-dark-700 border',
          isOpen && 'border-knowall-green bg-dark-700'
        )}
        title="Switch company"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <BuildingOffice2Icon className="text-dark-400 h-5 w-5" />
        <span className="text-dark-200 hidden max-w-[150px] truncate md:block">
          {selectedCompany?.displayName || 'Select company'}
        </span>
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div
          className="border-dark-600 bg-dark-800 absolute right-0 z-50 mt-2 w-72 rounded-lg border shadow-xl"
          role="listbox"
        >
          {/* Header */}
          <div className="border-dark-600 border-b px-4 py-3">
            <h3 className="text-sm font-medium text-white">Available Companies</h3>
          </div>

          {/* Search */}
          <div className="border-dark-600 border-b p-2">
            <div className="relative">
              <MagnifyingGlassIcon className="text-dark-400 absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="border-dark-600 bg-dark-700 placeholder-dark-400 focus:border-knowall-green w-full rounded-md border py-2 pr-3 pl-9 text-sm text-white focus:outline-none"
              />
            </div>
          </div>

          {/* Company List - Grouped by Environment */}
          <div className="max-h-80 overflow-y-auto">
            {isLoading ? (
              <div className="text-dark-400 px-4 py-3 text-center text-sm">
                Loading companies...
              </div>
            ) : !hasAnyResults ? (
              <div className="text-dark-400 px-4 py-3 text-center text-sm">No companies found</div>
            ) : (
              environments.map((env) => {
                const envCompanies = filterCompanies(getCompaniesByEnvironment(env));
                if (envCompanies.length === 0) return null;

                const isExpanded = expandedEnvs.has(env);

                return (
                  <div key={env}>
                    {/* Environment Header */}
                    <button
                      onClick={() => toggleEnvExpanded(env)}
                      className="hover:bg-dark-700/50 flex w-full items-center justify-between px-4 py-2 text-left"
                    >
                      <span className="text-dark-400 text-xs font-semibold tracking-wider uppercase">
                        {ENV_LABELS[env]}
                      </span>
                      <ChevronDownIcon
                        className={cn(
                          'text-dark-400 h-4 w-4 transition-transform',
                          !isExpanded && '-rotate-90'
                        )}
                      />
                    </button>

                    {/* Companies in this environment */}
                    {isExpanded && (
                      <div className="pb-2">
                        {envCompanies.map((company) => {
                          const isSelected =
                            selectedCompany?.id === company.id &&
                            selectedCompany?.environment === company.environment;
                          return (
                            <button
                              key={`${company.environment}-${company.id}`}
                              onClick={() => handleCompanySelect(company)}
                              className={cn(
                                'hover:bg-dark-700 flex w-full items-center gap-3 px-4 py-2 text-left text-sm transition-colors',
                                isSelected && 'bg-dark-700'
                              )}
                              role="option"
                              aria-selected={isSelected}
                            >
                              <BuildingOffice2Icon className="text-dark-400 h-5 w-5 flex-shrink-0" />
                              <span className="text-dark-200 flex-1 truncate">
                                {company.displayName}
                              </span>
                              {isSelected && (
                                <CheckIcon className="text-knowall-green h-5 w-5 flex-shrink-0" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
