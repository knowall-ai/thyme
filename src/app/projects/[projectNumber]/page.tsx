'use client';

import { use } from 'react';
import { AuthenticatedTemplate, UnauthenticatedTemplate } from '@/services/auth';
import { Layout } from '@/components/layout';
import { ProjectDetails } from '@/components/projects/ProjectDetails';

// Next.js 15 types params as Promise for page components
type Params = { projectNumber: string };

function ProjectDetailsContent({ projectNumber }: { projectNumber: string }) {
  return (
    <Layout>
      <ProjectDetails params={{ projectNumber }} />
    </Layout>
  );
}

export default function ProjectDetailsPage({ params }: { params: Promise<Params> }) {
  // use() unwraps the Promise in Next.js 15
  // In Next.js 14 (local dev with old node_modules), params may be sync
  const resolvedParams = 'then' in params ? use(params) : (params as unknown as Params);

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
