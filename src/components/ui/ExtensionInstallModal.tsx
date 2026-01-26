'use client';

import { CheckCircleIcon, ArrowDownTrayIcon, ServerIcon } from '@heroicons/react/24/outline';
import { Button } from './Button';
import { useCompanyStore } from '@/hooks';

// GitHub releases page for the BC extension
const EXTENSION_RELEASES_URL = 'https://github.com/knowall-ai/thyme-bc-extension/releases';

export interface ExtensionInstallModalProps {
  isOpen: boolean;
}

const BENEFITS = [
  'View customer names on projects and timesheets',
  'Access project tasks for detailed time tracking',
  'Full timesheet management with submission workflow',
  'Resource planning and team capacity view',
];

export function ExtensionInstallModal({ isOpen }: ExtensionInstallModalProps) {
  const { selectedCompany } = useCompanyStore();

  const environment = selectedCompany?.environment || 'production';
  const environmentLabel = environment === 'sandbox' ? 'Sandbox' : 'Production';

  const handleInstall = () => {
    window.open(EXTENSION_RELEASES_URL, '_blank', 'noopener,noreferrer');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto">
      {/* Backdrop - blocks content interaction, but header has higher z-index */}
      <div className="fixed inset-0 bg-black/50" aria-hidden="true" />

      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="extension-modal-title"
          className="border-dark-700 bg-dark-800 relative w-full max-w-md transform rounded-xl border shadow-2xl"
        >
          {/* Header */}
          <div className="border-dark-700 border-b px-6 py-4">
            <h2 id="extension-modal-title" className="text-lg font-semibold text-white">
              Install Thyme BC Extension
            </h2>
          </div>

          {/* Content */}
          <div className="space-y-6 px-6 py-5">
            {/* Benefits */}
            <div>
              <p className="text-dark-300 mb-3 text-sm">
                The Thyme BC Extension is required for full functionality:
              </p>
              <ul className="space-y-2">
                {BENEFITS.map((benefit, index) => (
                  <li key={index} className="flex items-start gap-2">
                    <CheckCircleIcon className="text-thyme-500 mt-0.5 h-5 w-5 shrink-0" />
                    <span className="text-dark-200 text-sm">{benefit}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Environment indicator */}
            <div className="bg-dark-700/50 flex items-center gap-3 rounded-lg px-4 py-3">
              <ServerIcon className="text-dark-400 h-5 w-5" />
              <div>
                <p className="text-dark-400 text-xs">Installing to</p>
                <p className="font-medium text-white">{environmentLabel}</p>
              </div>
            </div>

            {/* Install action */}
            <Button variant="primary" className="w-full" onClick={handleInstall}>
              <ArrowDownTrayIcon className="mr-2 h-4 w-4" />
              Install Extension
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
