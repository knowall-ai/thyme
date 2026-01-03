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

const features = [
  {
    icon: ClockIcon,
    title: 'Effortless Time Tracking',
    description: 'Track your time with an intuitive weekly timesheet view or real-time timer. Log hours quickly and accurately.',
  },
  {
    icon: ArrowPathIcon,
    title: 'Business Central Sync',
    description: 'Automatically sync time entries to Microsoft Dynamics 365 Business Central Jobs and Job Journal Lines.',
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
      <div className="fixed inset-0 bg-grid-pattern bg-grid opacity-20 pointer-events-none" />
      <div className="fixed inset-0 bg-gradient-radial from-knowall-green/5 via-transparent to-transparent pointer-events-none" />

      {/* Header */}
      <header className="relative z-10 border-b border-dark-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-knowall-green rounded-lg flex items-center justify-center shadow-lg shadow-knowall-green/20">
                <ClockIcon className="w-6 h-6 text-dark-950" />
              </div>
              <div>
                <span className="text-xl font-bold text-white">Thyme</span>
                <span className="hidden sm:inline text-dark-400 text-sm ml-2">by KnowAll.ai</span>
              </div>
            </div>

            {/* Auth button */}
            <button
              onClick={login}
              disabled={isLoading}
              className="px-5 py-2.5 bg-knowall-green text-dark-950 font-semibold rounded-lg hover:bg-knowall-green-light transition-all duration-200 shadow-lg shadow-knowall-green/20 hover:shadow-knowall-green/40 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-dark-950/30 border-t-dark-950 rounded-full animate-spin" />
                  Signing in...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" viewBox="0 0 21 21" fill="none">
                    <rect x="1" y="1" width="9" height="9" fill="#F25022"/>
                    <rect x="11" y="1" width="9" height="9" fill="#7FBA00"/>
                    <rect x="1" y="11" width="9" height="9" fill="#00A4EF"/>
                    <rect x="11" y="11" width="9" height="9" fill="#FFB900"/>
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
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-dark-800 border border-dark-700 text-sm text-dark-300 mb-6">
              <span className="w-2 h-2 rounded-full bg-knowall-green animate-pulse" />
              Powered by Microsoft Dynamics 365 Business Central
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white mb-6 leading-tight">
              Time Tracking,
              <br />
              <span className="text-knowall-green">Perfectly Synced</span>
            </h1>

            <p className="text-lg sm:text-xl text-dark-300 mb-10 max-w-2xl mx-auto">
              Thyme is a modern time tracking application that integrates seamlessly with
              Microsoft Dynamics 365 Business Central. Track time, manage projects, and
              keep your data in sync.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button
                onClick={login}
                disabled={isLoading}
                className="group px-8 py-4 bg-knowall-green text-dark-950 font-semibold rounded-xl hover:bg-knowall-green-light transition-all duration-200 shadow-xl shadow-knowall-green/20 hover:shadow-knowall-green/40 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                Get Started
                <ArrowRightIcon className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </button>
              <a
                href="https://knowall.ai"
                target="_blank"
                rel="noopener noreferrer"
                className="px-8 py-4 bg-dark-800 text-white font-semibold rounded-xl hover:bg-dark-700 transition-colors border border-dark-700"
              >
                Learn About KnowAll.ai
              </a>
            </div>
          </div>

          {/* Hero illustration */}
          <div className="mt-16 relative">
            <div className="absolute inset-0 bg-gradient-to-t from-dark-950 via-transparent to-transparent z-10 pointer-events-none" />
            <div className="bg-dark-900 rounded-2xl border border-dark-700 shadow-2xl overflow-hidden">
              <div className="bg-dark-800 px-4 py-3 border-b border-dark-700 flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500/80" />
                <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                <div className="w-3 h-3 rounded-full bg-green-500/80" />
                <span className="ml-3 text-sm text-dark-400">thyme.knowall.ai</span>
              </div>
              <div className="p-6">
                {/* Mock timesheet */}
                <div className="grid grid-cols-7 gap-2 mb-4">
                  {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
                    <div key={day} className="text-center text-xs text-dark-400 font-medium py-2">
                      {day}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-2">
                  {[8, 7.5, 8, 6, 8, 0, 0].map((hours, i) => (
                    <div
                      key={i}
                      className={`p-3 rounded-lg ${
                        hours > 0 ? 'bg-knowall-green/10 border border-knowall-green/30' : 'bg-dark-800'
                      }`}
                    >
                      {hours > 0 && (
                        <div className="text-sm font-mono text-knowall-green">{hours}h</div>
                      )}
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex justify-between items-center">
                  <div className="text-sm text-dark-400">Week total</div>
                  <div className="text-lg font-bold text-white">37.5 hours</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="relative z-10 py-20 bg-dark-900/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              Everything You Need for Time Tracking
            </h2>
            <p className="text-dark-400 text-lg max-w-2xl mx-auto">
              Built specifically for Business Central users who need a modern,
              efficient way to track and sync their time.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {features.map((feature, index) => {
              const Icon = feature.icon;
              return (
                <div
                  key={index}
                  className="p-6 bg-dark-800/50 rounded-xl border border-dark-700 hover:border-knowall-green/50 transition-colors group"
                >
                  <div className="w-12 h-12 bg-knowall-green/10 rounded-lg flex items-center justify-center mb-4 group-hover:bg-knowall-green/20 transition-colors">
                    <Icon className="w-6 h-6 text-knowall-green" />
                  </div>
                  <h3 className="text-xl font-semibold text-white mb-2">{feature.title}</h3>
                  <p className="text-dark-400">{feature.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="relative z-10 py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl sm:text-4xl font-bold text-white mb-6">
                Built for <span className="text-knowall-green">KnowAll.ai</span> Teams
              </h2>
              <p className="text-dark-400 text-lg mb-8">
                Thyme is designed exclusively for KnowAll.ai users, providing a seamless
                experience for tracking time against Business Central projects.
              </p>

              <ul className="space-y-4">
                {benefits.map((benefit, index) => (
                  <li key={index} className="flex items-center gap-3">
                    <CheckCircleIcon className="w-5 h-5 text-knowall-green shrink-0" />
                    <span className="text-dark-200">{benefit}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-dark-800 rounded-2xl p-8 border border-dark-700">
              <div className="text-center">
                <div className="w-20 h-20 bg-knowall-green/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
                  <svg className="w-10 h-10" viewBox="0 0 21 21" fill="none">
                    <rect x="1" y="1" width="9" height="9" fill="#F25022"/>
                    <rect x="11" y="1" width="9" height="9" fill="#7FBA00"/>
                    <rect x="1" y="11" width="9" height="9" fill="#00A4EF"/>
                    <rect x="11" y="11" width="9" height="9" fill="#FFB900"/>
                  </svg>
                </div>
                <h3 className="text-xl font-semibold text-white mb-3">
                  Sign in with Microsoft
                </h3>
                <p className="text-dark-400 mb-6">
                  Use your KnowAll.ai Microsoft account to access Thyme securely.
                </p>
                <button
                  onClick={login}
                  disabled={isLoading}
                  className="w-full px-6 py-3 bg-knowall-green text-dark-950 font-semibold rounded-lg hover:bg-knowall-green-light transition-colors disabled:opacity-50"
                >
                  Sign in to Get Started
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 py-8 border-t border-dark-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-knowall-green rounded-lg flex items-center justify-center">
                <ClockIcon className="w-5 h-5 text-dark-950" />
              </div>
              <span className="text-white font-semibold">Thyme</span>
              <span className="text-dark-500">by</span>
              <a
                href="https://knowall.ai"
                target="_blank"
                rel="noopener noreferrer"
                className="text-knowall-green hover:text-knowall-green-light transition-colors"
              >
                KnowAll.ai
              </a>
            </div>
            <p className="text-dark-500 text-sm">
              Time Tracking for Business Central
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
