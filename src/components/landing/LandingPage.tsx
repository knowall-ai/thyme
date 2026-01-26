'use client';

import toast from 'react-hot-toast';
import { useAuth } from '@/services/auth';
import {
  ClockIcon,
  ChartBarIcon,
  ArrowPathIcon,
  BuildingOfficeIcon,
  CheckCircleIcon,
  ArrowRightIcon,
  BoltIcon,
} from '@heroicons/react/24/outline';
import { BitcoinLightningLogo } from '@/components/icons';
import { Header, PublicFooter } from '@/components/layout';
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
    icon: CheckCircleIcon,
    title: 'Timesheet Approvals',
    description:
      'Managers can review and approve team timesheets with a single click. Track submission status across your team.',
  },
  {
    icon: ChartBarIcon,
    title: 'Budget Tracking & Reports',
    description:
      'Monitor project budgets in real-time. View weekly summaries, track progress, and export data for analysis.',
  },
  {
    icon: BuildingOfficeIcon,
    title: 'Planning & Forecasting',
    description:
      'Plan and schedule resources across projects with a visual timeline. Forecast team capacity and utilization.',
  },
  {
    icon: BoltIcon,
    title: 'Bitcoin Lightning Payments',
    description:
      'Pay with Bitcoin via Lightning Network. Fixed pricing in Sats with instant, low-fee payments.',
    iconColor: 'text-amber-400',
  },
  {
    icon: BoltIcon,
    title: 'Zaps for Submissions',
    description:
      'Incentivize timely timesheet submissions with optional Zaps (micro-Bitcoin payments via Lightning Network).',
    iconColor: 'text-amber-400',
  },
];

const benefits = [
  'Seamless Microsoft Entra ID authentication',
  'Real-time sync with Business Central',
  'Weekly timesheet with copy-forward',
  'Timesheet approvals workflow',
  'Project budget tracking',
  'Resource planning & forecasting',
  'Mobile-responsive design',
  'Zaps to incentivize submissions',
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
    <div className="bg-dark-950 flex min-h-screen flex-col">
      {/* Background effects */}
      <div className="bg-grid-pattern bg-grid pointer-events-none fixed inset-0 opacity-20" />
      <div className="bg-gradient-radial from-knowall-green/5 pointer-events-none fixed inset-0 via-transparent to-transparent" />

      {/* Header */}
      <Header />

      {/* Hero Section */}
      <section className="relative z-10 py-20 sm:py-32">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-6 flex flex-wrap items-center justify-center gap-3">
              <div className="border-dark-700 bg-dark-800 text-dark-300 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm">
                <span className="bg-knowall-green h-2 w-2 animate-pulse rounded-full" />
                Powered by Microsoft Dynamics 365 Business Central
              </div>
              <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-sm text-amber-400">
                <BoltIcon className="h-4 w-4" />
                Accepts Bitcoin Lightning
              </div>
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

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {features.map((feature, index) => {
              const Icon = feature.icon;
              const iconColor = feature.iconColor || 'text-knowall-green';
              const bgColor = feature.iconColor ? 'bg-amber-500/10' : 'bg-knowall-green/10';
              const hoverBgColor = feature.iconColor
                ? 'group-hover:bg-amber-500/20'
                : 'group-hover:bg-knowall-green/20';
              return (
                <div
                  key={index}
                  className="group border-dark-700 bg-dark-800/50 hover:border-knowall-green/50 rounded-xl border p-6 transition-colors"
                >
                  <div
                    className={`${bgColor} ${hoverBgColor} mb-4 flex h-12 w-12 items-center justify-center rounded-lg transition-colors`}
                  >
                    <Icon className={`${iconColor} h-6 w-6`} />
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
                Built for <span className="text-knowall-green">Business Central</span> Users
              </h2>
              <p className="text-dark-400 mb-8 text-lg">
                Thyme provides a seamless experience for tracking time against your Business Central
                projects. Simple, modern, and always in sync.
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
                  Use your Microsoft Entra ID account to access Thyme securely.
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
      <PublicFooter />
    </div>
  );
}
