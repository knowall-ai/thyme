'use client';

import {
  PencilIcon,
  EllipsisHorizontalIcon,
  StarIcon as StarOutlineIcon,
} from '@heroicons/react/24/outline';
import { StarIcon as StarSolidIcon } from '@heroicons/react/24/solid';
import { Button } from '@/components/ui';
import { useProjectsStore } from '@/hooks';
import type { Project } from '@/types';
import { cn } from '@/utils';

interface ProjectDetailsHeaderProps {
  project: Project;
}

export function ProjectDetailsHeader({ project }: ProjectDetailsHeaderProps) {
  const { toggleFavorite } = useProjectsStore();

  return (
    <div className="space-y-4">
      {/* Client name */}
      {project.clientName && (
        <p className="text-sm font-medium text-dark-400">{project.clientName}</p>
      )}

      {/* Project title and actions */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            {/* Color indicator */}
            <div
              className="h-4 w-4 shrink-0 rounded-full"
              style={{ backgroundColor: project.color }}
            />
            <h1 className="text-2xl font-bold text-white">{project.name}</h1>
          </div>

          {/* Project code and status */}
          <div className="mt-2 flex items-center gap-3">
            <span className="font-mono text-sm text-dark-400">{project.code}</span>
            <span
              className={cn(
                'rounded px-2 py-0.5 text-xs font-medium',
                project.status === 'active'
                  ? 'bg-green-500/20 text-green-400'
                  : project.status === 'completed'
                    ? 'bg-blue-500/20 text-blue-400'
                    : 'bg-dark-700 text-dark-400'
              )}
            >
              {project.status.charAt(0).toUpperCase() + project.status.slice(1)}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => toggleFavorite(project.id)}
            className="rounded-lg p-2 text-dark-400 transition-colors hover:bg-dark-700 hover:text-white"
            title={project.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
          >
            {project.isFavorite ? (
              <StarSolidIcon className="h-5 w-5 text-amber-400" />
            ) : (
              <StarOutlineIcon className="h-5 w-5" />
            )}
          </button>
          <Button variant="outline" size="sm">
            <PencilIcon className="mr-1.5 h-4 w-4" />
            Edit project
          </Button>
          <Button variant="ghost" size="icon">
            <EllipsisHorizontalIcon className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
