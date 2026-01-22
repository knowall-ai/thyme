'use client';

import { ExclamationTriangleIcon, EnvelopeIcon } from '@heroicons/react/24/outline';
import { Card } from './Card';

interface ExtensionNotInstalledProps {
  /** Optional custom message to display */
  message?: string;
}

/**
 * Displays a message when the Thyme BC Extension is not installed.
 * Used when API calls fail due to missing custom API endpoints.
 */
export function ExtensionNotInstalled({ message }: ExtensionNotInstalledProps) {
  const defaultMessage =
    'The Thyme Business Central Extension is not installed or is outdated for this company. The extension is required for timesheet functionality.';

  const emailSubject = encodeURIComponent('Thyme Setup: BC Extension Installation Needed');
  const emailBody = encodeURIComponent(`Hi,

I need the Thyme BC Extension installed in Business Central so I can use Thyme for time tracking.

Please download and install the extension from:
https://github.com/knowall-ai/thyme-bc-extension

Thank you!`);

  return (
    <Card variant="bordered" className="p-8">
      <div className="flex flex-col items-center justify-center text-center">
        <ExclamationTriangleIcon className="mb-4 h-12 w-12 text-yellow-500" />
        <h3 className="mb-2 text-lg font-semibold text-white">Thyme BC Extension Not Installed</h3>
        <p className="mb-4 max-w-md text-dark-300">{message || defaultMessage}</p>

        <div className="max-w-lg text-left">
          <p className="mb-2 text-sm font-medium text-dark-300">
            To resolve this, ask your Business Central administrator to:
          </p>
          <ol className="list-inside list-decimal space-y-2 text-sm text-dark-400">
            <li>
              Download the latest Thyme BC Extension from{' '}
              <a
                href="https://github.com/knowall-ai/thyme-bc-extension"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-thyme-400 underline hover:text-thyme-300"
              >
                GitHub
              </a>
            </li>
            <li>Install the extension in Business Central for this company</li>
            <li>Refresh this page after installation</li>
          </ol>

          <div className="mt-4 flex justify-center">
            <a
              href={`mailto:?subject=${emailSubject}&body=${emailBody}`}
              className="inline-flex items-center gap-2 rounded-md bg-thyme-600 px-4 py-2 text-sm font-medium text-white hover:bg-thyme-500"
            >
              <EnvelopeIcon className="h-4 w-4" />
              Email request to administrator
            </a>
          </div>
        </div>
      </div>
    </Card>
  );
}
