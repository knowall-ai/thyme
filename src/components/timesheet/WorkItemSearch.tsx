'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { MagnifyingGlassIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { cn } from '@/utils';
import { devopsClient } from '@/services/devops';
import type { DevOpsWorkItemSearchResult } from '@/types';

interface WorkItemSearchProps {
  organization: string;
  project: string;
  value?: {
    id: number;
    title: string;
  } | null;
  onChange: (workItem: { id: number; title: string } | null) => void;
  disabled?: boolean;
}

export function WorkItemSearch({
  organization,
  project,
  value,
  onChange,
  disabled = false,
}: WorkItemSearchProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [results, setResults] = useState<DevOpsWorkItemSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load recent work items when dropdown opens
  const loadRecentWorkItems = useCallback(async () => {
    if (!organization || !project) return;

    setIsLoading(true);
    setError(null);

    try {
      devopsClient.setOrganization(organization);
      const items = await devopsClient.getMyRecentWorkItems(project);
      setResults(items);
    } catch (err) {
      console.error('Failed to load recent work items:', err);
      setError('Failed to load work items');
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }, [organization, project]);

  // Search work items
  const searchWorkItems = useCallback(
    async (text: string) => {
      if (!organization || !project || !text.trim()) {
        loadRecentWorkItems();
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        devopsClient.setOrganization(organization);
        const items = await devopsClient.searchWorkItems(project, text.trim());
        setResults(items);
      } catch (err) {
        console.error('Failed to search work items:', err);
        setError('Failed to search work items');
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    },
    [organization, project, loadRecentWorkItems]
  );

  // Debounced search
  useEffect(() => {
    if (!isOpen) return;

    const timer = setTimeout(() => {
      if (searchText) {
        searchWorkItems(searchText);
      } else {
        loadRecentWorkItems();
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchText, isOpen, searchWorkItems, loadRecentWorkItems]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (item: DevOpsWorkItemSearchResult) => {
    onChange({ id: item.id, title: item.title });
    setSearchText('');
    setIsOpen(false);
  };

  const handleClear = () => {
    onChange(null);
    setSearchText('');
  };

  const handleInputFocus = () => {
    if (!disabled && organization && project) {
      setIsOpen(true);
    }
  };

  const getWorkItemTypeColor = (type: string): string => {
    const colors: Record<string, string> = {
      Bug: 'bg-red-600',
      'User Story': 'bg-blue-600',
      Task: 'bg-yellow-600',
      Feature: 'bg-purple-600',
      Epic: 'bg-orange-600',
      Issue: 'bg-pink-600',
    };
    return colors[type] || 'bg-gray-600';
  };

  const isConfigured = organization && project;

  return (
    <div ref={containerRef} className="relative w-full">
      <label className="mb-1 block text-sm font-medium text-dark-200">Work Item (optional)</label>

      {!isConfigured ? (
        <div className="flex h-10 w-full items-center rounded-lg border border-dark-600 bg-dark-900 px-3 text-sm text-dark-400">
          Configure DevOps organization and project to link work items
        </div>
      ) : value ? (
        <div className="flex h-10 w-full items-center justify-between rounded-lg border border-dark-600 bg-dark-800 px-3 text-sm text-white">
          <span className="truncate">
            <span className="text-thyme-400">#{value.id}</span> {value.title}
          </span>
          <button
            type="button"
            onClick={handleClear}
            disabled={disabled}
            className="ml-2 rounded p-1 text-dark-400 hover:bg-dark-700 hover:text-white disabled:cursor-not-allowed"
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="relative">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
            <MagnifyingGlassIcon className="h-4 w-4 text-dark-400" />
          </div>
          <input
            ref={inputRef}
            type="text"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            onFocus={handleInputFocus}
            placeholder="Search by ID (#123) or title..."
            disabled={disabled}
            className={cn(
              'flex h-10 w-full rounded-lg border border-dark-600 bg-dark-800 py-2 pl-9 pr-3 text-sm text-white',
              'placeholder:text-dark-400',
              'focus:border-transparent focus:outline-none focus:ring-2 focus:ring-thyme-500',
              'disabled:cursor-not-allowed disabled:bg-dark-900 disabled:opacity-50'
            )}
          />
        </div>
      )}

      {/* Dropdown */}
      {isOpen && isConfigured && !value && (
        <div className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-dark-600 bg-dark-800 shadow-lg">
          {isLoading ? (
            <div className="px-3 py-4 text-center text-sm text-dark-400">Searching...</div>
          ) : error ? (
            <div className="px-3 py-4 text-center text-sm text-red-400">{error}</div>
          ) : results.length === 0 ? (
            <div className="px-3 py-4 text-center text-sm text-dark-400">
              {searchText ? 'No work items found' : 'No recent work items'}
            </div>
          ) : (
            <ul className="py-1">
              {!searchText && (
                <li className="px-3 py-1 text-xs font-medium uppercase text-dark-400">
                  Recent Work Items
                </li>
              )}
              {results.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => handleSelect(item)}
                    className="w-full px-3 py-2 text-left hover:bg-dark-700 focus:bg-dark-700 focus:outline-none"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          'inline-flex h-5 items-center rounded px-1.5 text-xs font-medium text-white',
                          getWorkItemTypeColor(item.workItemType)
                        )}
                      >
                        {item.workItemType}
                      </span>
                      <span className="text-sm text-thyme-400">#{item.id}</span>
                    </div>
                    <div className="mt-1 truncate text-sm text-white">{item.title}</div>
                    {item.assignedTo && (
                      <div className="mt-0.5 text-xs text-dark-400">{item.assignedTo}</div>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
