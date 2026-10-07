'use client';

import { Layout } from '@/components/layout';
import { PlanPanel } from '@/components/plan';

// Sign-in and company sync are handled by the [environment]/[companyId] layout
export default function PlanPage() {
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
