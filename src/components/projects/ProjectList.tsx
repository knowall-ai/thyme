'use client';

import { useEffect, useState, useMemo } from 'react';
import {
  MagnifyingGlassIcon,
  StarIcon as StarOutlineIcon,
  FunnelIcon,
  ArrowsUpDownIcon,
} from '@heroicons/react/24/outline';
import { StarIcon as StarSolidIcon } from '@heroicons/react/24/solid';
import { Card, Input, Select } from '@/components/ui';
import { useProjectsStore } from '@/hooks';
import type { Project } from '@/types';
import { cn } from '@/utils';

type FilterOption = 'all' | 'favorites' | 'active' | 'completed';
type SortOption = 'name-asc' | 'name-desc' | 'code' | 'recent';
type ClientFilter = 'all' | string;

interface ProjectListProps {
  onSelectProject?: (project: Project) => void;
}

export function ProjectList({ onSelectProject }: ProjectListProps) {
  const {
    isLoading,
    searchQuery,
    setSearchQuery,
    getFilteredProjects,
    toggleFavorite,
    fetchProjects,
  } = useProjectsStore();

  const [filterBy, setFilterBy] = useState<FilterOption>('all');
  const [sortBy, setSortBy] = useState<SortOption>('name-asc');
  const [clientFilter, setClientFilter] = useState<ClientFilter>('all');

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const filteredProjects = getFilteredProjects();

  // Get unique clients for the filter dropdown
  const uniqueClients = useMemo(() => {
    const clients = new Set<string>();
    filteredProjects.forEach((p) => {
      clients.add(p.clientName || 'No Client');
    });
    return Array.from(clients).sort();
  }, [filteredProjects]);

  // Apply filter and sort
  const processedProjects = useMemo(() => {
    let result = [...filteredProjects];

    // Apply client filter
    if (clientFilter !== 'all') {
      result = result.filter((p) => (p.clientName || 'No Client') === clientFilter);
    }

    // Apply status filter
    switch (filterBy) {
      case 'favorites':
        result = result.filter((p) => p.isFavorite);
        break;
      case 'active':
        result = result.filter((p) => p.status === 'active');
        break;
      case 'completed':
        result = result.filter((p) => p.status === 'completed');
        break;
    }

    // Apply sort
    switch (sortBy) {
      case 'name-asc':
        result.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'name-desc':
        result.sort((a, b) => b.name.localeCompare(a.name));
        break;
      case 'code':
        result.sort((a, b) => a.code.localeCompare(b.code));
        break;
      case 'recent':
        // Favorites first, then by name
        result.sort((a, b) => {
          if (a.isFavorite && !b.isFavorite) return -1;
          if (!a.isFavorite && b.isFavorite) return 1;
          return a.name.localeCompare(b.name);
        });
        break;
    }

    return result;
  }, [filteredProjects, filterBy, sortBy, clientFilter]);

  // Group projects by client
  const groupedProjects = processedProjects.reduce(
    (groups, project) => {
      const client = project.clientName || 'No Client';
      if (!groups[client]) {
        groups[client] = [];
      }
      groups[client].push(project);
      return groups;
    },
    {} as Record<string, Project[]>
  );

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-thyme-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Search and Filter/Sort Controls */}
      <div className="space-y-3">
        <div className="relative">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
          <Input
            type="text"
            placeholder="Search projects..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        <div className="flex flex-wrap gap-3">
          {/* Client Filter */}
          <div className="flex items-center gap-2">
            <Select
              value={clientFilter}
              onChange={(e) => setClientFilter(e.target.value)}
              className="w-40"
              options={[
                { value: 'all', label: 'All Clients' },
                ...uniqueClients.map((client) => ({ value: client, label: client })),
              ]}
            />
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-2">
            <FunnelIcon className="h-4 w-4 text-gray-400" />
            <Select
              value={filterBy}
              onChange={(e) => setFilterBy(e.target.value as FilterOption)}
              className="w-36"
              options={[
                { value: 'all', label: 'All Status' },
                { value: 'favorites', label: 'Favorites' },
                { value: 'active', label: 'Active' },
                { value: 'completed', label: 'Completed' },
              ]}
            />
          </div>

          {/* Sort */}
          <div className="flex items-center gap-2">
            <ArrowsUpDownIcon className="h-4 w-4 text-gray-400" />
            <Select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="w-36"
              options={[
                { value: 'name-asc', label: 'Name (A-Z)' },
                { value: 'name-desc', label: 'Name (Z-A)' },
                { value: 'code', label: 'Code' },
                { value: 'recent', label: 'Recent' },
              ]}
            />
          </div>
        </div>
      </div>

      {/* Project Groups */}
      {Object.entries(groupedProjects).map(([client, clientProjects]) => (
        <div key={client}>
          <h3 className="mb-2 text-sm font-medium text-gray-500">{client}</h3>
          <div className="space-y-2">
            {clientProjects.map((project) => (
              <Card
                key={project.id}
                variant="bordered"
                className={cn(
                  'cursor-pointer p-4 transition-shadow hover:shadow-md',
                  onSelectProject && 'hover:border-thyme-300'
                )}
                onClick={() => onSelectProject?.(project)}
              >
                <div className="flex items-start gap-3">
                  {/* Color indicator */}
                  <div
                    className="mt-1.5 h-3 w-3 shrink-0 rounded-full"
                    style={{ backgroundColor: project.color }}
                  />

                  {/* Project info */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-gray-500">{project.code}</span>
                      <span
                        className={cn(
                          'rounded px-1.5 py-0.5 text-xs',
                          project.status === 'active'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-600'
                        )}
                      >
                        {project.status}
                      </span>
                    </div>
                    <h4 className="truncate font-medium text-white">{project.name}</h4>
                    <p className="text-sm text-gray-500">{project.tasks.length} tasks</p>
                  </div>

                  {/* Favorite button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFavorite(project.id);
                    }}
                    className="rounded p-1 transition-colors hover:bg-gray-100"
                  >
                    {project.isFavorite ? (
                      <StarSolidIcon className="h-5 w-5 text-amber-400" />
                    ) : (
                      <StarOutlineIcon className="h-5 w-5 text-gray-400" />
                    )}
                  </button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      ))}

      {/* Empty state */}
      {processedProjects.length === 0 && (
        <div className="py-12 text-center">
          <p className="text-gray-500">
            {searchQuery
              ? 'No projects match your search'
              : filterBy !== 'all'
                ? 'No projects match the current filter'
                : 'No projects available'}
          </p>
        </div>
      )}
    </div>
  );
}
