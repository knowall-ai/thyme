'use client';

import { useEffect } from 'react';
import { useProjectDetailsStore } from '@/hooks/useProjectDetailsStore';
import { ProjectHeader } from './ProjectHeader';
import { ProjectKPICards } from './ProjectKPICards';
import { ProjectCharts } from './ProjectCharts';
import { ProjectTasksTable } from './ProjectTasksTable';
import { ProjectSourceLinksCard } from './ProjectSourceLinksCard';
import { BcErrorCard } from '@/components/ui';

interface ProjectDetailsProps {
  params: { projectNumber: string };
}

export function ProjectDetails({ params }: ProjectDetailsProps) {
  const { projectNumber } = params;
  const { project, isLoading, error, errorTitle, fetchProjectDetails } = useProjectDetailsStore();

  useEffect(() => {
    fetchProjectDetails(projectNumber);
  }, [projectNumber, fetchProjectDetails]);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="border-thyme-600 h-8 w-8 animate-spin rounded-full border-b-2"></div>
      </div>
    );
  }

  if (error) {
    return (
      <BcErrorCard
        title={errorTitle ?? "Couldn't load this project"}
        error={error}
        // Load it all again (a forced reload, as the failed part may be all that's missing)
        onRetry={() => fetchProjectDetails(projectNumber, { force: true })}
      />
    );
  }

  if (!project) {
    return (
      <div className="py-12 text-center">
        <p className="text-gray-500">Project not found</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ProjectHeader />
      <ProjectKPICards />
      <ProjectCharts />
      <ProjectTasksTable />
      <ProjectSourceLinksCard />
    </div>
  );
}
