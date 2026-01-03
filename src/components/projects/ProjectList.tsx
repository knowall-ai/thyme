'use client';

import { useState } from 'react';
import {
  MagnifyingGlassIcon,
  StarIcon as StarOutlineIcon,
} from '@heroicons/react/24/outline';
import { StarIcon as StarSolidIcon } from '@heroicons/react/24/solid';
import { Card, Input } from '@/components/ui';
import { useProjectsStore } from '@/hooks';
import type { Project } from '@/types';
import { cn } from '@/utils';

interface ProjectListProps {
  onSelectProject?: (project: Project) => void;
}

export function ProjectList({ onSelectProject }: ProjectListProps) {
  const {
    projects,
    isLoading,
    searchQuery,
    setSearchQuery,
    getFilteredProjects,
    toggleFavorite,
  } = useProjectsStore();

  const filteredProjects = getFilteredProjects();

  // Group projects by client
  const groupedProjects = filteredProjects.reduce((groups, project) => {
    const client = project.clientName || 'No Client';
    if (!groups[client]) {
      groups[client] = [];
    }
    groups[client].push(project);
    return groups;
  }, {} as Record<string, Project[]>);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-thyme-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Search */}
      <div className="relative">
        <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
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
          <h3 className="text-sm font-medium text-gray-500 mb-2">{client}</h3>
          <div className="space-y-2">
            {clientProjects.map((project) => (
              <Card
                key={project.id}
                variant="bordered"
                className={cn(
                  'p-4 cursor-pointer hover:shadow-md transition-shadow',
                  onSelectProject && 'hover:border-thyme-300'
                )}
                onClick={() => onSelectProject?.(project)}
              >
                <div className="flex items-start gap-3">
                  {/* Color indicator */}
                  <div
                    className="w-3 h-3 rounded-full mt-1.5 shrink-0"
                    style={{ backgroundColor: project.color }}
                  />

                  {/* Project info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-gray-500">
                        {project.code}
                      </span>
                      <span
                        className={cn(
                          'text-xs px-1.5 py-0.5 rounded',
                          project.status === 'active'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-600'
                        )}
                      >
                        {project.status}
                      </span>
                    </div>
                    <h4 className="font-medium text-gray-900 truncate">
                      {project.name}
                    </h4>
                    <p className="text-sm text-gray-500">
                      {project.tasks.length} tasks
                    </p>
                  </div>

                  {/* Favorite button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFavorite(project.id);
                    }}
                    className="p-1 rounded hover:bg-gray-100 transition-colors"
                  >
                    {project.isFavorite ? (
                      <StarSolidIcon className="w-5 h-5 text-amber-400" />
                    ) : (
                      <StarOutlineIcon className="w-5 h-5 text-gray-400" />
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
        <div className="text-center py-12">
          <p className="text-gray-500">
            {searchQuery
              ? 'No projects match your search'
              : 'No projects available'}
          </p>
        </div>
      )}
    </div>
  );
}
