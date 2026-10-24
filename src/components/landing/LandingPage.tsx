'use client';

import toast from 'react-hot-toast';
import { useAuth } from '@/services/auth';
import {
  ClockIcon,
  ChartBarIcon,
  ArrowPathIcon,
  CalendarDaysIcon,
  CheckCircleIcon,
  ArrowRightIcon,
  ArrowTrendingUpIcon,
  BoltIcon,
  SparklesIcon,
  UserGroupIcon,
} from '@heroicons/react/24/outline';
import { Header, PublicFooter } from '@/components/layout';
import { QuoteDisplay } from '@/components/ui';
import { ScreenshotCarousel } from './ScreenshotCarousel';

// Ordered for the three-column grid: each AI agent card sits beside the feature it supports
const features = [
  {
    icon: ClockIcon,
    title: 'Effortless Time Tracking',
    description:
      "Log hours in a weekly grid or with a timer, and see each day's billable % against your target. Hover over or tap an entry for its details.",
  },
  {
    icon: SparklesIcon,
    title: 'AI Time Suggestions',
    description:
      'The AI agent suggests entries from your calendar, GitHub and Azure DevOps activity, matched to the right project. Review each one before you add it.',
  },
  {
    icon: ArrowPathIcon,
    title: 'Business Central Sync',
    description:
      'Time goes straight into your Business Central projects and timesheets. Switch between companies, and share links that open the same company and page.',
  },
  {
    icon: CheckCircleIcon,
    title: 'Timesheet Approvals',
    description:
      'Review each submitted entry on its own row with its day, the daily hours and billable % against target, then approve the week in one click.',
  },
  {
    icon: SparklesIcon,
    title: 'AI Timesheet Review',
    description:
      'Before you approve, the AI agent flags missing comments, short days, the billable mix and budget overruns, with notes against the entries concerned.',
  },
  {
    icon: ChartBarIcon,
    title: 'Reports & Export',
    description:
      'Report on year to date, last year or any range, by client and project, with hours split by stage. Print it or export to CSV.',
  },
  {
    icon: UserGroupIcon,
    title: 'Team Capacity & Targets',
    description:
      "Set each person's billable target and weekly capacity, including flexible working days, and see how complete everyone's timesheets are.",
  },
  {
    icon: CalendarDaysIcon,
    title: 'Resource Planning',
    description:
      'Plan quarter-hour allocations by person, project and task. Over-capacity days show in red, under-capacity days in amber, and day notes mark off-sites.',
  },
  {
    icon: SparklesIcon,
    title: 'AI Plan Review',
    description:
      "The AI agent checks each week's plan for billable targets, holidays, capacity and budget burn. If you can edit plans, apply its proposed changes in one click.",
  },
  {
    icon: ArrowTrendingUpIcon,
    title: 'Project Forecasting',
    description:
      'Track spend against the quoted estimate, forecast the outcome and finish date from planned hours, and break the time down by task.',
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
      'Encourage on-time timesheet submissions with optional Zaps (micro-Bitcoin payments via Lightning Network).',
    iconColor: 'text-amber-400',
  },
];

const benefits = [
  { title: 'Accurate client billing', description: 'Every hour tracked means every hour billed' },
  {
    title: 'Fewer forgotten hours',
    description: 'The AI agent suggests entries from the work you have already done',
  },
  {
    title: 'Real-time project profitability',
    description: 'See spend against the estimate before it is too late',
  },
  {
    title: 'No more timesheet chasing',
    description: 'Approvals and Zaps encourage on-time submissions',
  },
  {
    title: 'Better resource forecasting',
    description: "Plan against each person's capacity and spot overbooked days",
  },
  { title: 'Reduced admin overhead', description: 'Auto-sync eliminates double entry' },
  { title: 'Compliance-ready audit trail', description: 'Full history of entries and approvals' },
  {
    title: 'Enterprise-grade security',
    description: 'Microsoft Entra ID authentication and access control',
  },
  {
    title: 'Your data, your tenant',
    description: 'Time entries stay in your Business Central environment',
  },
  { title: 'Track time anywhere', description: 'Works on desktop, tablet and phone' },
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
              Timmie is time tracking for Microsoft Dynamics 365 Business Central. Log your time,
              plan your team and keep projects on budget, while an AI agent suggests entries and
              reviews timesheets and plans. Use Timmie&apos;s own agent, or connect your own.
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
              Built for Business Central users who need a modern, efficient way to track, plan and
              approve their time.
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
                Why <span className="text-knowall-green">Timmie</span>?
              </h2>
              <p className="text-dark-400 mb-8 text-lg">
                Stop losing revenue to unbilled hours and late timesheets. Timmie gives you the
                visibility and control you need to run profitable projects.
              </p>

              <ul className="space-y-4">
                {benefits.map((benefit, index) => (
                  <li key={index} className="flex items-start gap-3">
                    <CheckCircleIcon className="text-knowall-green mt-0.5 h-5 w-5 shrink-0" />
                    <div>
                      <span className="font-medium text-white">{benefit.title}</span>
                      <p className="text-dark-400 text-sm">{benefit.description}</p>
                    </div>
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
                  Use your Microsoft Entra ID account to access Timmie securely.
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

      {/* Quote Section */}
      <section className="relative z-10 py-16">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <QuoteDisplay rotateInterval={8000} />
        </div>
      </section>

      {/* Footer */}
      <PublicFooter />
    </div>
  );
}
