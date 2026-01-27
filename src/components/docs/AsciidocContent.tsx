'use client';

import { useEffect, useState } from 'react';

interface AsciidocContentProps {
  content: string;
}

export function AsciidocContent({ content }: AsciidocContentProps) {
  const [html, setHtml] = useState<string>('');

  useEffect(() => {
    // Dynamic import to avoid SSR issues with asciidoctor
    import('asciidoctor').then((Asciidoctor) => {
      const asciidoctor = Asciidoctor.default();
      const doc = asciidoctor.convert(content, {
        standalone: false,
        safe: 'safe',
        attributes: {
          showtitle: true,
          'source-highlighter': 'highlight.js',
        },
      });
      setHtml(doc as string);
    });
  }, [content]);

  if (!html) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="border-knowall-green h-8 w-8 animate-spin rounded-full border-2 border-t-transparent" />
      </div>
    );
  }

  return (
    <div
      className="prose prose-invert prose-lg prose-headings:text-white prose-headings:font-bold prose-h1:text-3xl prose-h1:mb-8 prose-h1:border-b prose-h1:border-dark-700 prose-h1:pb-4 prose-h2:text-2xl prose-h2:mt-10 prose-h2:mb-4 prose-h2:text-knowall-green prose-h3:text-xl prose-h3:mt-6 prose-h3:mb-3 prose-p:text-dark-300 prose-p:leading-relaxed prose-li:text-dark-300 prose-strong:text-white prose-strong:font-semibold prose-a:text-knowall-green prose-a:no-underline hover:prose-a:underline prose-code:text-knowall-green prose-code:bg-dark-800 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-pre:bg-dark-800 prose-pre:border prose-pre:border-dark-700 prose-table:border-collapse prose-th:bg-dark-800 prose-th:border prose-th:border-dark-700 prose-th:px-4 prose-th:py-2 prose-th:text-left prose-td:border prose-td:border-dark-700 prose-td:px-4 prose-td:py-2 prose-hr:border-dark-700 max-w-none"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
