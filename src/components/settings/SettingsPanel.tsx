'use client';

import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { Card } from '@/components/ui';
import { bcClient } from '@/services/bc/bcClient';
import { useAuth, useProfilePhoto } from '@/services/auth';
import { useCompanyStore, useSettingsStore } from '@/hooks';
import {
  BuildingOffice2Icon,
  BuildingOfficeIcon,
  MapPinIcon,
  EnvelopeIcon,
  GlobeAltIcon,
  CurrencyPoundIcon,
  UserCircleIcon,
  UserIcon,
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
  const { account, isAuthenticated } = useAuth();
  const { photoUrl } = useProfilePhoto(isAuthenticated);
  const { selectedCompany } = useCompanyStore();
  const { requireTimesheetComments, updateSettings } = useSettingsStore();
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Re-fetch company info when selected company changes
  useEffect(() => {
    async function fetchCompanyInfo() {
      setIsLoading(true);
      setError(null);
      try {
        const response = await bcClient.getCompanyInfo();
        setCompanyInfo(response);
      } catch {
        setError('Failed to load company information');
        toast.error('Failed to load company information. Please try refreshing the page.');
      } finally {
        setIsLoading(false);
      }
    }
    fetchCompanyInfo();
  }, [selectedCompany]);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="border-thyme-600 h-8 w-8 animate-spin rounded-full border-b-2"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* User Information */}
      <Card variant="bordered" className="p-6">
        <div className="mb-4 flex items-center gap-3">
          <UserCircleIcon className="text-thyme-500 h-6 w-6" />
          <h2 className="text-lg font-semibold text-white">Your Account</h2>
        </div>
        <div className="grid grid-cols-1 gap-x-4 gap-y-3 md:grid-cols-2">
          {/* Left column: Photo and Name */}
          <div className="flex items-start gap-4">
            {/* Profile Photo */}
            <div className="shrink-0">
              {photoUrl ? (
                <img
                  src={photoUrl}
                  alt={account?.name ? `${account.name}'s profile photo` : 'User profile photo'}
                  className="border-thyme-500/30 h-16 w-16 rounded-full border-2 object-cover"
                />
              ) : (
                <div className="border-thyme-500/30 bg-thyme-500/20 flex h-16 w-16 items-center justify-center rounded-full border-2">
                  <span className="text-thyme-500 text-xl font-medium">
                    {account?.name
                      ?.trim()
                      .split(/\s+/)
                      .filter(Boolean)
                      .map((part) => (part ? Array.from(part)[0] : ''))
                      .join('')
                      .toUpperCase()
                      .slice(0, 2) || '?'}
                  </span>
                </div>
              )}
            </div>
            <div className="flex items-start gap-2 pt-1">
              <UserIcon className="text-dark-400 mt-0.5 h-4 w-4" />
              <div>
                <p className="text-dark-400 text-sm">Name</p>
                <p className="text-dark-100">{account?.name || 'Not available'}</p>
              </div>
            </div>
          </div>
          {/* Right column: Email */}
          <div className="flex items-start gap-2 pt-1">
            <EnvelopeIcon className="text-dark-400 mt-0.5 h-4 w-4" />
            <div>
              <p className="text-dark-400 text-sm">Email</p>
              {account?.username ? (
                <a
                  href={`mailto:${account.username}`}
                  className="text-dark-100 hover:text-thyme-400 hover:underline"
                >
                  {account.username}
                </a>
              ) : (
                <p className="text-dark-100">Not available</p>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* Company Information */}
      <Card variant="bordered" className="p-6">
        <div className="mb-4 flex items-center gap-3">
          <BuildingOffice2Icon className="text-thyme-500 h-6 w-6" />
          <h2 className="text-lg font-semibold text-white">Business Central Company</h2>
        </div>
        {error ? (
          <p className="text-red-500">{error}</p>
        ) : companyInfo ? (
          <div className="grid grid-cols-1 gap-x-4 gap-y-3 md:grid-cols-2">
            {/* Left column: Company details */}
            <div className="space-y-3">
              <div className="flex items-start gap-2">
                <BuildingOfficeIcon className="text-dark-400 mt-0.5 h-4 w-4" />
                <div>
                  <p className="text-dark-400 text-sm">Company Name</p>
                  <p className="text-dark-100">{companyInfo.displayName || 'Not set'}</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <EnvelopeIcon className="text-dark-400 mt-0.5 h-4 w-4" />
                <div>
                  <p className="text-dark-400 text-sm">Email</p>
                  {companyInfo.email ? (
                    <a
                      href={`mailto:${companyInfo.email}`}
                      className="text-dark-100 hover:text-thyme-400 hover:underline"
                    >
                      {companyInfo.email}
                    </a>
                  ) : (
                    <p className="text-dark-100">Not set</p>
                  )}
                </div>
              </div>
              <div className="flex items-start gap-2">
                <GlobeAltIcon className="text-dark-400 mt-0.5 h-4 w-4" />
                <div>
                  <p className="text-dark-400 text-sm">Website</p>
                  {companyInfo.website ? (
                    <a
                      href={
                        companyInfo.website.startsWith('http')
                          ? companyInfo.website
                          : `https://${companyInfo.website}`
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-dark-100 hover:text-thyme-400 hover:underline"
                    >
                      {companyInfo.website}
                    </a>
                  ) : (
                    <p className="text-dark-100">Not set</p>
                  )}
                </div>
              </div>
              <div className="flex items-start gap-2">
                <CurrencyPoundIcon className="text-dark-400 mt-0.5 h-4 w-4" />
                <div>
                  <p className="text-dark-400 text-sm">Currency</p>
                  <p className="text-dark-100">{companyInfo.currencyCode || 'Not set'}</p>
                </div>
              </div>
            </div>
            {/* Right column: Address */}
            <div className="flex items-start gap-2">
              <MapPinIcon className="text-dark-400 mt-0.5 h-4 w-4" />
              <div>
                <p className="text-dark-400 text-sm">Address</p>
                {companyInfo.addressLine1 ? (
                  <p className="text-dark-100">
                    {companyInfo.addressLine1}
                    {companyInfo.addressLine2 && <>, {companyInfo.addressLine2}</>}
                    <br />
                    {companyInfo.city}, {companyInfo.postalCode}
                    <br />
                    {companyInfo.country}
                  </p>
                ) : (
                  <p className="text-dark-100">Not set</p>
                )}
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
              <p className="text-dark-400 text-sm">Your target hours per week for tracking</p>
            </div>
            <input
              type="number"
              defaultValue={40}
              className="border-dark-600 bg-dark-800 text-dark-100 focus:ring-thyme-500 w-20 rounded-lg border px-3 py-2 focus:ring-2 focus:outline-none"
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-dark-100">Timesheet Reminders</p>
              <p className="text-dark-400 text-sm">Get reminded to fill in your timesheet</p>
            </div>
            <label className="relative inline-flex cursor-pointer items-center">
              <input type="checkbox" defaultChecked className="peer sr-only" />
              <div className="peer bg-dark-600 peer-checked:bg-thyme-600 peer-focus:ring-thyme-500 h-6 w-11 rounded-full peer-focus:ring-2 peer-focus:outline-none after:absolute after:top-[2px] after:left-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:after:translate-x-full"></div>
            </label>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-dark-100">Require Comments on Time Entries</p>
              <p className="text-dark-400 text-sm">
                Enforce adding notes/comments when logging time
              </p>
            </div>
            <label className="relative inline-flex cursor-pointer items-center">
              <input
                type="checkbox"
                checked={requireTimesheetComments}
                onChange={(e) => updateSettings({ requireTimesheetComments: e.target.checked })}
                className="peer sr-only"
              />
              <div className="peer bg-dark-600 peer-checked:bg-thyme-600 peer-focus:ring-thyme-500 h-6 w-11 rounded-full peer-focus:ring-2 peer-focus:outline-none after:absolute after:top-[2px] after:left-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:after:translate-x-full"></div>
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
        <p className="text-dark-400 mt-2 text-sm">
          Environment:{' '}
          {selectedCompany?.environment
            ? selectedCompany.environment.charAt(0).toUpperCase() +
              selectedCompany.environment.slice(1)
            : 'Unknown'}
        </p>
      </Card>
    </div>
  );
}
