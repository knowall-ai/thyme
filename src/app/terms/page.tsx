import { promises as fs } from 'fs';
import path from 'path';
import { Metadata } from 'next';
import { PublicPageLayout } from '@/components/docs/PublicPageLayout';
import { LegalDocLayout } from '@/components/docs/LegalDocLayout';

export const metadata: Metadata = {
  title: 'Terms of Service - Timmie by KnowAll.ai',
  description:
    'Read the Terms of Service for Timmie, the time tracking application for Microsoft Dynamics 365 Business Central.',
};

export default async function TermsPage() {
  const filePath = path.join(process.cwd(), 'docs', 'TERMS.adoc');
  const content = await fs.readFile(filePath, 'utf-8');

  return (
    <PublicPageLayout>
      <LegalDocLayout content={content} />
    </PublicPageLayout>
  );
}
