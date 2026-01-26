import { Metadata } from 'next';
import Link from 'next/link';
import { PublicPageLayout } from '@/components/docs/PublicPageLayout';
import { CheckIcon } from '@heroicons/react/24/outline';

export const metadata: Metadata = {
  title: 'Pricing - Thyme by KnowAll.ai',
  description:
    'Simple, transparent pricing for Thyme time tracking. Free for small teams, affordable plans for growing organizations.',
};

const plans = [
  {
    name: 'Starter',
    price: 'Free',
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
    price: '£5',
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
    ],
    cta: 'Start Free Trial',
    highlighted: true,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    period: '',
    description: 'For large organizations with custom requirements.',
    features: [
      'Everything in Professional',
      'Custom integrations',
      'Dedicated account manager',
      'SLA guarantees',
      'On-premise deployment option',
      'Custom training',
      'Phone support',
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
      'Yes! The Professional plan includes a 14-day free trial. No credit card required to start.',
  },
  {
    question: 'Can I change plans later?',
    answer:
      'Absolutely. You can upgrade or downgrade your plan at any time. Changes take effect at the start of your next billing cycle.',
  },
  {
    question: 'What payment methods do you accept?',
    answer:
      'We accept all major credit cards and can arrange invoicing for annual Enterprise plans.',
  },
];

export default function PricingPage() {
  return (
    <PublicPageLayout>
      <div className="text-center">
        <h1 className="mb-4 text-4xl font-bold text-white">Simple, Transparent Pricing</h1>
        <p className="text-dark-300 mx-auto max-w-2xl text-lg">
          Choose the plan that fits your team. All plans include Business Central integration and
          core time tracking features.
        </p>
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
              <div className="bg-knowall-green text-dark-950 mb-4 inline-block rounded-full px-3 py-1 text-xs font-semibold">
                Most Popular
              </div>
            )}

            <h2 className="text-2xl font-bold text-white">{plan.name}</h2>

            <div className="mt-4 flex items-baseline">
              <span className="text-4xl font-bold text-white">{plan.price}</span>
              {plan.period && <span className="text-dark-400 ml-1">{plan.period}</span>}
            </div>

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
          className="bg-knowall-green text-dark-950 hover:bg-knowall-green-light inline-block rounded-lg px-8 py-3 font-semibold transition-colors"
        >
          Start Free Trial
        </Link>
      </div>
    </PublicPageLayout>
  );
}
