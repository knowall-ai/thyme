import { promises as fs } from 'fs';
import path from 'path';
import { Metadata } from 'next';
import { PublicPageLayout } from '@/components/docs/PublicPageLayout';
import { AsciidocContent } from '@/components/docs/AsciidocContent';

export const metadata: Metadata = {
  title: 'Help & Documentation - Thyme by KnowAll.ai',
  description:
    'Get help with Thyme, the time tracking application for Microsoft Dynamics 365 Business Central. Find FAQs and troubleshooting tips.',
};

export default async function HelpPage() {
  const faqsPath = path.join(process.cwd(), 'docs', 'FAQs.adoc');
  const troubleshootingPath = path.join(process.cwd(), 'docs', 'TROUBLESHOOTING.adoc');

  const [faqsContent, troubleshootingContent] = await Promise.all([
    fs.readFile(faqsPath, 'utf-8'),
    fs.readFile(troubleshootingPath, 'utf-8'),
  ]);

  return (
    <PublicPageLayout>
      <div className="mb-12">
        <h1 className="mb-4 text-4xl font-bold text-white">Help & Support</h1>
        <p className="text-dark-300 text-lg">
          Find answers to common questions and solutions to known issues with Thyme.
        </p>
      </div>

      {/* Quick links */}
      <div className="border-dark-700 bg-dark-800/50 mb-12 rounded-xl border p-6">
        <h2 className="mb-4 text-lg font-semibold text-white">Quick Links</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <a
            href="#faqs"
            className="border-dark-700 hover:border-knowall-green/50 hover:bg-dark-700/50 flex items-center gap-3 rounded-lg border p-4 transition-colors"
          >
            <span className="text-2xl">?</span>
            <div>
              <div className="font-medium text-white">FAQs</div>
              <div className="text-dark-400 text-sm">Common questions about Thyme</div>
            </div>
          </a>
          <a
            href="#troubleshooting"
            className="border-dark-700 hover:border-knowall-green/50 hover:bg-dark-700/50 flex items-center gap-3 rounded-lg border p-4 transition-colors"
          >
            <span className="text-2xl">!</span>
            <div>
              <div className="font-medium text-white">Troubleshooting</div>
              <div className="text-dark-400 text-sm">Solutions to common issues</div>
            </div>
          </a>
        </div>
      </div>

      {/* Contact support */}
      <div className="border-knowall-green/30 bg-knowall-green/10 mb-12 rounded-xl border p-6">
        <h2 className="text-knowall-green mb-2 font-semibold">Need more help?</h2>
        <p className="text-dark-300 mb-4">
          If you can&apos;t find what you&apos;re looking for, reach out to our support team.
        </p>
        <div className="flex flex-wrap gap-4">
          <a
            href="mailto:support@knowall.ai"
            className="bg-knowall-green text-dark-950 hover:bg-knowall-green-light rounded-lg px-4 py-2 text-sm font-medium transition-colors"
          >
            Email Support
          </a>
          <a
            href="https://github.com/knowall-ai/thyme/issues"
            target="_blank"
            rel="noopener noreferrer"
            className="border-dark-600 bg-dark-800 hover:bg-dark-700 rounded-lg border px-4 py-2 text-sm font-medium text-white transition-colors"
          >
            Report an Issue
          </a>
        </div>
      </div>

      {/* FAQs section */}
      <section id="faqs" className="mb-16 scroll-mt-24">
        <AsciidocContent content={faqsContent} />
      </section>

      {/* Troubleshooting section */}
      <section id="troubleshooting" className="scroll-mt-24">
        <AsciidocContent content={troubleshootingContent} />
      </section>
    </PublicPageLayout>
  );
}
