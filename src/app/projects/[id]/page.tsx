'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AuthenticatedTemplate, UnauthenticatedTemplate } from '@/services/auth';
import { Layout } from '@/components/layout';
import { projectService, bcClient } from '@/services/bc';
import type { Project, TimeEntry, BCTimeEntry } from '@/types';
import { ProjectDetailsHeader } from '@/components/projects/ProjectDetailsHeader';
import { ProjectStatsCards } from '@/components/projects/ProjectStatsCards';
import { ProjectTimeChart } from '@/components/projects/ProjectTimeChart';
import { ProjectTasksTable } from '@/components/projects/ProjectTasksTable';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';

// Convert BC time entries to app format for display
function mapBCTimeEntriesToTimeEntries(bcEntries: BCTimeEntry[], projectId: string): TimeEntry[] {
  return bcEntries.map((entry) => ({
    id: entry.id,
    projectId: projectId,
    taskId: entry.jobTaskNo,
    userId: entry.no, // Resource number as user ID
    date: entry.postingDate,
    hours: entry.quantity,
    notes: entry.description,
    isBillable: entry.entryType === 'Sale' || entry.totalPrice > 0,
    isRunning: false,
    createdAt: entry.postingDate,
    updatedAt: entry.postingDate,
    syncStatus: 'synced' as const,
    // Store BC-specific data for stats calculation
    unitCost: entry.unitCost,
    totalCost: entry.totalCost,
    unitPrice: entry.unitPrice,
    totalPrice: entry.totalPrice,
  }));
}

function ProjectDetailsContent() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [bcTimeEntries, setBcTimeEntries] = useState<BCTimeEntry[]>([]);
  const [hasRealTimeData, setHasRealTimeData] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadProject() {
      if (!projectId) return;

      setIsLoading(true);
      setError(null);

      try {
        const projectData = await projectService.getProject(projectId);
        if (!projectData) {
          setError('Project not found');
          return;
        }
        setProject(projectData);

        // Try to fetch time entries from BC extension first
        const extensionInstalled = await bcClient.isExtensionInstalled();
        if (extensionInstalled) {
          try {
            const entries = await bcClient.getProjectTimeEntries(projectData.code);
            setBcTimeEntries(entries);
            setTimeEntries(mapBCTimeEntriesToTimeEntries(entries, projectId));
            setHasRealTimeData(true);
          } catch {
            // Extension installed but timeEntries endpoint not available yet
            // Fall back to localStorage
            loadLocalEntries();
          }
        } else {
          // No extension, use localStorage
          loadLocalEntries();
        }

        function loadLocalEntries() {
          const storedEntries = localStorage.getItem('thyme_time_entries');
          if (storedEntries) {
            const allEntries: TimeEntry[] = JSON.parse(storedEntries);
            const projectEntries = allEntries.filter((e) => e.projectId === projectId);
            setTimeEntries(projectEntries);
          }
          setHasRealTimeData(false);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load project');
      } finally {
        setIsLoading(false);
      }
    }

    loadProject();
  }, [projectId]);

  if (isLoading) {
    return (
      <Layout>
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-thyme-600"></div>
        </div>
      </Layout>
    );
  }

  if (error || !project) {
    return (
      <Layout>
        <div className="space-y-6">
          <Link
            href="/projects"
            className="inline-flex items-center gap-2 text-sm text-dark-400 transition-colors hover:text-white"
          >
            <ArrowLeftIcon className="h-4 w-4" />
            Back to Projects
          </Link>
          <div className="py-12 text-center">
            <p className="text-red-400">{error || 'Project not found'}</p>
            <button
              onClick={() => router.push('/projects')}
              className="mt-4 text-thyme-500 hover:text-thyme-400"
            >
              Return to projects list
            </button>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        {/* Back link */}
        <Link
          href="/projects"
          className="inline-flex items-center gap-2 text-sm text-dark-400 transition-colors hover:text-white"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          Back to Projects
        </Link>

        {/* Project Header */}
        <ProjectDetailsHeader project={project} />

        {/* Stats Cards */}
        <ProjectStatsCards
          project={project}
          timeEntries={timeEntries}
          bcTimeEntries={bcTimeEntries}
          hasRealTimeData={hasRealTimeData}
        />

        {/* Time Chart */}
        <ProjectTimeChart project={project} timeEntries={timeEntries} />

        {/* Tasks Table */}
        <ProjectTasksTable
          project={project}
          timeEntries={timeEntries}
          bcTimeEntries={bcTimeEntries}
          hasRealTimeData={hasRealTimeData}
        />
      </div>
    </Layout>
  );
}

export default function ProjectDetailsPage() {
  return (
    <>
      <UnauthenticatedTemplate>
        <meta httpEquiv="refresh" content="0;url=/" />
      </UnauthenticatedTemplate>
      <AuthenticatedTemplate>
        <ProjectDetailsContent />
      </AuthenticatedTemplate>
    </>
  );
}
