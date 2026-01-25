'use client';

import { useEffect, useState, useMemo, Fragment } from 'react';
import { useRouter } from 'next/navigation';
import {
  MagnifyingGlassIcon,
  StarIcon as StarOutlineIcon,
  FunnelIcon,
  ArrowsUpDownIcon,
} from '@heroicons/react/24/outline';
import { StarIcon as StarSolidIcon } from '@heroicons/react/24/solid';
import { Input, Select } from '@/components/ui';
import { useProjectsStore } from '@/hooks';
import type { Project } from '@/types';
import type { BillingMode } from '@/services/bc/projectDetailsService';
import { cn, getBCJobsListUrl, getBCCustomersListUrl, getBCJobUrl } from '@/utils';
import { ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline';
import { useCompanyStore } from '@/hooks';

type FilterOption = 'all' | 'favorites' | 'active' | 'completed';
type SortOption = 'name-asc' | 'name-desc' | 'code' | 'recent';
type CustomerFilter = 'all' | string;

/**
 * Get badge styling for billing mode (compact version for list)
 */
function getBillingModeStyles(mode: BillingMode): string {
  switch (mode) {
    case 'T&M':
      return 'bg-blue-500/20 text-blue-400';
    case 'Fixed Price':
      return 'bg-purple-500/20 text-purple-400';
    case 'Mixed':
      return 'bg-amber-500/20 text-amber-400';
    case 'Not Set':
    default:
      return 'bg-gray-500/20 text-gray-400';
  }
}

interface ProjectListProps {
  onSelectProject?: (project: Project) => void;
}

export function ProjectList({ onSelectProject }: ProjectListProps) {
  const router = useRouter();
  const {
    isLoading,
    isLoadingHours,
    isLoadingBillingModes,
    billingModes,
    searchQuery,
    setSearchQuery,
    getFilteredProjects,
    toggleFavorite,
    fetchProjects,
  } = useProjectsStore();

  const selectedCompany = useCompanyStore((state) => state.selectedCompany);

  const [filterBy, setFilterBy] = useState<FilterOption>('all');
  const [sortBy, setSortBy] = useState<SortOption>('name-asc');
  const [customerFilter, setCustomerFilter] = useState<CustomerFilter>('all');

  const handleProjectClick = (project: Project) => {
    if (onSelectProject) {
      onSelectProject(project);
    } else {
      // Navigate to project details page
      router.push(`/projects/${encodeURIComponent(project.code)}`);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const filteredProjects = getFilteredProjects();

  // Get unique customers for the filter dropdown
  const uniqueCustomers = useMemo(() => {
    const customers = new Set<string>();
    filteredProjects.forEach((p) => {
      customers.add(p.customerName || 'No Customer');
    });
    return Array.from(customers).sort();
  }, [filteredProjects]);

  // Apply filter and sort
  const processedProjects = useMemo(() => {
    let result = [...filteredProjects];

    // Apply customer filter
    if (customerFilter !== 'all') {
      result = result.filter((p) => (p.customerName || 'No Customer') === customerFilter);
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

    // Apply sort (with null safety for undefined names/codes)
    switch (sortBy) {
      case 'name-asc':
        result.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
        break;
      case 'name-desc':
        result.sort((a, b) => (b.name ?? '').localeCompare(a.name ?? ''));
        break;
      case 'code':
        result.sort((a, b) => (a.code ?? '').localeCompare(b.code ?? ''));
        break;
      case 'recent':
        // Favorites first, then by name
        result.sort((a, b) => {
          if (a.isFavorite && !b.isFavorite) return -1;
          if (!a.isFavorite && b.isFavorite) return 1;
          return (a.name ?? '').localeCompare(b.name ?? '');
        });
        break;
    }

    return result;
  }, [filteredProjects, filterBy, sortBy, customerFilter]);

  // Group projects by customer
  const groupedProjects = processedProjects.reduce(
    (groups, project) => {
      const customer = project.customerName || 'No Customer';
      if (!groups[customer]) {
        groups[customer] = [];
      }
      groups[customer].push(project);
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
      {/* Business Central Links */}
      <div className="flex items-center gap-4 text-sm">
        <span className="text-gray-400">Open in Business Central:</span>
        <a
          href={getBCJobsListUrl()}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-thyme-400 hover:text-thyme-300"
        >
          Projects
          <ArrowTopRightOnSquareIcon className="h-4 w-4" />
        </a>
        <a
          href={getBCCustomersListUrl()}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-thyme-400 hover:text-thyme-300"
        >
          Customers
          <ArrowTopRightOnSquareIcon className="h-4 w-4" />
        </a>
      </div>

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
          {/* Customer Filter */}
          <div className="flex items-center gap-2">
            <Select
              value={customerFilter}
              onChange={(e) => setCustomerFilter(e.target.value)}
              className="w-40"
              options={[
                { value: 'all', label: 'All Customers' },
                ...uniqueCustomers.map((customer) => ({ value: customer, label: customer })),
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

      {/* Projects Table */}
      <div className="overflow-hidden rounded-lg border border-dark-600">
        <table className="w-full">
          <thead className="bg-dark-700">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-400">Project</th>
              <th className="w-24 px-4 py-3 text-center text-sm font-medium text-gray-400">
                Billing
                {isLoadingBillingModes && (
                  <span className="ml-2 inline-block h-3 w-3 animate-spin rounded-full border-2 border-gray-500 border-t-thyme-500" />
                )}
              </th>
              <th className="w-24 px-4 py-3 text-right text-sm font-medium text-gray-400">
                Planned
              </th>
              <th className="w-24 px-4 py-3 text-right text-sm font-medium text-gray-400">
                Spent
                {isLoadingHours && (
                  <span className="ml-2 inline-block h-3 w-3 animate-spin rounded-full border-2 border-gray-500 border-t-thyme-500" />
                )}
              </th>
              <th className="w-32 px-4 py-3 text-right text-sm font-medium text-gray-400">
                Remaining
              </th>
              <th className="w-20 px-4 py-3 text-center text-sm font-medium text-gray-400">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-dark-600">
            {Object.entries(groupedProjects).map(([customer, customerProjects]) => (
              <Fragment key={customer}>
                {/* Customer group header */}
                <tr className="bg-dark-800/50">
                  <td colSpan={6} className="px-4 py-2 text-sm font-medium text-gray-400">
                    {customer}
                  </td>
                </tr>
                {/* Projects in this group */}
                {customerProjects.map((project) => (
                  <ProjectRow
                    key={project.id}
                    project={project}
                    billingMode={billingModes.get(project.code)}
                    onProjectClick={handleProjectClick}
                    onToggleFavorite={toggleFavorite}
                    companyName={selectedCompany?.name}
                  />
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

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

interface ProjectRowProps {
  project: Project;
  billingMode?: BillingMode;
  onProjectClick: (project: Project) => void;
  onToggleFavorite: (projectId: string) => void;
  companyName?: string;
}

function ProjectRow({
  project,
  billingMode,
  onProjectClick,
  onToggleFavorite,
  companyName,
}: ProjectRowProps) {
  const budget = project.budgetHours; // From Job Planning Lines
  const hours = project.totalHours; // From timesheets
  const remaining = budget !== undefined && hours !== undefined ? budget - hours : undefined;
  const percentUsed =
    budget !== undefined && hours !== undefined ? Math.round((hours / budget) * 100) : undefined;

  return (
    <tr
      className="cursor-pointer transition-colors hover:bg-dark-700/50"
      onClick={() => onProjectClick(project)}
    >
      {/* Project column */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          {/* Color indicator */}
          <div
            className="h-3 w-3 shrink-0 rounded-full"
            style={{ backgroundColor: project.color }}
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-medium text-white">{project.name}</span>
              <span
                className={cn(
                  'rounded px-1.5 py-0.5 text-xs',
                  project.status === 'active'
                    ? 'bg-green-900/50 text-green-400'
                    : 'bg-gray-700 text-gray-400'
                )}
              >
                {project.status}
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <span className="font-mono text-xs">{project.code}</span>
              <span>·</span>
              <span>{project.tasks.length} tasks</span>
            </div>
          </div>
        </div>
      </td>

      {/* Billing Mode column */}
      <td className="px-4 py-3 text-center">
        {billingMode ? (
          <span
            className={cn(
              'whitespace-nowrap rounded px-1.5 py-0.5 text-xs font-medium',
              getBillingModeStyles(billingMode)
            )}
          >
            {billingMode}
          </span>
        ) : (
          <span className="text-gray-600">-</span>
        )}
      </td>

      {/* Budget column */}
      <td className="px-4 py-3 text-right text-gray-500">
        {budget !== undefined ? `${budget.toFixed(0)}h` : '-'}
      </td>

      {/* Hours column with progress bar */}
      <td className="px-4 py-3">
        <div className="flex flex-col items-end gap-1">
          <span className="text-white">{hours !== undefined ? `${hours.toFixed(1)}h` : '-'}</span>
          {budget !== undefined && hours !== undefined && percentUsed !== undefined && (
            <div className="h-1.5 w-20 overflow-hidden rounded-full bg-dark-600">
              <div
                className={cn(
                  'h-full rounded-full transition-all',
                  percentUsed > 100
                    ? 'bg-red-500'
                    : percentUsed > 80
                      ? 'bg-amber-500'
                      : 'bg-thyme-500'
                )}
                style={{ width: `${Math.min(percentUsed, 100)}%` }}
              />
            </div>
          )}
        </div>
      </td>

      {/* Remaining column */}
      <td className="px-4 py-3 text-right">
        {remaining !== undefined && percentUsed !== undefined ? (
          <span className={cn(remaining < 0 ? 'text-red-400' : 'text-gray-400')}>
            {remaining.toFixed(0)}h ({percentUsed}%)
          </span>
        ) : (
          <span className="text-gray-500">-</span>
        )}
      </td>

      {/* Actions column */}
      <td className="px-4 py-3">
        <div className="flex items-center justify-center gap-1">
          {/* Open in BC button */}
          <a
            href={getBCJobUrl(project.code, companyName)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="rounded p-1 text-gray-400 transition-colors hover:bg-dark-600 hover:text-thyme-400"
            title="Open in Business Central"
          >
            <ArrowTopRightOnSquareIcon className="h-5 w-5" />
          </a>

          {/* Favorite button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite(project.id);
            }}
            className="rounded p-1 transition-colors hover:bg-dark-600"
          >
            {project.isFavorite ? (
              <StarSolidIcon className="h-5 w-5 text-amber-400" />
            ) : (
              <StarOutlineIcon className="h-5 w-5 text-gray-400" />
            )}
          </button>
        </div>
      </td>
    </tr>
  );
}
