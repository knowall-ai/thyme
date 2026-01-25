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
          'border-dark-600 bg-dark-800 hover:border-dark-500 hover:bg-dark-700 border',
          isOpen && 'border-knowall-green bg-dark-700',
          selectedTeammate && 'border-thyme-600'
        )}
        title="View teammate timesheets"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <UsersIcon className="text-dark-400 h-5 w-5" />
        <span className="text-dark-200 max-w-[150px] truncate">{displayName}</span>
        <ChevronDownIcon
          className={cn('text-dark-400 h-4 w-4 transition-transform', isOpen && 'rotate-180')}
        />
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div
          className="border-dark-600 bg-dark-800 absolute left-0 z-50 mt-2 w-72 rounded-lg border shadow-xl"
          role="listbox"
        >
          {/* Header */}
          <div className="border-dark-600 border-b px-4 py-3">
            <h3 className="text-sm font-medium text-white">Teammates</h3>
            <p className="text-dark-400 mt-0.5 text-xs">View your team&apos;s timesheets</p>
          </div>

          {/* Search */}
          {teammates.length > 5 && (
            <div className="border-dark-600 border-b p-2">
              <div className="relative">
                <MagnifyingGlassIcon className="text-dark-400 absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search teammates..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="border-dark-600 bg-dark-700 placeholder-dark-400 focus:border-knowall-green w-full rounded-md border py-2 pr-3 pl-9 text-sm text-white focus:outline-none"
                />
              </div>
            </div>
          )}

          {/* Teammate List */}
          <div className="max-h-80 overflow-y-auto">
            {isLoading ? (
              <div className="text-dark-400 px-4 py-3 text-center text-sm">
                Loading teammates...
              </div>
            ) : (
              <>
                {/* My Timesheet option */}
                <div className="border-dark-600/50 border-b py-1">
                  <button
                    onClick={() => handleSelect(null)}
                    className={cn(
                      'hover:bg-dark-700 flex w-full items-center gap-3 px-4 py-2 text-left text-sm transition-colors',
                      !selectedTeammate && 'bg-dark-700'
                    )}
                    role="option"
                    aria-selected={!selectedTeammate}
                  >
                    <UserIcon className="text-thyme-500 h-5 w-5 flex-shrink-0" />
                    <div className="flex-1 truncate">
                      <span className="text-dark-200">My Timesheet</span>
                      {currentUserTeammate && (
                        <span className="text-dark-400 ml-2 text-xs">
                          ({currentUserTeammate.displayName})
                        </span>
                      )}
                    </div>
                    {!selectedTeammate && (
                      <CheckIcon className="text-knowall-green h-5 w-5 flex-shrink-0" />
                    )}
                  </button>
                </div>

                {/* Other teammates */}
                {otherTeammates.length === 0 && searchQuery && (
                  <div className="text-dark-400 px-4 py-3 text-center text-sm">
                    No teammates found
                  </div>
                )}

                {otherTeammates.length > 0 && (
                  <div className="py-1">
                    <div className="px-4 py-2">
                      <span className="text-dark-400 text-xs font-semibold tracking-wider uppercase">
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
                            'hover:bg-dark-700 flex w-full items-center gap-3 px-4 py-2 text-left text-sm transition-colors',
                            isSelected && 'bg-dark-700'
                          )}
                          role="option"
                          aria-selected={isSelected}
                        >
                          <div className="bg-dark-600 text-dark-200 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-medium">
                            {teammate.givenName?.[0] ||
                              teammate.surname?.[0] ||
                              teammate.displayName?.[0] ||
                              '?'}
                            {teammate.givenName?.[0] && teammate.surname?.[0]
                              ? teammate.surname[0]
                              : ''}
                          </div>
                          <div className="flex-1 truncate">
                            <div className="text-dark-200">{teammate.displayName}</div>
                            {teammate.jobTitle && (
                              <div className="text-dark-400 text-xs">{teammate.jobTitle}</div>
                            )}
                          </div>
                          {isSelected && (
                            <CheckIcon className="text-knowall-green h-5 w-5 flex-shrink-0" />
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
