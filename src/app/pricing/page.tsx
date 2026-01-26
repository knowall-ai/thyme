'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { PublicPageLayout } from '@/components/docs/PublicPageLayout';
import { BitcoinLightningLogo } from '@/components/icons';
import { CheckIcon, BoltIcon } from '@heroicons/react/24/outline';
import {
  getCryptoRates,
  satsToFiat,
  formatSats,
  formatFiat,
  type CryptoRates,
} from '@/services/crypto';

type Currency = 'sats' | 'gbp' | 'eur' | 'usd';

const SATS_PER_USER_MONTH = 10_000;

const currencyLabels: Record<Currency, string> = {
  sats: 'Sats',
  gbp: 'GBP',
  eur: 'EUR',
  usd: 'USD',
};

interface Plan {
  name: string;
  satsPrice: number | null; // null for free or custom
  priceLabel: string;
  period: string;
  description: string;
  features: string[];
  cta: string;
  highlighted: boolean;
}

const plans: Plan[] = [
  {
    name: 'Starter',
    satsPrice: null,
    priceLabel: 'Free',
    period: '',
    description: 'Perfect for small teams getting started with time tracking.',
    features: [
      'Up to 5 users',
      'Weekly timesheet view',
      'Business Central sync',
      'Timer functionality',
      'Basic reporting',
      'Community support',
    ],
    cta: 'Get Started',
    highlighted: false,
  },
  {
    name: 'Professional',
    satsPrice: SATS_PER_USER_MONTH,
    priceLabel: '',
    period: '/user/month',
    description: 'For growing teams that need advanced features and support.',
    features: [
      'Unlimited users',
      'Everything in Starter',
      'Timesheet approval workflow',
      'Team planning & scheduling',
      'Advanced analytics',
      'CSV export',
      'Priority email support',
      'Tip your team members',
    ],
    cta: 'Start Free Trial',
    highlighted: true,
  },
  {
    name: 'Enterprise',
    satsPrice: null,
    priceLabel: 'Custom',
    period: '',
    description: 'For large organizations with custom requirements.',
    features: [
      'Everything in Professional',
      'Custom integrations',
      'Dedicated account manager',
      'SLA guarantees',
      'Fiat invoicing available (10% fee)',
      'Custom training',
      'Priority support',
    ],
    cta: 'Contact Sales',
    highlighted: false,
  },
];

const faqs = [
  {
    question: 'Do I need a Business Central license?',
    answer:
      'Yes, Thyme requires Microsoft Dynamics 365 Business Central. Users need appropriate BC licenses to sync time data.',
  },
  {
    question: 'Is there a free trial?',
    answer:
      'Yes! The Professional plan includes a 14-day free trial. No payment required to start.',
  },
  {
    question: 'Can I change plans later?',
    answer:
      'Absolutely. You can upgrade or downgrade your plan at any time. Changes take effect at the start of your next billing cycle.',
  },
  {
    question: 'How do payments work?',
    answer:
      'We accept Bitcoin via Lightning Network for instant, low-fee payments. Top up your account balance and subscriptions are deducted monthly. Enterprise customers can arrange fiat invoicing.',
  },
  {
    question: 'What is the tipping feature?',
    answer:
      'Professional plan users can optionally tip team members when approving timesheets. Tips are paid from your account balance via Lightning.',
  },
  {
    question: 'Why Bitcoin only?',
    answer:
      'Bitcoin Lightning enables instant, global payments with minimal fees. It aligns with our values of sovereignty, privacy, and sound money.',
  },
];

