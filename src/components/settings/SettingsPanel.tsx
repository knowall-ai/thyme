'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui';
import { bcClient } from '@/services/bc/bcClient';
import { useAuth } from '@/services/auth';
import {
  BuildingOffice2Icon,
  EnvelopeIcon,
  GlobeAltIcon,
  CurrencyPoundIcon,
  UserCircleIcon,
} from '@heroicons/react/24/outline';

interface CompanyInfo {
  displayName: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  postalCode: string;
  country: string;
  email: string;
  website: string;
  currencyCode: string;
}

export function SettingsPanel() {
  const { account } = useAuth();
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchCompanyInfo() {
      try {
        const response = await bcClient.getCompanyInfo();
        setCompanyInfo(response);
      } catch (err) {
        console.error('Failed to fetch company info:', err);
        setError('Failed to load company information');
      } finally {
        setIsLoading(false);
      }
    }
    fetchCompanyInfo();
  }, []);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-thyme-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* User Information */}
      <Card variant="bordered" className="p-6">
        <div className="mb-4 flex items-center gap-3">
          <UserCircleIcon className="h-6 w-6 text-thyme-500" />
          <h2 className="text-lg font-semibold text-white">Your Account</h2>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <p className="text-sm text-dark-400">Name</p>
            <p className="text-dark-100">{account?.name || 'Not available'}</p>
          </div>
          <div>
            <p className="text-sm text-dark-400">Email</p>
            <p className="text-dark-100">
              {account?.username ? (
                <a
                  href={`mailto:${account.username}`}
                  className="hover:text-thyme-400 hover:underline"
                >
                  {account.username}
                </a>
              ) : (
                'Not available'
              )}
            </p>
          </div>
        </div>
      </Card>

      {/* Company Information */}
      <Card variant="bordered" className="p-6">
        <div className="mb-4 flex items-center gap-3">
          <BuildingOffice2Icon className="h-6 w-6 text-thyme-500" />
          <h2 className="text-lg font-semibold text-white">Business Central Company</h2>
        </div>
        {error ? (
          <p className="text-red-500">{error}</p>
        ) : companyInfo ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <p className="text-sm text-dark-400">Company Name</p>
              <p className="text-dark-100">{companyInfo.displayName}</p>
            </div>
            <div>
              <p className="text-sm text-dark-400">Address</p>
              <p className="text-dark-100">
                {companyInfo.addressLine1}
                {companyInfo.addressLine2 && <>, {companyInfo.addressLine2}</>}
                <br />
                {companyInfo.city}, {companyInfo.postalCode}
                <br />
                {companyInfo.country}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <EnvelopeIcon className="h-4 w-4 text-dark-400" />
              <div>
                <p className="text-sm text-dark-400">Email</p>
                <p className="text-dark-100">
                  {companyInfo.email ? (
                    <a
                      href={`mailto:${companyInfo.email}`}
                      className="hover:text-thyme-400 hover:underline"
                    >
                      {companyInfo.email}
                    </a>
                  ) : (
                    'Not set'
                  )}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <GlobeAltIcon className="h-4 w-4 text-dark-400" />
              <div>
                <p className="text-sm text-dark-400">Website</p>
                <p className="text-dark-100">
                  {companyInfo.website ? (
                    <a
                      href={
                        companyInfo.website.startsWith('http')
                          ? companyInfo.website
                          : `https://${companyInfo.website}`
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-thyme-400 hover:underline"
                    >
                      {companyInfo.website}
                    </a>
                  ) : (
                    'Not set'
                  )}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <CurrencyPoundIcon className="h-4 w-4 text-dark-400" />
              <div>
                <p className="text-sm text-dark-400">Currency</p>
                <p className="text-dark-100">{companyInfo.currencyCode}</p>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-dark-400">No company information available</p>
        )}
      </Card>

      {/* App Settings */}
      <Card variant="bordered" className="p-6">
        <h2 className="mb-4 text-lg font-semibold text-white">App Preferences</h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-dark-100">Weekly Hours Target</p>
              <p className="text-sm text-dark-400">Your target hours per week for tracking</p>
            </div>
            <input
              type="number"
              defaultValue={40}
              className="w-20 rounded-lg border border-dark-600 bg-dark-800 px-3 py-2 text-dark-100 focus:outline-none focus:ring-2 focus:ring-thyme-500"
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-dark-100">Timesheet Reminders</p>
              <p className="text-sm text-dark-400">Get reminded to fill in your timesheet</p>
            </div>
            <label className="relative inline-flex cursor-pointer items-center">
              <input type="checkbox" defaultChecked className="peer sr-only" />
              <div className="peer h-6 w-11 rounded-full bg-dark-600 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:bg-thyme-600 peer-checked:after:translate-x-full peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-thyme-500"></div>
            </label>
          </div>
        </div>
      </Card>

      {/* Connection Status */}
      <Card variant="bordered" className="p-6">
        <h2 className="mb-4 text-lg font-semibold text-white">Connection Status</h2>
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-full bg-green-500"></div>
          <p className="text-dark-100">Connected to Business Central</p>
        </div>
        <p className="mt-2 text-sm text-dark-400">
          Environment: {process.env.BC_ENVIRONMENT || 'Production'}
        </p>
      </Card>
    </div>
  );
}
