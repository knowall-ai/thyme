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
  // Next.js 15 passes params as Promise, Next.js 14 passes plain object
  // Check for Promise using instanceof (preferred) or thenable duck-typing (fallback)
  const isPromise = params instanceof Promise || (typeof params === 'object' && 'then' in params);
  const resolvedParams = isPromise ? use(params as Promise<Params>) : (params as unknown as Params);

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
