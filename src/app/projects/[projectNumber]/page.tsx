'use client';

import { AuthenticatedTemplate, UnauthenticatedTemplate } from '@/services/auth';
import { Layout } from '@/components/layout';
import { ProjectDetails } from '@/components/projects/ProjectDetails';

interface ProjectDetailsPageProps {
  params: Promise<{ projectNumber: string }>;
}

function ProjectDetailsContent({ params }: ProjectDetailsPageProps) {
  return (
    <Layout>
      <ProjectDetails params={params} />
    </Layout>
  );
}

export default function ProjectDetailsPage({ params }: ProjectDetailsPageProps) {
  return (
    <>
      <UnauthenticatedTemplate>
        <meta httpEquiv="refresh" content="0;url=/" />
      </UnauthenticatedTemplate>
      <AuthenticatedTemplate>
        <ProjectDetailsContent params={params} />
      </AuthenticatedTemplate>
    </>
  );
}
