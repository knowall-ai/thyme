'use client';

import { useAuth, AuthenticatedTemplate, UnauthenticatedTemplate } from '@/services/auth';
import { LandingPage } from '@/components/landing/LandingPage';
import { Dashboard } from '@/components/dashboard/Dashboard';

export default function Home() {
  return (
    <>
      <UnauthenticatedTemplate>
        <LandingPage />
      </UnauthenticatedTemplate>
      <AuthenticatedTemplate>
        <Dashboard />
      </AuthenticatedTemplate>
    </>
  );
}
