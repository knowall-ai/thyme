'use client';

import Link from 'next/link';
import { ArrowLeftIcon, ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline';
import { useProjectDetailsStore } from '@/hooks/useProjectDetailsStore';
import { useCompanyStore } from '@/hooks';
import { getBCJobUrl } from '@/utils';
import { cn } from '@/utils';

export function ProjectHeader() {
  const { project } = useProjectDetailsStore();
  const selectedCompany = useCompanyStore((state) => state.selectedCompany);

  if (!project) return null;

  return (
    <div className="space-y-4">
      {/* Back link */}
      <Link
        href="/projects"
        className="inline-flex items-center gap-2 text-sm text-gray-400 transition-colors hover:text-white"
      >
        <ArrowLeftIcon className="h-4 w-4" />
        Back to Projects
      </Link>

      {/* Project header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          {/* Color indicator */}
          <div
            className="mt-1.5 h-4 w-4 shrink-0 rounded-full"
            style={{ backgroundColor: project.color }}
          />

          <div>
            <div className="flex items-center gap-3">
              <span className="font-mono text-sm text-gray-400">{project.code}</span>
              <span
                className={cn(
                  'rounded px-2 py-0.5 text-xs font-medium',
                  project.status === 'active'
                    ? 'bg-green-500/20 text-green-400'
                    : project.status === 'completed'
                      ? 'bg-gray-500/20 text-gray-400'
                      : 'bg-amber-500/20 text-amber-400'
                )}
              >
                {project.status}
              </span>
            </div>
            <h1 className="mt-1 text-2xl font-bold text-white">{project.name}</h1>
            {project.customerName && <p className="mt-1 text-gray-400">{project.customerName}</p>}
          </div>
        </div>

        {/* BC Link */}
        <a
          href={getBCJobUrl(project.code, selectedCompany?.name)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 rounded-lg border border-dark-600 bg-dark-700 px-4 py-2 text-sm text-gray-300 transition-colors hover:border-thyme-500/50 hover:text-white"
        >
          <ArrowTopRightOnSquareIcon className="h-4 w-4" />
          Open in Business Central
        </a>
      </div>
    </div>
  );
}
