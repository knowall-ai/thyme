'use client';

import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { Modal } from '@/components/ui';
import { cn, LICENCE_FLAG_LABELS, LICENCE_PRICES, type LicenceFlag } from '@/utils';

const money = (value: number) =>
  value.toLocaleString('en-GB', { style: 'currency', currency: LICENCE_PRICES.currency });
import type { LicenceData } from '@/hooks/useLicences';

/**
 * The organisation's licences, from the Team page (Microsoft 365 admins only): how many
 * of each are bought and assigned, what they cost at estimated list prices
 * (src/config/licencePrices.json), and what looks wrong.
 */
export function LicencesDialog({
  isOpen,
  onClose,
  licences,
  withoutBusinessCentral,
}: {
  isOpen: boolean;
  onClose: () => void;
  licences: LicenceData;
  /** Team members matched to a directory user with no Business Central licence */
  withoutBusinessCentral: string[];
}) {
  if (licences.status !== 'ready') return null;

  // Who has each flag
  const flagged = new Map<LicenceFlag, string[]>();
  for (const person of licences.people.values()) {
    for (const flag of person.flags) {
      flagged.set(flag, [...(flagged.get(flag) ?? []), person.user.displayName]);
    }
  }
  const unassigned = licences.counts.filter((c) => c.unassigned > 0);
  const monthlyTotal = licences.counts.reduce((sum, c) => sum + (c.monthlyCost ?? 0), 0);
  const issues = flagged.size > 0 || unassigned.length > 0 || withoutBusinessCentral.length > 0;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Licences" size="xl">
      <div className="space-y-5">
        <p className="text-dark-400 text-sm">
          From Microsoft 365. Free and trial licences aren&apos;t shown. {LICENCE_PRICES.basis}{' '}
          Prices checked {LICENCE_PRICES.checked}.
        </p>

        <div className="border-dark-600 overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-dark-700 text-gray-400">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Licence</th>
                <th className="px-3 py-2 text-right font-medium">Assigned</th>
                <th className="px-3 py-2 text-right font-medium">Purchased</th>
                <th className="px-3 py-2 text-right font-medium">Unassigned</th>
                <th className="px-3 py-2 text-right font-medium">Est. price a month</th>
                <th className="px-4 py-2 text-right font-medium">Est. monthly cost</th>
              </tr>
            </thead>
            <tbody className="divide-dark-600 divide-y">
              {licences.counts.map((c) => (
                <tr key={c.skuId}>
                  <td className="px-4 py-2 text-white">{c.sku.name}</td>
                  <td className="px-3 py-2 text-right text-gray-300">{c.assigned}</td>
                  <td className="px-3 py-2 text-right text-gray-300">{c.purchased}</td>
                  <td
                    className={cn(
                      'px-3 py-2 text-right',
                      c.unassigned > 0 ? 'text-amber-400' : 'text-gray-500'
                    )}
                  >
                    {c.unassigned}
                  </td>
                  <td className="px-3 py-2 text-right text-gray-300">
                    {c.monthlyPrice === null ? '–' : money(c.monthlyPrice)}
                  </td>
                  <td className="px-4 py-2 text-right text-white">
                    {c.monthlyCost === null ? '–' : money(c.monthlyCost)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-dark-700">
              <tr>
                <td colSpan={5} className="px-4 py-2 font-medium text-white">
                  Estimated total a month (purchased licences with a price)
                </td>
                <td className="px-4 py-2 text-right font-bold text-white">{money(monthlyTotal)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {issues && (
          <div className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
            <p className="flex items-center gap-2 text-sm font-medium text-amber-200">
              <ExclamationTriangleIcon className="h-5 w-5 text-amber-400" />
              Worth a look
            </p>
            <ul className="list-disc space-y-1 pl-6 text-sm text-amber-100/90">
              {withoutBusinessCentral.length > 0 && (
                <li>
                  Team members without a Business Central licence:{' '}
                  {withoutBusinessCentral.join(', ')}
                </li>
              )}
              {[...flagged].map(([flag, names]) => (
                <li key={flag}>
                  {LICENCE_FLAG_LABELS[flag]}: {names.join(', ')}
                </li>
              ))}
              {unassigned.map((c) => (
                <li key={c.skuId}>
                  {c.unassigned} {c.sku.name} purchased but not assigned
                  {c.monthlyPrice !== null &&
                    ` (about ${money(c.unassigned * c.monthlyPrice)} a month)`}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  );
}
