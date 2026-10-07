'use client';

import { Layout } from '@/components/layout';
import { SettingsPanel } from '@/components/settings';

// Sign-in and company sync are handled by the [environment]/[companyId] layout
export default function SettingsPage() {
  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Settings</h1>
          <p className="text-dark-400 mt-1">
            Configure your Thyme settings and view Business Central information
          </p>
        </div>
        <SettingsPanel />
      </div>
    </Layout>
  );
}
