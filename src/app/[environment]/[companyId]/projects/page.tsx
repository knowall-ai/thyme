'use client';

import { Layout } from '@/components/layout';
import { ProjectList } from '@/components/projects/ProjectList';

// Sign-in and company sync are handled by the [environment]/[companyId] layout
export default function ProjectsPage() {
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
