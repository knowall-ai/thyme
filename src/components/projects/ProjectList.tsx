'use client';

import { MagnifyingGlassIcon, StarIcon as StarOutlineIcon } from '@heroicons/react/24/outline';
import { StarIcon as StarSolidIcon } from '@heroicons/react/24/solid';
import { Card, Input } from '@/components/ui';
import { useProjectsStore } from '@/hooks';
import type { Project } from '@/types';
import { cn } from '@/utils';

interface ProjectListProps {
  onSelectProject?: (project: Project) => void;
}

export function ProjectList({ onSelectProject }: ProjectListProps) {
  const { isLoading, searchQuery, setSearchQuery, getFilteredProjects, toggleFavorite } =
    useProjectsStore();

  const filteredProjects = getFilteredProjects();

  // Group projects by client
  const groupedProjects = filteredProjects.reduce(
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
      {/* Search */}
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
                    <h4 className="truncate font-medium text-gray-900">{project.name}</h4>
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
      {filteredProjects.length === 0 && (
        <div className="py-12 text-center">
          <p className="text-gray-500">
            {searchQuery ? 'No projects match your search' : 'No projects available'}
          </p>
        </div>
      )}
    </div>
  );
}
