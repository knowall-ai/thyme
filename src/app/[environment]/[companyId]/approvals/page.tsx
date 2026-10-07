'use client';

import { Layout } from '@/components/layout';
import { ApprovalList } from '@/components/approvals';

// Sign-in and company sync are handled by the [environment]/[companyId] layout
export default function ApprovalsPage() {
  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Timesheet Approvals</h1>
          <p className="text-dark-400 mt-1">
            Review and process submitted timesheets from your team
          </p>
        </div>
        <ApprovalList />
      </div>
    </Layout>
  );
}
