'use client';

import { AuthenticatedTemplate, UnauthenticatedTemplate } from '@/services/auth';
import { Layout } from '@/components/layout';
import { TeamList } from '@/components/team';
import { PendingApprovalCard } from '@/components/approvals';

function TeamContent() {
  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Team</h1>
          <p className="text-dark-400 mt-1">View your team&apos;s timesheet progress</p>
        </div>
        <PendingApprovalCard />
        <div className="mt-2">
          <TeamList />
        </div>
      </div>
    </Layout>
  );
}

export default function TeamPage() {
  return (
    <>
      <UnauthenticatedTemplate>
        <meta httpEquiv="refresh" content="0;url=/" />
      </UnauthenticatedTemplate>
      <AuthenticatedTemplate>
        <TeamContent />
      </AuthenticatedTemplate>
    </>
  );
}
