'use client';

import { AuthenticatedTemplate, UnauthenticatedTemplate } from '@/services/auth';
import { Layout } from '@/components/layout';
import { PlanPanel } from '@/components/plan';

function PlanContent() {
  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Plan</h1>
          <p className="text-dark-400 mt-1">Manage team timesheets and plan resource allocation</p>
        </div>
        <PlanPanel />
      </div>
    </Layout>
  );
}

export default function PlanPage() {
  return (
    <>
      <UnauthenticatedTemplate>
        <meta httpEquiv="refresh" content="0;url=/" />
      </UnauthenticatedTemplate>
      <AuthenticatedTemplate>
        <PlanContent />
      </AuthenticatedTemplate>
    </>
  );
}
