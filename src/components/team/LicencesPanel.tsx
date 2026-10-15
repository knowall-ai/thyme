'use client';

import { useEffect, useMemo, useState } from 'react';
import { ExclamationTriangleIcon, PencilSquareIcon } from '@heroicons/react/24/outline';
import { Card } from '@/components/ui';
import { useAuth } from '@/services/auth';
import {
  getLicenceToken,
  getLicensedUsers,
  getSubscribedSkus,
  isLicenceAdmin,
} from '@/services/auth/licenceService';
import {
  cn,
  LICENCE_FLAG_LABELS,
  summariseLicences,
  type LicenceFlag,
  type LicensedUser,
  type SubscribedSku,
} from '@/utils';

const PRICES_KEY = 'thyme_licence_prices';

const money = (value: number) =>
  value.toLocaleString('en-GB', { style: 'currency', currency: 'GBP' });

/** An admin's own prices, per organisation (tenant), saved in this browser */
function usePriceOverrides(tenantId: string | undefined) {
  const key = `${PRICES_KEY}_${tenantId ?? 'unknown'}`;
  // Read once: the page remounts for another company, and the tenant doesn't change
  const [prices, setPrices] = useState<Record<string, number>>(() => {
    try {
      return JSON.parse(localStorage.getItem(key) ?? '{}') ?? {};
    } catch {
      return {};
    }
  });
  const setPrice = (skuPartNumber: string, price: number | null) => {
    setPrices((current) => {
      const next = { ...current };
      if (price === null) delete next[skuPartNumber];
      else next[skuPartNumber] = price;
      localStorage.setItem(key, JSON.stringify(next));
      return next;
    });
  };
  return [prices, setPrice] as const;
}

type Load =
  | { state: 'checking' | 'hidden' | 'loading' }
  | { state: 'ready'; skus: SubscribedSku[]; users: LicensedUser[] }
  | { state: 'error' };

/**
 * Licences on the Team page, for Microsoft 365 admins only: each person's Business
 * Central licence and Microsoft 365 plan, the totals per licence with what they cost a
 * month, and what looks wrong. Hidden for anyone else, and until an admin has granted
 * Thyme the directory permission (Settings).
 */
