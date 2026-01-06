'use client';

import { useState, useEffect, useRef } from 'react';
import { BuildingOffice2Icon, CheckIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { useCompanyStore, useProjectsStore, useTimeEntriesStore } from '@/hooks';
import { cn } from '@/utils';

export function CompanySwitcher() {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { companies, selectedCompany, isLoading, fetchCompanies, selectCompany } =
    useCompanyStore();
  const { fetchProjects } = useProjectsStore();
  const { clearEntries } = useTimeEntriesStore();

  // Fetch companies on mount
  useEffect(() => {
    fetchCompanies();
  }, [fetchCompanies]);

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

  const handleCompanySelect = async (company: typeof selectedCompany) => {
    if (!company || company.id === selectedCompany?.id) {
      setIsOpen(false);
      return;
    }

    selectCompany(company);
    setIsOpen(false);
    setSearchQuery('');

    // Reload data for new company
    clearEntries();
    await fetchProjects();
  };

  const filteredCompanies = companies.filter((company) =>
    company.displayName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Don't show if only one company
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
          'border border-dark-600 bg-dark-800 hover:border-dark-500 hover:bg-dark-700',
          isOpen && 'border-knowall-green bg-dark-700'
        )}
        title="Switch company"
      >
        <BuildingOffice2Icon className="h-5 w-5 text-dark-400" />
        <span className="hidden max-w-[150px] truncate text-dark-200 md:block">
          {selectedCompany?.displayName || 'Select company'}
        </span>
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div className="absolute right-0 z-50 mt-2 w-72 rounded-lg border border-dark-600 bg-dark-800 shadow-xl">
          {/* Header */}
          <div className="border-b border-dark-600 px-4 py-3">
            <h3 className="text-sm font-medium text-white">Available Companies</h3>
          </div>

          {/* Search */}
          <div className="border-b border-dark-600 p-2">
            <div className="relative">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dark-400" />
              <input
                type="text"
                placeholder="Search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-md border border-dark-600 bg-dark-700 py-2 pl-9 pr-3 text-sm text-white placeholder-dark-400 focus:border-knowall-green focus:outline-none"
              />
            </div>
          </div>

          {/* Company List */}
          <div className="max-h-64 overflow-y-auto py-2">
            {isLoading ? (
              <div className="px-4 py-3 text-center text-sm text-dark-400">
                Loading companies...
              </div>
            ) : filteredCompanies.length === 0 ? (
              <div className="px-4 py-3 text-center text-sm text-dark-400">No companies found</div>
            ) : (
              filteredCompanies.map((company) => (
                <button
                  key={company.id}
                  onClick={() => handleCompanySelect(company)}
                  className={cn(
                    'flex w-full items-center gap-3 px-4 py-2 text-left text-sm transition-colors hover:bg-dark-700',
                    selectedCompany?.id === company.id && 'bg-dark-700'
                  )}
                >
                  <BuildingOffice2Icon className="h-5 w-5 flex-shrink-0 text-dark-400" />
                  <span className="flex-1 truncate text-dark-200">{company.displayName}</span>
                  {selectedCompany?.id === company.id && (
                    <CheckIcon className="h-5 w-5 flex-shrink-0 text-knowall-green" />
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
