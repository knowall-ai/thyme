'use client';

import { AuthenticatedTemplate, UnauthenticatedTemplate } from '@/services/auth';
import { Layout } from '@/components/layout';
import { ReportsPanel } from '@/components/reports';

function ReportsContent() {
  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Reports</h1>
          <p className="text-dark-400 mt-1">View time tracking reports and analytics</p>
        </div>
        <ReportsPanel />
      </div>
    </Layout>
  );
}

export default function ReportsPage() {
  return (
    <>
      <UnauthenticatedTemplate>
        <meta httpEquiv="refresh" content="0;url=/" />
      </UnauthenticatedTemplate>
      <AuthenticatedTemplate>
        <ReportsContent />
      </AuthenticatedTemplate>
    </>
  );
}
