'use client';

import { use } from 'react';
import { Layout } from '@/components/layout';
import { ProjectDetails } from '@/components/projects/ProjectDetails';

// Next.js 15 types params as Promise for page components
type Params = { projectNumber: string };

// Sign-in and company sync are handled by the [environment]/[companyId] layout
export default function ProjectDetailsPage({ params }: { params: Promise<Params> }) {
  // Next.js 15 passes params as Promise, Next.js 14 passes plain object
  // Check for Promise using instanceof (preferred) or thenable duck-typing (fallback)
  const isPromise = params instanceof Promise || (typeof params === 'object' && 'then' in params);
  const resolvedParams = isPromise ? use(params as Promise<Params>) : (params as unknown as Params);

  return (
    <Layout>
      <ProjectDetails params={{ projectNumber: resolvedParams.projectNumber }} />
    </Layout>
  );
}
