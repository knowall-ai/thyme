'use client';

import { AuthenticatedTemplate, UnauthenticatedTemplate } from '@/services/auth';
import { Layout } from '@/components/layout';
import { ProjectList } from '@/components/projects/ProjectList';

function ProjectsContent() {
  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Projects</h1>
          <p className="text-dark-400 mt-1">Browse and manage your Business Central projects</p>
        </div>
        <ProjectList />
      </div>
    </Layout>
  );
}

export default function ProjectsPage() {
  return (
    <>
      <UnauthenticatedTemplate>
        <meta httpEquiv="refresh" content="0;url=/" />
      </UnauthenticatedTemplate>
      <AuthenticatedTemplate>
        <ProjectsContent />
      </AuthenticatedTemplate>
    </>
  );
}
