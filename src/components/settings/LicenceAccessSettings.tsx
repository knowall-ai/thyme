'use client';

import { useEffect, useState } from 'react';
import { IdentificationIcon } from '@heroicons/react/24/outline';
import { Button, Card } from '@/components/ui';
import { getLicenceToken, requestLicenceConsent } from '@/services/auth/licenceService';

/**
 * Lets a Microsoft 365 administrator grant Thyme the directory permission
 * (Directory.Read.All) it needs to show licences on the Team page. Once granted, the
 * Team page shows the licence view to admins only.
 */
export function LicenceAccessSettings() {
  // Undefined while checking
  const [granted, setGranted] = useState<boolean | undefined>();
  const [isRedirecting, setIsRedirecting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getLicenceToken().then((token) => !cancelled && setGranted(!!token));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Card variant="bordered" className="p-6">
      <div className="mb-3 flex items-center gap-2">
        <IdentificationIcon className="text-thyme-500 h-5 w-5" />
        <h2 className="text-lg font-semibold text-white">Licences (Microsoft 365 admins)</h2>
      </div>
      <p className="text-dark-400 text-sm">
        See who has which Business Central and Microsoft 365 licence, what they cost, and licences
        that look wrong, on the Team page. Thyme needs permission to read your directory, which only
        a Microsoft 365 administrator can grant. Only Global, License, User, Billing and Dynamics
        365 administrators and Global Readers see the view.
      </p>
      <div className="mt-4">
        {granted ? (
          <p className="text-thyme-400 text-sm">Granted: the licence view is on the Team page.</p>
        ) : (
          <Button
            size="sm"
            variant="secondary"
            isLoading={granted === undefined || isRedirecting}
            onClick={() => {
              setIsRedirecting(true);
              void requestLicenceConsent().catch(() => setIsRedirecting(false));
            }}
          >
            Allow Thyme to read licences
          </Button>
        )}
      </div>
    </Card>
  );
}
