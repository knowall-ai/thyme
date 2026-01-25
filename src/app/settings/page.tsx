'use client';

import { AuthenticatedTemplate, UnauthenticatedTemplate } from '@/services/auth';
import { Layout } from '@/components/layout';
import { SettingsPanel } from '@/components/settings';

function SettingsContent() {
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

export default function SettingsPage() {
  return (
    <>
      <UnauthenticatedTemplate>
        <meta httpEquiv="refresh" content="0;url=/" />
      </UnauthenticatedTemplate>
      <AuthenticatedTemplate>
        <SettingsContent />
      </AuthenticatedTemplate>
    </>
  );
}
