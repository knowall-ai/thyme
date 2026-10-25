'use client';

import { useState, useEffect } from 'react';
import { PublicPageLayout } from '@/components/docs/PublicPageLayout';
import { BitcoinLightningLogo } from '@/components/icons';
import { CheckIcon, BoltIcon } from '@heroicons/react/24/outline';
import { EnquiryForm } from '@/components/pricing/EnquiryForm';
import type { EnquiryOption } from '@/services/contact/enquiry';
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
  tagline: string;
  satsPrice: number | null; // null when there's no per-user price
  priceLabel: string;
  period: string;
  description: string;
  features: string[];
  cta: { label: string; href: string } | { label: string; enquire: EnquiryOption };
  highlighted: boolean;
}

const GITHUB_URL = 'https://github.com/knowall-ai/timmie';

const plans: Plan[] = [
  {
    name: 'Self-hosted',
    tagline: 'You run it, you support it',
    satsPrice: null,
    priceLabel: 'Free',
    period: '',
    description:
      'Timmie is open source under the MIT licence. Run it in your own Azure, connected to your own Business Central.',
    features: [
      'Every feature, no user limit',
      'Your own Azure tenant and domain',
      'Connect your own AI agent',
      'Community support on GitHub',
    ],
    cta: { label: 'View on GitHub', href: GITHUB_URL },
    highlighted: false,
  },
  {
    name: 'Hosted',
    tagline: 'We run it, we support it',
    satsPrice: SATS_PER_USER_MONTH,
    priceLabel: '',
    period: '/user/month',
    description:
      'We run Timmie for you at gettimm.ie and set your organisation up. Just install the Timmie BC Extension in Business Central.',
    features: [
      'Every feature, no setup or servers',
      'Updates and monitoring by KnowAll',
      'Timmie, our AI agent: time suggestions, timesheet and plan reviews',
      'Email support from the team who build it',
    ],
    cta: { label: 'Enquire about hosting', enquire: 'hosting' },
    highlighted: true,
  },
  {
    name: 'Support',
    tagline: 'You run it, we support it',
    satsPrice: null,
    priceLabel: 'Tailored',
    period: '',
    description:
      'Keep Timmie on your own infrastructure, with KnowAll behind you when you need help.',
    features: [
      'Help installing and upgrading Timmie and the BC Extension',
      'Email support from the team who build it',
      'Help connecting your AI agent',
      'Training and custom features on request',
    ],
    cta: { label: 'Enquire about support', enquire: 'support' },
    highlighted: false,
  },
];

const faqs = [
  {
    question: 'Is Timmie really free?',
    answer:
      'Yes. Timmie is open source under the MIT licence, with every feature and no user limit. You only pay if you want us to host it or support you.',
  },
  {
    question: 'What do I need to run Timmie?',
    answer:
      'Microsoft Dynamics 365 Business Central with the Timmie BC Extension installed, and Business Central licences for your users. Self-hosting also needs an Azure subscription and an Entra ID app registration.',
  },
  {
    question: 'Where does my data live?',
    answer:
      'Time entries, timesheets and plans stay in your Business Central. Timmie reads and writes them there, so moving between self-hosted and hosted later has nothing to migrate.',
  },
  {
    question: 'What about the AI agent?',
    answer:
      'Hosted includes Timmie, our AI agent, which suggests time entries and reviews timesheets and plans. Self-hosted or supported, you can connect your own agent through the Timmie BC Extension.',
  },
  {
    question: 'How do payments work?',
    answer:
      'Hosting is priced in sats per user per month and paid with Bitcoin over the Lightning Network. If you need a fiat invoice, ask when you enquire.',
  },
  {
    question: 'What are Zaps?',
    answer:
      'An optional feature: approvers can send small Lightning tips to people who submit their timesheets on time. It works on every option.',
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
              ? 'bg-brand text-brand-foreground'
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
  const [enquiryOption, setEnquiryOption] = useState<EnquiryOption>('hosting');

  useEffect(() => {
    async function fetchRates() {
      try {
        const cryptoRates = await getCryptoRates();
        setRates(cryptoRates);
      } catch (error) {
        console.error('Failed to fetch crypto rates:', error);
      }
    }
    fetchRates();

    // Refresh rates every 5 minutes
    const interval = setInterval(fetchRates, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const enquire = (option: EnquiryOption) => {
    setEnquiryOption(option);
    document.getElementById('enquire')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const ctaClass = (highlighted: boolean) =>
    `mt-8 block w-full rounded-lg px-6 py-3 text-center font-semibold transition-colors ${
      highlighted
        ? 'bg-brand text-brand-foreground hover:bg-brand-hover'
        : 'border-dark-600 bg-dark-800 hover:bg-dark-700 border text-white'
    }`;

  return (
    <PublicPageLayout>
      <div className="text-center">
        <h1 className="text-4xl font-bold text-white">Free and open source</h1>
        <p className="text-dark-300 mx-auto mt-4 max-w-2xl text-lg">
          Run Timmie yourself for free, or let us host and support it for you. Every option has
          every feature.
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
            className={`flex flex-col rounded-2xl border p-8 ${
              plan.highlighted
                ? 'border-brand bg-brand/5 ring-brand ring-1'
                : 'border-dark-700 bg-dark-800/50'
            }`}
          >
            <h2 className="text-2xl font-bold text-white">{plan.name}</h2>
            <p className="text-brand mt-1 text-sm font-medium">{plan.tagline}</p>

            <PriceDisplay plan={plan} currency={currency} rates={rates} />

            <p className="text-dark-400 mt-4">{plan.description}</p>

            <ul className="mt-8 flex-1 space-y-4">
              {plan.features.map((feature) => (
                <li key={feature} className="flex items-start gap-3">
                  <CheckIcon className="text-brand mt-0.5 h-5 w-5 shrink-0" />
                  <span className="text-dark-300">{feature}</span>
                </li>
              ))}
            </ul>

            {'href' in plan.cta ? (
              <a
                href={plan.cta.href}
                target="_blank"
                rel="noopener noreferrer"
                className={ctaClass(plan.highlighted)}
              >
                {plan.cta.label}
              </a>
            ) : (
              <button
                type="button"
                onClick={() => enquire((plan.cta as { enquire: EnquiryOption }).enquire)}
                className={ctaClass(plan.highlighted)}
              >
                {plan.cta.label}
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Lightning info banner */}
      <div className="mt-12 rounded-xl border border-amber-500/30 bg-amber-500/5 p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-amber-500/10">
            <BitcoinLightningLogo className="h-8 w-8" />
          </div>
          <div>
            <h3 className="mb-2 font-semibold text-white">Priced in sats, paid by Lightning</h3>
            <p className="text-dark-300 text-sm">
              Hosting is priced in sats, so you always know what you pay, and paid with Bitcoin over
              the Lightning Network for instant, low-fee payments. The pounds, euros and dollars
              above are today&apos;s equivalent.
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

      {/* Enquiry form */}
      <section
        id="enquire"
        className="border-dark-700 bg-dark-800/50 mt-20 scroll-mt-24 rounded-2xl border p-8"
      >
        <div className="mb-8 max-w-2xl">
          <h2 className="mb-2 text-2xl font-bold text-white">Talk to us</h2>
          <p className="text-dark-400">
            Interested in hosting or support, or have a question about running Timmie yourself? Send
            us a message and we&apos;ll get back to you.
          </p>
        </div>
        <EnquiryForm option={enquiryOption} onOptionChange={setEnquiryOption} />
      </section>
    </PublicPageLayout>
  );
}
