'use client';

import { use } from 'react';
import { AuthenticatedTemplate, UnauthenticatedTemplate } from '@/services/auth';
import { Layout } from '@/components/layout';
import { ProjectDetails } from '@/components/projects';

interface ProjectPageProps {
  params: Promise<{ id: string }>;
}

function ProjectDetailsContent({ projectId }: { projectId: string }) {
  return (
    <Layout>
      <ProjectDetails projectId={projectId} />
    </Layout>
  );
}

export default function ProjectPage({ params }: ProjectPageProps) {
  const { id } = use(params);

  return (
    <>
      <UnauthenticatedTemplate>
        <meta httpEquiv="refresh" content="0;url=/" />
      </UnauthenticatedTemplate>
      <AuthenticatedTemplate>
        <ProjectDetailsContent projectId={id} />
      </AuthenticatedTemplate>
    </>
  );
}
