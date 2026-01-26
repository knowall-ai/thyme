import { promises as fs } from 'fs';
import path from 'path';
import { Metadata } from 'next';
import { PublicPageLayout } from '@/components/docs/PublicPageLayout';
import { AsciidocContent } from '@/components/docs/AsciidocContent';

export const metadata: Metadata = {
  title: 'End User License Agreement - Thyme by KnowAll.ai',
  description:
    'End User License Agreement (EULA) for Thyme, the time tracking application for Microsoft Dynamics 365 Business Central.',
};

export default async function EulaPage() {
  const filePath = path.join(process.cwd(), 'docs', 'EULA.adoc');
  const content = await fs.readFile(filePath, 'utf-8');

  return (
    <PublicPageLayout>
      <AsciidocContent content={content} />
    </PublicPageLayout>
  );
}
