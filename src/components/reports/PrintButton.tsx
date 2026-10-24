'use client';

import { PrinterIcon } from '@heroicons/react/24/outline';

/** Prints the page as shown (or saves it as a PDF from the browser's print dialog) */
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      title="Print, or save as PDF"
      className="border-dark-600 bg-dark-700 hover:border-dark-500 hover:bg-dark-600 text-dark-200 focus:border-timmie-500 focus:ring-timmie-500 flex h-10 items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors hover:text-white focus:ring-1 focus:outline-none print:hidden"
    >
      <PrinterIcon className="text-dark-400 h-4 w-4 shrink-0" />
      Print
    </button>
  );
}
