'use client';

import { useEffect } from 'react';
import { useProjectDetailsStore } from '@/hooks/useProjectDetailsStore';
import { ProjectHeader } from './ProjectHeader';
import { ProjectKPICards } from './ProjectKPICards';
import { ProjectCharts } from './ProjectCharts';
import { ProjectTasksTable } from './ProjectTasksTable';

interface ProjectDetailsProps {
  params: { projectNumber: string };
}

export function ProjectDetails({ params }: ProjectDetailsProps) {
  const { projectNumber } = params;
  const { project, isLoading, error, fetchProjectDetails } = useProjectDetailsStore();

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
      <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-6 text-center">
        <p className="text-red-400">{error}</p>
      </div>
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
    </div>
  );
}
