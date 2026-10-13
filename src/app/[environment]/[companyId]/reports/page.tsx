'use client';

import { Layout } from '@/components/layout';
import { ReportsPanel } from '@/components/reports';

// Sign-in and company sync are handled by the [environment]/[companyId] layout
export default function ReportsPage() {
  return (
    <Layout>
      <div className="space-y-6">
        {/* The printed report has its own heading, with the period and filters */}
        <div className="print:hidden">
          <h1 className="text-2xl font-bold text-white">Reports</h1>
          <p className="text-dark-400 mt-1">View time tracking reports and analytics</p>
        </div>
        <ReportsPanel />
      </div>
    </Layout>
  );
}
