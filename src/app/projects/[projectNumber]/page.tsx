'use client';

import { use } from 'react';
import { AuthenticatedTemplate, UnauthenticatedTemplate } from '@/services/auth';
import { Layout } from '@/components/layout';
import { ProjectDetails } from '@/components/projects/ProjectDetails';

// Next.js 15 types params as Promise, but for client components it's still sync at runtime
// Use a union type to handle both Next.js 14 (object) and 15 (Promise) signatures
type ParamsType = { projectNumber: string } | Promise<{ projectNumber: string }>;

interface ProjectDetailsPageProps {
  params: ParamsType;
}

function ProjectDetailsContent({ projectNumber }: { projectNumber: string }) {
  return (
    <Layout>
      <ProjectDetails params={{ projectNumber }} />
    </Layout>
  );
}

export default function ProjectDetailsPage({ params }: ProjectDetailsPageProps) {
  // Handle both Next.js 14 (sync) and 15 (async) params
  const resolvedParams = params instanceof Promise ? use(params) : params;

  return (
    <>
      <UnauthenticatedTemplate>
        <meta httpEquiv="refresh" content="0;url=/" />
      </UnauthenticatedTemplate>
      <AuthenticatedTemplate>
        <ProjectDetailsContent projectNumber={resolvedParams.projectNumber} />
      </AuthenticatedTemplate>
    </>
  );
}
