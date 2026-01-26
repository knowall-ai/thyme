'use client';

import Link from 'next/link';
import toast from 'react-hot-toast';
import { useAuth } from '@/services/auth';
import {
  ClockIcon,
  ChartBarIcon,
  ArrowPathIcon,
  BuildingOfficeIcon,
  CheckCircleIcon,
  ArrowRightIcon,
} from '@heroicons/react/24/outline';
import { ThymeLogo } from '@/components/icons';
import { ScreenshotCarousel } from './ScreenshotCarousel';

const features = [
  {
    icon: ClockIcon,
    title: 'Effortless Time Tracking',
    description:
      'Track your time with an intuitive weekly timesheet view or real-time timer. Log hours quickly and accurately.',
  },
  {
    icon: ArrowPathIcon,
    title: 'Business Central Sync',
    description:
      'Automatically sync time entries to Microsoft Dynamics 365 Business Central Jobs and Job Journal Lines.',
  },
  {
    icon: ChartBarIcon,
    title: 'Insightful Reports',
    description: 'View weekly summaries, track project progress, and export data for analysis.',
  },
  {
    icon: BuildingOfficeIcon,
    title: 'Project Organization',
    description: 'Access your Business Central projects and tasks with favorites and quick search.',
  },
];

const benefits = [
  'Seamless Microsoft Entra ID authentication',
  'Real-time sync with Business Central',
  'Weekly timesheet with copy-forward',
  'Start/stop timer functionality',
  'Mobile-responsive design',
  'Export to CSV',
];

