'use client';

import { Layout } from '@/components/layout';
import { TeamList } from '@/components/team';

// Sign-in and company sync are handled by the [environment]/[companyId] layout
export default function TeamPage() {
  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Team</h1>
          <p className="text-dark-400 mt-1">View your team&apos;s timesheet progress</p>
        </div>
        <TeamList />
      </div>
    </Layout>
  );
}