function CurrencyToggle({
  selected,
  onChange,
}: {
  selected: Currency;
  onChange: (c: Currency) => void;
}) {
  const currencies: Currency[] = ['sats', 'gbp', 'eur', 'usd'];

  return (
    <div className="border-dark-700 bg-dark-800 inline-flex rounded-lg border p-1">
      {currencies.map((currency) => (
        <button
          key={currency}
          onClick={() => onChange(currency)}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            selected === currency
              ? 'bg-knowall-green text-dark-950'
              : 'text-dark-400 hover:text-white'
          }`}
        >
          {currencyLabels[currency]}
        </button>
      ))}
    </div>
  );
}

function PriceDisplay({
  plan,
  currency,
  rates,
}: {
  plan: Plan;
  currency: Currency;
  rates: CryptoRates | null;
}) {
  if (plan.satsPrice === null) {
    return (
      <div className="mt-4 flex items-baseline">
        <span className="text-4xl font-bold text-white">{plan.priceLabel}</span>
        {plan.period && <span className="text-dark-400 ml-1">{plan.period}</span>}
      </div>
    );
  }

  if (currency === 'sats') {
    return (
      <div className="mt-4 flex items-baseline gap-2">
        <BoltIcon className="h-6 w-6 text-amber-400" />
        <span className="text-4xl font-bold text-white">{formatSats(plan.satsPrice)}</span>
        <span className="text-dark-400">sats{plan.period}</span>
      </div>
    );
  }

  // Show fiat equivalent
  if (!rates) {
    return (
      <div className="mt-4 flex items-baseline">
        <span className="text-dark-400 text-2xl">Loading...</span>
      </div>
    );
  }

  const fiat = satsToFiat(plan.satsPrice, rates);
  const amount = fiat[currency as 'gbp' | 'eur' | 'usd'];

  return (
    <div className="mt-4">
      <div className="flex items-baseline gap-1">
        <span className="text-dark-400 text-lg">≈</span>
        <span className="text-4xl font-bold text-white">
          {formatFiat(amount, currency as 'gbp' | 'eur' | 'usd')}
        </span>
        <span className="text-dark-400">{plan.period}</span>
      </div>
      <div className="text-dark-500 mt-1 flex items-center gap-1 text-xs">
        <BoltIcon className="h-3 w-3 text-amber-400" />
        {formatSats(plan.satsPrice)} sats
      </div>
    </div>
  );
}

export default function PricingPage() {
  const [currency, setCurrency] = useState<Currency>('sats');
  const [rates, setRates] = useState<CryptoRates | null>(null);
  const [_isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchRates() {
      try {
        const cryptoRates = await getCryptoRates();
        setRates(cryptoRates);
      } catch (error) {
        console.error('Failed to fetch crypto rates:', error);
      } finally {
        setIsLoading(false);
      }
    }
    fetchRates();

    // Refresh rates every 5 minutes
    const interval = setInterval(fetchRates, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <PublicPageLayout>
      <div className="text-center">
        <div className="mb-4 flex items-center justify-center gap-3">
          <BitcoinLightningLogo className="h-10 w-10" />
          <h1 className="text-4xl font-bold text-white">Simple, Transparent Pricing</h1>
        </div>
        <p className="text-dark-300 mx-auto max-w-2xl text-lg">
          Pay with Bitcoin Lightning. Fixed pricing in Sats means you always know what you pay.
        </p>

        {/* Currency toggle */}
        <div className="mt-6">
          <CurrencyToggle selected={currency} onChange={setCurrency} />
          {rates && currency !== 'sats' && (
            <p className="text-dark-500 mt-2 text-xs">
              Rates from {rates.sources.join(', ')} · Updated{' '}
              {rates.lastUpdated.toLocaleTimeString()}
            </p>
          )}
        </div>
      </div>

      {/* Pricing cards */}
      <div className="mt-12 grid gap-8 lg:grid-cols-3">
        {plans.map((plan) => (
          <div
            key={plan.name}
            className={`rounded-2xl border p-8 ${
              plan.highlighted
                ? 'border-knowall-green bg-knowall-green/5 ring-knowall-green ring-1'
                : 'border-dark-700 bg-dark-800/50'
            }`}
          >
            {plan.highlighted && (
              <div className="mb-4 inline-flex items-center gap-2">
                <span className="bg-knowall-green text-dark-950 rounded-full px-3 py-1 text-xs font-semibold">
                  Most Popular
                </span>
                <BoltIcon className="h-5 w-5 text-amber-400" />
              </div>
            )}

            <h2 className="text-2xl font-bold text-white">{plan.name}</h2>

            <PriceDisplay plan={plan} currency={currency} rates={rates} />

            <p className="text-dark-400 mt-4">{plan.description}</p>

            <ul className="mt-8 space-y-4">
              {plan.features.map((feature) => (
                <li key={feature} className="flex items-start gap-3">
                  <CheckIcon className="text-knowall-green mt-0.5 h-5 w-5 shrink-0" />
                  <span className="text-dark-300">{feature}</span>
                </li>
              ))}
            </ul>

            <Link
              href={plan.name === 'Enterprise' ? 'mailto:sales@knowall.ai' : '/'}
              className={`mt-8 block w-full rounded-lg px-6 py-3 text-center font-semibold transition-colors ${
                plan.highlighted
                  ? 'bg-knowall-green text-dark-950 hover:bg-knowall-green-light'
                  : 'border-dark-600 bg-dark-800 hover:bg-dark-700 border text-white'
              }`}
            >
              {plan.cta}
            </Link>
          </div>
        ))}
      </div>

      {/* Lightning info banner */}
      <div className="mt-12 rounded-xl border border-amber-500/30 bg-amber-500/5 p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-amber-500/10">
            <BoltIcon className="h-6 w-6 text-amber-400" />
          </div>
          <div>
            <h3 className="mb-2 font-semibold text-white">Bitcoin Lightning Payments</h3>
            <p className="text-dark-300 text-sm">
              We accept Bitcoin via the Lightning Network for instant, low-fee payments. Top up your
              account balance and your monthly subscription is automatically deducted. Your balance
              can also be used to tip team members on approved timesheets.
            </p>
            <p className="text-dark-500 mt-3 text-xs">
              Billing by KnowAll AI SAS de CV, El Salvador. NIT: 0623-070525-121-2 | NRC: 362963-0
            </p>
          </div>
        </div>
      </div>

      {/* FAQs */}
      <div className="mt-20">
        <h2 className="mb-8 text-center text-2xl font-bold text-white">
          Frequently Asked Questions
        </h2>

        <div className="grid gap-6 md:grid-cols-2">
          {faqs.map((faq) => (
            <div
              key={faq.question}
              className="border-dark-700 bg-dark-800/50 rounded-xl border p-6"
            >
              <h3 className="mb-2 font-semibold text-white">{faq.question}</h3>
              <p className="text-dark-400">{faq.answer}</p>
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div className="border-dark-700 bg-dark-800/50 mt-20 rounded-2xl border p-8 text-center">
        <h2 className="mb-4 text-2xl font-bold text-white">Ready to get started?</h2>
        <p className="text-dark-400 mx-auto mb-6 max-w-xl">
          Join teams using Thyme to streamline their time tracking and Business Central integration.
        </p>
        <Link
          href="/"
          className="bg-knowall-green text-dark-950 hover:bg-knowall-green-light inline-flex items-center gap-2 rounded-lg px-8 py-3 font-semibold transition-colors"
        >
          <BoltIcon className="h-5 w-5" />
          Start Free Trial
        </Link>
      </div>
    </PublicPageLayout>
  );
}