export function LandingPage() {
  const { login, isLoading } = useAuth();

  const handleLogin = async () => {
    try {
      await login();
    } catch {
      toast.error('Failed to sign in. Please try again.');
    }
  };

  return (
    <div className="bg-dark-950 min-h-screen">
      {/* Background effects */}
      <div className="bg-grid-pattern bg-grid pointer-events-none fixed inset-0 opacity-20" />
      <div className="bg-gradient-radial from-knowall-green/5 pointer-events-none fixed inset-0 via-transparent to-transparent" />

      {/* Header */}
      <header className="border-dark-800 relative z-10 border-b">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <div className="bg-knowall-green shadow-knowall-green/20 flex h-10 w-10 items-center justify-center rounded-lg shadow-lg">
                <ThymeLogo className="text-dark-950 h-6 w-6" />
              </div>
              <div>
                <span className="text-xl font-bold text-white">Thyme</span>
                <span className="text-dark-400 ml-2 hidden text-sm sm:inline">by KnowAll.ai</span>
              </div>
            </div>

            {/* Auth button */}
            <button
              onClick={handleLogin}
              disabled={isLoading}
              className="bg-knowall-green text-dark-950 shadow-knowall-green/20 hover:bg-knowall-green-light hover:shadow-knowall-green/40 flex items-center gap-2 rounded-lg px-5 py-2.5 font-semibold shadow-lg transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <div className="border-dark-950/30 border-t-dark-950 h-4 w-4 animate-spin rounded-full border-2" />
                  Signing in...
                </>
              ) : (
                <>
                  <svg className="h-5 w-5" viewBox="0 0 21 21" fill="none">
                    <rect x="1" y="1" width="9" height="9" fill="#F25022" />
                    <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
                    <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
                    <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
                  </svg>
                  Sign in with Microsoft
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative z-10 py-20 sm:py-32">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <div className="border-dark-700 bg-dark-800 text-dark-300 mb-6 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm">
              <span className="bg-knowall-green h-2 w-2 animate-pulse rounded-full" />
              Powered by Microsoft Dynamics 365 Business Central
            </div>

            <h1 className="mb-6 text-4xl leading-tight font-bold text-white sm:text-5xl lg:text-6xl">
              Time Tracking,
              <br />
              <span className="text-knowall-green">Perfectly Synced</span>
            </h1>

            <p className="text-dark-300 mx-auto mb-10 max-w-2xl text-lg sm:text-xl">
              Thyme is a modern time tracking application that integrates seamlessly with Microsoft
              Dynamics 365 Business Central. Track time, manage projects, and keep your data in
              sync.
            </p>

            <div className="flex flex-col justify-center gap-4 sm:flex-row">
              <button
                onClick={handleLogin}
                disabled={isLoading}
                className="group bg-knowall-green text-dark-950 shadow-knowall-green/20 hover:bg-knowall-green-light hover:shadow-knowall-green/40 flex items-center justify-center gap-2 rounded-xl px-8 py-4 font-semibold shadow-xl transition-all duration-200 disabled:opacity-50"
              >
                Get Started
                <ArrowRightIcon className="h-5 w-5 transition-transform group-hover:translate-x-1" />
              </button>
              <a
                href="https://knowall.ai"
                target="_blank"
                rel="noopener noreferrer"
                className="border-dark-700 bg-dark-800 hover:bg-dark-700 rounded-xl border px-8 py-4 font-semibold text-white transition-colors"
              >
                Learn About KnowAll.ai
              </a>
            </div>
          </div>

          {/* Screenshot carousel */}
          <div className="mt-16">
            <ScreenshotCarousel />
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="bg-dark-900/50 relative z-10 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-16 text-center">
            <h2 className="mb-4 text-3xl font-bold text-white sm:text-4xl">
              Everything You Need for Time Tracking
            </h2>
            <p className="text-dark-400 mx-auto max-w-2xl text-lg">
              Built specifically for Business Central users who need a modern, efficient way to
              track and sync their time.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
            {features.map((feature, index) => {
              const Icon = feature.icon;
              return (
                <div
                  key={index}
                  className="group border-dark-700 bg-dark-800/50 hover:border-knowall-green/50 rounded-xl border p-6 transition-colors"
                >
                  <div className="bg-knowall-green/10 group-hover:bg-knowall-green/20 mb-4 flex h-12 w-12 items-center justify-center rounded-lg transition-colors">
                    <Icon className="text-knowall-green h-6 w-6" />
                  </div>
                  <h3 className="mb-2 text-xl font-semibold text-white">{feature.title}</h3>
                  <p className="text-dark-400">{feature.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="relative z-10 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2">
            <div>
              <h2 className="mb-6 text-3xl font-bold text-white sm:text-4xl">
                Built for <span className="text-knowall-green">KnowAll.ai</span> Teams
              </h2>
              <p className="text-dark-400 mb-8 text-lg">
                Thyme is designed exclusively for KnowAll.ai users, providing a seamless experience
                for tracking time against Business Central projects.
              </p>

              <ul className="space-y-4">
                {benefits.map((benefit, index) => (
                  <li key={index} className="flex items-center gap-3">
                    <CheckCircleIcon className="text-knowall-green h-5 w-5 shrink-0" />
                    <span className="text-dark-200">{benefit}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="border-dark-700 bg-dark-800 rounded-2xl border p-8">
              <div className="text-center">
                <div className="bg-knowall-green/10 mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl">
                  <svg className="h-10 w-10" viewBox="0 0 21 21" fill="none">
                    <rect x="1" y="1" width="9" height="9" fill="#F25022" />
                    <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
                    <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
                    <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
                  </svg>
                </div>
                <h3 className="mb-3 text-xl font-semibold text-white">Sign in with Microsoft</h3>
                <p className="text-dark-400 mb-6">
                  Use your KnowAll.ai Microsoft account to access Thyme securely.
                </p>
                <button
                  onClick={handleLogin}
                  disabled={isLoading}
                  className="bg-knowall-green text-dark-950 hover:bg-knowall-green-light w-full rounded-lg px-6 py-3 font-semibold transition-colors disabled:opacity-50"
                >
                  Sign in to Get Started
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-dark-800 relative z-10 border-t py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-8 md:grid-cols-4">
            {/* Brand */}
            <div className="md:col-span-1">
              <div className="mb-4 flex items-center gap-2">
                <div className="bg-knowall-green flex h-8 w-8 items-center justify-center rounded-lg">
                  <ThymeLogo className="text-dark-950 h-5 w-5" />
                </div>
                <span className="font-semibold text-white">Thyme</span>
              </div>
              <p className="text-dark-400 text-sm">
                Modern time tracking for Microsoft Dynamics 365 Business Central.
              </p>
              <div className="mt-4">
                <a
                  href="https://knowall.ai"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-knowall-green hover:text-knowall-green-light text-sm transition-colors"
                >
                  Built by KnowAll.ai
                </a>
              </div>
            </div>

            {/* Product */}
            <div>
              <h3 className="mb-4 font-semibold text-white">Product</h3>
              <ul className="space-y-2">
                <li>
                  <Link
                    href="/pricing"
                    className="text-dark-400 text-sm transition-colors hover:text-white"
                  >
                    Pricing
                  </Link>
                </li>
                <li>
                  <a
                    href="https://github.com/knowall-ai/thyme-bc-extension"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-dark-400 text-sm transition-colors hover:text-white"
                  >
                    BC Extension
                  </a>
                </li>
                <li>
                  <a
                    href="https://appsource.microsoft.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-dark-400 text-sm transition-colors hover:text-white"
                  >
                    AppSource
                  </a>
                </li>
              </ul>
            </div>

            {/* Support */}
            <div>
              <h3 className="mb-4 font-semibold text-white">Support</h3>
              <ul className="space-y-2">
                <li>
                  <Link
                    href="/help"
                    className="text-dark-400 text-sm transition-colors hover:text-white"
                  >
                    Help & FAQs
                  </Link>
                </li>
                <li>
                  <a
                    href="mailto:support@knowall.ai"
                    className="text-dark-400 text-sm transition-colors hover:text-white"
                  >
                    Contact Support
                  </a>
                </li>
                <li>
                  <a
                    href="https://github.com/knowall-ai/thyme/issues"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-dark-400 text-sm transition-colors hover:text-white"
                  >
                    Report an Issue
                  </a>
                </li>
              </ul>
            </div>

            {/* Legal */}
            <div>
              <h3 className="mb-4 font-semibold text-white">Legal</h3>
              <ul className="space-y-2">
                <li>
                  <Link
                    href="/privacy"
                    className="text-dark-400 text-sm transition-colors hover:text-white"
                  >
                    Privacy Policy
                  </Link>
                </li>
                <li>
                  <Link
                    href="/terms"
                    className="text-dark-400 text-sm transition-colors hover:text-white"
                  >
                    Terms of Service
                  </Link>
                </li>
                <li>
                  <Link
                    href="/eula"
                    className="text-dark-400 text-sm transition-colors hover:text-white"
                  >
                    EULA
                  </Link>
                </li>
              </ul>
            </div>
          </div>

          {/* Bottom bar */}
          <div className="border-dark-800 mt-8 flex flex-col items-center justify-between gap-4 border-t pt-8 sm:flex-row">
            <p className="text-dark-500 text-sm">
              &copy; {new Date().getFullYear()} KnowAll.ai Ltd. All rights reserved.
            </p>
            <p className="text-dark-500 text-sm">Time Tracking for Business Central</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
