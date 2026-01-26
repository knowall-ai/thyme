import { promises as fs } from 'fs';
import path from 'path';
import { Metadata } from 'next';
import { PublicPageLayout } from '@/components/docs/PublicPageLayout';
import { AsciidocContent } from '@/components/docs/AsciidocContent';

export const metadata: Metadata = {
  title: 'Privacy Policy - Thyme by KnowAll.ai',
  description:
    'Learn how Thyme collects, uses, and protects your personal information. Our privacy policy explains our data practices for our time tracking application.',
};

export default async function PrivacyPage() {
  const filePath = path.join(process.cwd(), 'docs', 'PRIVACY.adoc');
  const content = await fs.readFile(filePath, 'utf-8');

  return (
    <PublicPageLayout>
      <AsciidocContent content={content} />
    </PublicPageLayout>
  );
}
