'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { ArrowRightIcon } from '@heroicons/react/24/outline';
import { ThymeLogo } from '@/components/icons';
import { useAuth } from '@/services/auth';
import { getOrganisationName } from '@/services/auth/tenantAccessService';
import { ACCESS_REQUEST_EMAIL, accessRequestMailto } from '@/utils/tenantAccess';

const APP_NAME = 'Thyme';

interface NotApprovedPageProps {
  /** The signed-in organisation's tenant ID (null when the sign-in had none) */
  tenantId: string | null;
  email: string | null;
  /** Set when the approval check itself failed: offers a retry instead */
  onRetry?: () => void;
  /** The organisation's name, when already known (otherwise it's asked of Graph) */
  organisationName?: string | null;
}

/**
 * Shown to someone signed in from an organisation KnowAll hasn't approved yet: what
 * Thyme looks like, and two ways to ask for access. No app data and no navigation.
 */
export function NotApprovedPage({
  tenantId,
  email,
  onRetry,
  organisationName: knownName,
}: NotApprovedPageProps) {
  const { logout } = useAuth();
  const [lookedUpName, setLookedUpName] = useState<string | null>(null);
  const organisationName = knownName ?? lookedUpName;

  useEffect(() => {
    if (knownName !== undefined) return;
    let cancelled = false;
    getOrganisationName().then((name) => {
      if (!cancelled) setLookedUpName(name);
    });
    return () => {
      cancelled = true;
    };
  }, [knownName]);

  const mailto = accessRequestMailto({ app: APP_NAME, organisationName, tenantId, email });

  return (
    <main className="bg-dark-950 relative isolate flex min-h-screen flex-col overflow-hidden">
      {/* The visual: Thyme's timesheet, big and tilted, behind a dark gradient */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div className="bg-grid-pattern bg-grid absolute inset-0 opacity-20" />
        <div className="bg-knowall-green/20 absolute top-24 -right-24 h-[28rem] w-[28rem] rounded-full blur-3xl lg:top-1/4 lg:right-0 lg:h-[40rem] lg:w-[40rem]" />
        <div className="absolute top-20 -right-[55%] w-[150%] [perspective:1600px] sm:-right-[30%] sm:w-[110%] lg:top-1/2 lg:-right-[10%] lg:w-[64%] lg:-translate-y-1/2">
          <div className="border-knowall-green/30 shadow-knowall-green/20 [transform:rotateY(-14deg)_rotateX(6deg)_rotate(-2deg)] overflow-hidden rounded-2xl border shadow-2xl">
            <Image
              src="/screenshots/timesheet.png"
              alt=""
              width={1280}
              height={720}
              priority
              className="block h-auto w-full"
            />
          </div>
        </div>
        {/* Dark gradient behind the text: up from the bottom on phones, from the left on desktops */}
        <div className="from-dark-950 via-dark-950/90 to-dark-950/10 lg:via-dark-950/70 absolute inset-0 bg-gradient-to-t via-55% lg:bg-gradient-to-r lg:via-40% lg:to-transparent" />
      </div>

      <header className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-5 sm:px-6 lg:px-8">
        <div className="flex items-center gap-2">
          <div className="bg-knowall-green shadow-knowall-green/20 flex h-8 w-8 items-center justify-center rounded-lg shadow-lg">
            <ThymeLogo className="text-dark-950 h-5 w-5" />
          </div>
          <span className="text-xl font-bold text-white">{APP_NAME}</span>
        </div>
        <button
          type="button"
          onClick={() => void logout()}
          className="text-dark-300 text-sm font-medium underline-offset-4 hover:text-white hover:underline"
        >
          Sign out
        </button>
      </header>

      <section className="mx-auto flex w-full max-w-7xl flex-1 items-end px-4 pt-56 pb-14 sm:px-6 sm:pt-72 lg:items-center lg:px-8 lg:py-24">
        <div className="max-w-xl">
          <p className="text-knowall-green mb-4 text-sm font-semibold tracking-wider uppercase">
            {onRetry ? 'Checking access' : 'Not set up yet'}
          </p>
          <h1 className="mb-5 text-4xl leading-tight font-bold text-white sm:text-5xl lg:text-6xl">
            {onRetry ? (
              <>We couldn&apos;t check your organisation just now.</>
            ) : (
              <>
                Your organisation isn&apos;t set up on{' '}
                <span className="text-knowall-green">{APP_NAME}</span> yet.
              </>
            )}
          </h1>
          <p className="text-dark-200 mb-8 text-lg sm:text-xl">
            {onRetry
              ? 'Thyme couldn’t confirm your organisation’s access. Try again in a moment, or get in touch if it keeps happening.'
              : 'Thyme is available to organisations KnowAll has approved. Ask us and we’ll get you set up.'}
          </p>

          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
            {onRetry ? (
              <button
                type="button"
                onClick={onRetry}
                className="group bg-knowall-green text-dark-950 shadow-knowall-green/20 hover:bg-knowall-green-light flex items-center justify-center gap-2 rounded-xl px-7 py-3.5 font-semibold shadow-xl transition-all"
              >
                Try again
              </button>
            ) : (
              <a
                href={mailto}
                className="group bg-knowall-green text-dark-950 shadow-knowall-green/20 hover:bg-knowall-green-light hover:shadow-knowall-green/40 flex items-center justify-center gap-2 rounded-xl px-7 py-3.5 font-semibold shadow-xl transition-all"
              >
                Request access
                <ArrowRightIcon className="h-5 w-5 transition-transform group-hover:translate-x-1" />
              </a>
            )}
            <p className="text-dark-200 text-center sm:text-left">
              Or email us at{' '}
              <a
                href={`mailto:${ACCESS_REQUEST_EMAIL}`}
                className="hover:text-knowall-green font-semibold text-white underline underline-offset-4"
              >
                {ACCESS_REQUEST_EMAIL}
              </a>
            </p>
          </div>

          <dl className="text-dark-400 mt-10 space-y-1 text-xs">
            <div className="flex flex-wrap gap-x-2">
              <dt>Organisation:</dt>
              <dd className="text-dark-300">{organisationName || 'Unknown'}</dd>
            </div>
            <div className="flex flex-wrap gap-x-2">
              <dt>Tenant ID:</dt>
              <dd className="text-dark-300 font-mono break-all">{tenantId || 'Unknown'}</dd>
            </div>
            {email && (
              <div className="flex flex-wrap gap-x-2">
                <dt>Signed in as:</dt>
                <dd className="text-dark-300 break-all">{email}</dd>
              </div>
            )}
          </dl>
        </div>
      </section>
    </main>
  );
}
