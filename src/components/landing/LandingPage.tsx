'use client';

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

  return (
    <div className="min-h-screen bg-dark-950">
      {/* Background effects */}
      <div className="pointer-events-none fixed inset-0 bg-grid-pattern bg-grid opacity-20" />
      <div className="pointer-events-none fixed inset-0 bg-gradient-radial from-knowall-green/5 via-transparent to-transparent" />

      {/* Header */}
      <header className="relative z-10 border-b border-dark-800">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-knowall-green shadow-lg shadow-knowall-green/20">
                <ThymeLogo className="h-6 w-6 text-dark-950" />
              </div>
              <div>
                <span className="text-xl font-bold text-white">Thyme</span>
                <span className="ml-2 hidden text-sm text-dark-400 sm:inline">by KnowAll.ai</span>
              </div>
            </div>

            {/* Auth button */}
            <button
              onClick={login}
              disabled={isLoading}
              className="flex items-center gap-2 rounded-lg bg-knowall-green px-5 py-2.5 font-semibold text-dark-950 shadow-lg shadow-knowall-green/20 transition-all duration-200 hover:bg-knowall-green-light hover:shadow-knowall-green/40 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-dark-950/30 border-t-dark-950" />
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
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-dark-700 bg-dark-800 px-3 py-1 text-sm text-dark-300">
              <span className="h-2 w-2 animate-pulse rounded-full bg-knowall-green" />
              Powered by Microsoft Dynamics 365 Business Central
            </div>

            <h1 className="mb-6 text-4xl font-bold leading-tight text-white sm:text-5xl lg:text-6xl">
              Time Tracking,
              <br />
              <span className="text-knowall-green">Perfectly Synced</span>
            </h1>

            <p className="mx-auto mb-10 max-w-2xl text-lg text-dark-300 sm:text-xl">
              Thyme is a modern time tracking application that integrates seamlessly with Microsoft
              Dynamics 365 Business Central. Track time, manage projects, and keep your data in
              sync.
            </p>

            <div className="flex flex-col justify-center gap-4 sm:flex-row">
              <button
                onClick={login}
                disabled={isLoading}
                className="group flex items-center justify-center gap-2 rounded-xl bg-knowall-green px-8 py-4 font-semibold text-dark-950 shadow-xl shadow-knowall-green/20 transition-all duration-200 hover:bg-knowall-green-light hover:shadow-knowall-green/40 disabled:opacity-50"
              >
                Get Started
                <ArrowRightIcon className="h-5 w-5 transition-transform group-hover:translate-x-1" />
              </button>
              <a
                href="https://knowall.ai"
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-xl border border-dark-700 bg-dark-800 px-8 py-4 font-semibold text-white transition-colors hover:bg-dark-700"
              >
                Learn About KnowAll.ai
              </a>
            </div>
          </div>

          {/* Hero illustration */}
          <div className="relative mt-16">
            <div className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-t from-dark-950 via-transparent to-transparent" />
            <div className="overflow-hidden rounded-2xl border border-dark-700 bg-dark-900 shadow-2xl">
              <div className="flex items-center gap-2 border-b border-dark-700 bg-dark-800 px-4 py-3">
                <div className="h-3 w-3 rounded-full bg-red-500/80" />
                <div className="h-3 w-3 rounded-full bg-yellow-500/80" />
                <div className="h-3 w-3 rounded-full bg-green-500/80" />
                <span className="ml-3 text-sm text-dark-400">thyme.knowall.ai</span>
              </div>
              <div className="p-6">
                {/* Mock timesheet */}
                <div className="mb-4 grid grid-cols-7 gap-2">
                  {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
                    <div key={day} className="py-2 text-center text-xs font-medium text-dark-400">
                      {day}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-2">
                  {[8, 7.5, 8, 6, 8, 0, 0].map((hours, i) => (
                    <div
                      key={i}
                      className={`rounded-lg p-3 ${
                        hours > 0
                          ? 'border border-knowall-green/30 bg-knowall-green/10'
                          : 'bg-dark-800'
                      }`}
                    >
                      {hours > 0 && (
                        <div className="font-mono text-sm text-knowall-green">{hours}h</div>
                      )}
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex items-center justify-between">
                  <div className="text-sm text-dark-400">Week total</div>
                  <div className="text-lg font-bold text-white">37.5 hours</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="relative z-10 bg-dark-900/50 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-16 text-center">
            <h2 className="mb-4 text-3xl font-bold text-white sm:text-4xl">
              Everything You Need for Time Tracking
            </h2>
            <p className="mx-auto max-w-2xl text-lg text-dark-400">
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
                  className="group rounded-xl border border-dark-700 bg-dark-800/50 p-6 transition-colors hover:border-knowall-green/50"
                >
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-knowall-green/10 transition-colors group-hover:bg-knowall-green/20">
                    <Icon className="h-6 w-6 text-knowall-green" />
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
              <p className="mb-8 text-lg text-dark-400">
                Thyme is designed exclusively for KnowAll.ai users, providing a seamless experience
                for tracking time against Business Central projects.
              </p>

              <ul className="space-y-4">
                {benefits.map((benefit, index) => (
                  <li key={index} className="flex items-center gap-3">
                    <CheckCircleIcon className="h-5 w-5 shrink-0 text-knowall-green" />
                    <span className="text-dark-200">{benefit}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl border border-dark-700 bg-dark-800 p-8">
              <div className="text-center">
                <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-knowall-green/10">
                  <svg className="h-10 w-10" viewBox="0 0 21 21" fill="none">
                    <rect x="1" y="1" width="9" height="9" fill="#F25022" />
                    <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
                    <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
                    <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
                  </svg>
                </div>
                <h3 className="mb-3 text-xl font-semibold text-white">Sign in with Microsoft</h3>
                <p className="mb-6 text-dark-400">
                  Use your KnowAll.ai Microsoft account to access Thyme securely.
                </p>
                <button
                  onClick={login}
                  disabled={isLoading}
                  className="w-full rounded-lg bg-knowall-green px-6 py-3 font-semibold text-dark-950 transition-colors hover:bg-knowall-green-light disabled:opacity-50"
                >
                  Sign in to Get Started
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-dark-800 py-8">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-knowall-green">
                <ThymeLogo className="h-5 w-5 text-dark-950" />
              </div>
              <span className="font-semibold text-white">Thyme</span>
              <span className="text-dark-500">by</span>
              <a
                href="https://knowall.ai"
                target="_blank"
                rel="noopener noreferrer"
                className="text-knowall-green transition-colors hover:text-knowall-green-light"
              >
                KnowAll.ai
              </a>
            </div>
            <p className="text-sm text-dark-500">Time Tracking for Business Central</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
