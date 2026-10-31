'use client';

import { useEffect, useState } from 'react';

interface AsciidocContentProps {
  content: string;
  /** Show each row of a two-column table as an expandable question and answer */
  collapsibleTables?: boolean;
}

const CHEVRON =
  '<svg class="text-dark-400 mt-1 h-5 w-5 shrink-0 transition-transform group-open:rotate-180" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 111.08 1.04l-4.25 4.39a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z" clip-rule="evenodd" /></svg>';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

// Replace each table's rows (first cell: question, second: answer) with <details> elements
function tablesToDisclosures(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const usedIds = new Set<string>();

  doc.querySelectorAll('table').forEach((table) => {
    const list = doc.createElement('div');
    list.className =
      'border-dark-700 divide-dark-700 not-prose my-6 divide-y overflow-hidden rounded-xl border';

    table.querySelectorAll('tbody tr').forEach((row) => {
      const [question, answer] = Array.from(row.querySelectorAll('td'));
      if (!question || !answer) return;

      const title = question.textContent?.trim() ?? '';
      let id = slugify(title);
      for (let n = 2; usedIds.has(id); n++) id = `${slugify(title)}-${n}`;
      usedIds.add(id);

      const details = doc.createElement('details');
      details.id = id;
      details.className = 'group open:bg-dark-800/50 scroll-mt-24 transition-colors';

      const summary = doc.createElement('summary');
      summary.className =
        'hover:bg-dark-800/60 group-open:hover:bg-transparent flex cursor-pointer list-none items-start justify-between gap-4 px-5 py-4 font-medium text-white transition-colors group-open:text-brand [&::-webkit-details-marker]:hidden';
      summary.innerHTML = `<span>${question.querySelector('p')?.innerHTML ?? question.innerHTML}</span>${CHEVRON}`;

      const body = doc.createElement('div');
      body.className =
        'text-dark-300 border-dark-700/70 mx-5 space-y-3 border-t pt-4 pb-6 leading-relaxed [&_a]:text-brand [&_a:hover]:underline [&_code]:bg-dark-950/70 [&_code]:text-brand [&_code]:rounded [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-sm [&_code]:break-words [&_strong]:text-white';
      body.innerHTML = answer.innerHTML;

      details.append(summary, body);
      list.append(details);
    });

    table.replaceWith(list);
  });

  return doc.body.innerHTML;
}

export function AsciidocContent({ content, collapsibleTables = false }: AsciidocContentProps) {
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
      setHtml(collapsibleTables ? tablesToDisclosures(doc as string) : (doc as string));
    });
  }, [content, collapsibleTables]);

  // A link to one question (e.g. /help#timer-state-lost-on-refresh) opens it
  useEffect(() => {
    if (!html || !collapsibleTables || !window.location.hash) return;
    const target = document.getElementById(decodeURIComponent(window.location.hash.slice(1)));
    if (target instanceof HTMLDetailsElement) {
      target.open = true;
      target.scrollIntoView({ block: 'start' });
    }
  }, [html, collapsibleTables]);

  if (!html) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="border-brand h-8 w-8 animate-spin rounded-full border-2 border-t-transparent" />
      </div>
    );
  }

  return (
    <div
      className="prose prose-invert prose-lg prose-headings:text-white prose-headings:font-bold prose-h1:text-3xl prose-h1:mb-8 prose-h1:border-b prose-h1:border-dark-700 prose-h1:pb-4 prose-h2:text-2xl prose-h2:mt-10 prose-h2:mb-4 prose-h2:text-brand prose-h3:text-xl prose-h3:mt-6 prose-h3:mb-3 prose-p:text-dark-300 prose-p:leading-relaxed prose-li:text-dark-300 prose-strong:text-white prose-strong:font-semibold prose-a:text-brand prose-a:no-underline hover:prose-a:underline prose-code:text-brand prose-code:bg-dark-800 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-pre:bg-dark-800 prose-pre:border prose-pre:border-dark-700 prose-table:border-collapse prose-th:bg-dark-800 prose-th:border prose-th:border-dark-700 prose-th:px-4 prose-th:py-2 prose-th:text-left prose-td:border prose-td:border-dark-700 prose-td:px-4 prose-td:py-2 prose-hr:border-dark-700 max-w-none"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
