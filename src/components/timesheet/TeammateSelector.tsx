'use client';

import { useState, useEffect, useRef } from 'react';
import {
  UsersIcon,
  CheckIcon,
  ChevronDownIcon,
  MagnifyingGlassIcon,
  UserIcon,
} from '@heroicons/react/24/outline';
import { useTeammateStore, useCompanyStore } from '@/hooks';
import { useAuth } from '@/services/auth';
import { cn } from '@/utils';
import type { BCEmployee } from '@/types';

export function TeammateSelector() {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { account } = useAuth();
  const { selectedCompany } = useCompanyStore();
  const { teammates, selectedTeammate, isLoading, fetchTeammates, selectTeammate } =
    useTeammateStore();

  // Fetch teammates on mount and when company changes
  useEffect(() => {
    fetchTeammates();
  }, [fetchTeammates, selectedCompany]);

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

  const handleSelect = (teammate: BCEmployee | null) => {
    selectTeammate(teammate);
    setIsOpen(false);
    setSearchQuery('');
  };

  // Filter teammates by search query, excluding current user
  const filteredTeammates = teammates.filter((teammate) => {
    // Filter by search
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesName = teammate.displayName.toLowerCase().includes(query);
      const matchesEmail = teammate.email?.toLowerCase().includes(query);
      if (!matchesName && !matchesEmail) return false;
    }
    return true;
  });

  // Separate current user from other teammates
  const currentUserEmail = account?.username?.toLowerCase();
  const currentUserTeammate = filteredTeammates.find(
    (t) => t.email?.toLowerCase() === currentUserEmail
  );
  const otherTeammates = filteredTeammates.filter(
    (t) => t.email?.toLowerCase() !== currentUserEmail
  );

  // Don't show if no teammates available (only self)
  if (teammates.length <= 1 && !isLoading) {
    return null;
  }

  const displayName = selectedTeammate ? selectedTeammate.displayName : 'My Timesheet';

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors',
          'border border-dark-600 bg-dark-800 hover:border-dark-500 hover:bg-dark-700',
          isOpen && 'border-knowall-green bg-dark-700',
          selectedTeammate && 'border-thyme-600'
        )}
        title="View teammate timesheets"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <UsersIcon className="h-5 w-5 text-dark-400" />
        <span className="max-w-[150px] truncate text-dark-200">{displayName}</span>
        <ChevronDownIcon
          className={cn('h-4 w-4 text-dark-400 transition-transform', isOpen && 'rotate-180')}
        />
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div
          className="absolute left-0 z-50 mt-2 w-72 rounded-lg border border-dark-600 bg-dark-800 shadow-xl"
          role="listbox"
        >
          {/* Header */}
          <div className="border-b border-dark-600 px-4 py-3">
            <h3 className="text-sm font-medium text-white">Teammates</h3>
            <p className="mt-0.5 text-xs text-dark-400">View your team&apos;s timesheets</p>
          </div>

          {/* Search */}
          {teammates.length > 5 && (
            <div className="border-b border-dark-600 p-2">
              <div className="relative">
                <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dark-400" />
                <input
                  type="text"
                  placeholder="Search teammates..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-md border border-dark-600 bg-dark-700 py-2 pl-9 pr-3 text-sm text-white placeholder-dark-400 focus:border-knowall-green focus:outline-none"
                />
              </div>
            </div>
          )}

          {/* Teammate List */}
          <div className="max-h-80 overflow-y-auto">
            {isLoading ? (
              <div className="px-4 py-3 text-center text-sm text-dark-400">
                Loading teammates...
              </div>
            ) : (
              <>
                {/* My Timesheet option */}
                <div className="border-b border-dark-600/50 py-1">
                  <button
                    onClick={() => handleSelect(null)}
                    className={cn(
                      'flex w-full items-center gap-3 px-4 py-2 text-left text-sm transition-colors hover:bg-dark-700',
                      !selectedTeammate && 'bg-dark-700'
                    )}
                    role="option"
                    aria-selected={!selectedTeammate}
                  >
                    <UserIcon className="h-5 w-5 flex-shrink-0 text-thyme-500" />
                    <div className="flex-1 truncate">
                      <span className="text-dark-200">My Timesheet</span>
                      {currentUserTeammate && (
                        <span className="ml-2 text-xs text-dark-400">
                          ({currentUserTeammate.displayName})
                        </span>
                      )}
                    </div>
                    {!selectedTeammate && (
                      <CheckIcon className="h-5 w-5 flex-shrink-0 text-knowall-green" />
                    )}
                  </button>
                </div>

                {/* Other teammates */}
                {otherTeammates.length === 0 && searchQuery && (
                  <div className="px-4 py-3 text-center text-sm text-dark-400">
                    No teammates found
                  </div>
                )}

                {otherTeammates.length > 0 && (
                  <div className="py-1">
                    <div className="px-4 py-2">
                      <span className="text-xs font-semibold uppercase tracking-wider text-dark-400">
                        Team Members
                      </span>
                    </div>
                    {otherTeammates.map((teammate) => {
                      const isSelected = selectedTeammate?.id === teammate.id;
                      return (
                        <button
                          key={teammate.id}
                          onClick={() => handleSelect(teammate)}
                          className={cn(
                            'flex w-full items-center gap-3 px-4 py-2 text-left text-sm transition-colors hover:bg-dark-700',
                            isSelected && 'bg-dark-700'
                          )}
                          role="option"
                          aria-selected={isSelected}
                        >
                          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-dark-600 text-xs font-medium text-dark-200">
                            {teammate.givenName?.[0] || teammate.surname?.[0] || teammate.displayName?.[0] || '?'}
                            {teammate.givenName?.[0] && teammate.surname?.[0] ? teammate.surname[0] : ''}
                          </div>
                          <div className="flex-1 truncate">
                            <div className="text-dark-200">{teammate.displayName}</div>
                            {teammate.jobTitle && (
                              <div className="text-xs text-dark-400">{teammate.jobTitle}</div>
                            )}
                          </div>
                          {isSelected && (
                            <CheckIcon className="h-5 w-5 flex-shrink-0 text-knowall-green" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