export function LicencesPanel() {
  const { account } = useAuth();
  const [load, setLoad] = useState<Load>({ state: 'checking' });
  const [includeTrials, setIncludeTrials] = useState(false);
  const [prices, setPrice] = usePriceOverrides(account?.tenantId);
  const [editing, setEditing] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const token = await getLicenceToken();
      if (!token || !(await isLicenceAdmin(token))) {
        if (!cancelled) setLoad({ state: 'hidden' });
        return;
      }
      if (!cancelled) setLoad({ state: 'loading' });
      try {
        const [skus, users] = await Promise.all([
          getSubscribedSkus(token),
          getLicensedUsers(token),
        ]);
        if (!cancelled) setLoad({ state: 'ready', skus, users });
      } catch (error) {
        console.error('Failed to load licences:', error);
        if (!cancelled) setLoad({ state: 'error' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [account?.homeAccountId]);

  const summary = useMemo(
    () =>
      load.state === 'ready'
        ? summariseLicences(load.skus, load.users, prices, includeTrials)
        : null,
    [load, prices, includeTrials]
  );

  if (load.state === 'checking' || load.state === 'hidden') return null;

  // Who has each flag, and licences paid for but not given to anyone
  const flagged = new Map<LicenceFlag, string[]>();
  for (const person of summary?.people ?? []) {
    for (const flag of person.flags) {
      flagged.set(flag, [...(flagged.get(flag) ?? []), person.user.displayName]);
    }
  }
  const unassigned = (summary?.totals ?? []).filter((t) => t.unassigned > 0 && !t.freeOrTrial);

  return (
    <Card variant="bordered" className="space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Licences</h2>
          <p className="text-dark-400 mt-1 text-sm">
            From Microsoft 365, for administrators. Prices are estimated UK list prices (GBP a
            month, ex VAT, annual term): set your own with the pencil.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-400">
          <input
            type="checkbox"
            checked={includeTrials}
            onChange={(e) => setIncludeTrials(e.target.checked)}
            className="accent-thyme-500"
          />
          Show free and trial licences
        </label>
      </div>

      {load.state === 'loading' && <div className="bg-dark-700 h-32 animate-pulse rounded-lg" />}
      {load.state === 'error' && (
        <p className="text-sm text-red-400">
          Couldn&apos;t load licences from Microsoft 365. Reload the page to try again.
        </p>
      )}

      {summary && (
        <>
          {/* Totals per licence */}
          <div className="border-dark-600 overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-dark-700 text-gray-400">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Licence</th>
                  <th className="px-3 py-2 text-right font-medium">Assigned</th>
                  <th className="px-3 py-2 text-right font-medium">Purchased</th>
                  <th className="px-3 py-2 text-right font-medium">Unassigned</th>
                  <th className="px-3 py-2 text-right font-medium">Price a month</th>
                  <th className="px-4 py-2 text-right font-medium">Monthly cost</th>
                </tr>
              </thead>
              <tbody className="divide-dark-600 divide-y">
                {summary.totals.map((t) => (
                  <tr key={t.skuId}>
                    <td className="px-4 py-2 text-white">
                      {t.sku.name}
                      {t.freeOrTrial && (
                        <span className="ml-2 text-xs text-gray-500">trial/free</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-300">{t.assigned}</td>
                    <td className="px-3 py-2 text-right text-gray-300">{t.purchased}</td>
                    <td
                      className={cn(
                        'px-3 py-2 text-right',
                        t.unassigned > 0 && !t.freeOrTrial ? 'text-amber-400' : 'text-gray-500'
                      )}
                    >
                      {t.unassigned}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-300">
                      {editing === t.sku.skuPartNumber ? (
                        <PriceInput
                          initial={t.monthlyPrice}
                          onDone={(price) => {
                            // Undefined: cancelled, nothing changes
                            if (price !== undefined) setPrice(t.sku.skuPartNumber, price);
                            setEditing(null);
                          }}
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => setEditing(t.sku.skuPartNumber)}
                          className="hover:text-thyme-400 inline-flex items-center gap-1"
                          title="Set your price"
                        >
                          {t.monthlyPrice === null ? 'Set price' : money(t.monthlyPrice)}
                          <PencilSquareIcon className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right text-white">
                      {t.monthlyCost === null ? '–' : money(t.monthlyCost)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-dark-700">
                <tr>
                  <td colSpan={5} className="px-4 py-2 font-medium text-white">
                    Total a month (purchased licences with a price)
                  </td>
                  <td className="px-4 py-2 text-right font-bold text-white">
                    {money(summary.monthlyTotal)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* What looks wrong */}
          {(flagged.size > 0 || unassigned.length > 0) && (
            <div className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
              <p className="flex items-center gap-2 text-sm font-medium text-amber-200">
                <ExclamationTriangleIcon className="h-5 w-5 text-amber-400" />
                Worth a look
              </p>
              <ul className="list-disc space-y-1 pl-6 text-sm text-amber-100/90">
                {[...flagged].map(([flag, names]) => (
                  <li key={flag}>
                    {LICENCE_FLAG_LABELS[flag]}: {names.join(', ')}
                  </li>
                ))}
                {unassigned.map((t) => (
                  <li key={t.skuId}>
                    {t.unassigned} {t.sku.name} purchased but not assigned
                    {t.monthlyPrice !== null &&
                      ` (${money(t.unassigned * t.monthlyPrice)} a month)`}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Each person */}
          <div className="border-dark-600 overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-dark-700 text-gray-400">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Person</th>
                  <th className="px-3 py-2 text-left font-medium">Business Central</th>
                  <th className="px-3 py-2 text-left font-medium">Microsoft 365</th>
                  <th className="px-4 py-2 text-left font-medium">Other</th>
                </tr>
              </thead>
              <tbody className="divide-dark-600 divide-y">
                {summary.people.map((p) => (
                  <tr key={p.user.id}>
                    <td className="px-4 py-2">
                      <span className="flex items-center gap-2 text-white">
                        {p.user.displayName}
                        {!p.user.accountEnabled && (
                          <span className="rounded bg-red-500/20 px-1.5 py-0.5 text-xs text-red-300">
                            Disabled
                          </span>
                        )}
                        {p.flags.length > 0 && (
                          <span title={p.flags.map((f) => LICENCE_FLAG_LABELS[f]).join('\n')}>
                            <ExclamationTriangleIcon
                              className="h-4 w-4 text-amber-400"
                              aria-label="Worth a look"
                            />
                          </span>
                        )}
                      </span>
                      <span className="text-dark-400 block text-xs">
                        {p.user.userPrincipalName}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-gray-300">{p.businessCentral?.name ?? '–'}</td>
                    <td className="px-3 py-2 text-gray-300">
                      {p.microsoft365.map((s) => s.name).join(', ') || '–'}
                    </td>
                    <td className="px-4 py-2 text-gray-400">
                      {[...p.dynamics, ...p.other].map((s) => s.name).join(', ') || '–'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Card>
  );
}

function PriceInput({
  initial,
  onDone,
}: {
  initial: number | null;
  /** A price, null to go back to the estimate, or undefined when cancelled */
  onDone: (price: number | null | undefined) => void;
}) {
  const [text, setText] = useState(initial === null ? '' : String(initial));
  const commit = () => {
    const value = Number.parseFloat(text);
    // Blank goes back to the estimate
    onDone(text.trim() === '' || !Number.isFinite(value) || value < 0 ? null : value);
  };
  return (
    <input
      type="number"
      min="0"
      step="0.01"
      value={text}
      autoFocus
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') onDone(undefined);
      }}
      aria-label="Price a month"
      className="border-dark-600 bg-dark-700 focus:border-thyme-500 w-24 rounded border px-2 py-1 text-right text-white focus:outline-none"
    />
  );
}
