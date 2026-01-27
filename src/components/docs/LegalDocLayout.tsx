'use client';

import { useEffect, useState, useRef } from 'react';

interface Section {
  id: string;
  title: string;
  number?: string;
}

interface LegalDocLayoutProps {
  content: string;
}

export function LegalDocLayout({ content }: LegalDocLayoutProps) {
  const [html, setHtml] = useState<string>('');
  const [sections, setSections] = useState<Section[]>([]);
  const [activeSection, setActiveSection] = useState<string>('');
  const contentRef = useRef<HTMLDivElement>(null);

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
          idprefix: '',
          idseparator: '-',
        },
      });

      // Parse the HTML to extract sections and add IDs
      const parser = new DOMParser();
      const htmlDoc = parser.parseFromString(doc as string, 'text/html');
      const headings = htmlDoc.querySelectorAll('h2');
      const extractedSections: Section[] = [];

      headings.forEach((heading, index) => {
        // Generate ID from heading text
        const text = heading.textContent || '';
        // Extract section number if present (e.g., "1. License Grant" -> number: "1", title: "License Grant")
        const match = text.match(/^(\d+)\.\s*(.+)$/);
        const id = text
          .toLowerCase()
          .replace(/^\d+\.\s*/, '')
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '');

        heading.id = id;

        extractedSections.push({
          id,
          title: match ? match[2] : text,
          number: match ? match[1] : undefined,
        });
      });

      setSections(extractedSections);
      setHtml(htmlDoc.body.innerHTML);
      if (extractedSections.length > 0) {
        setActiveSection(extractedSections[0].id);
      }
    });
  }, [content]);

  // Handle scroll to update active section
  useEffect(() => {
    const container = contentRef.current;
    if (!container || sections.length === 0) return;

    const handleScroll = () => {
      const containerTop = container.getBoundingClientRect().top;

      // Find which section is currently in view
      for (let i = sections.length - 1; i >= 0; i--) {
        const element = container.querySelector(`#${sections[i].id}`);
        if (element) {
          const rect = element.getBoundingClientRect();
          const relativeTop = rect.top - containerTop;
          if (relativeTop <= 100) {
            setActiveSection(sections[i].id);
            break;
          }
        }
      }
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [sections]);

  const scrollToSection = (id: string) => {
    const container = contentRef.current;
    if (!container) return;

    const element = container.querySelector(`#${id}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setActiveSection(id);
    }
  };

  if (!html) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="border-knowall-green h-8 w-8 animate-spin rounded-full border-2 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex gap-8">
      {/* Left sidebar - Table of Contents */}
      <nav className="hidden w-64 shrink-0 lg:block">
        <div className="sticky top-24">
          <h3 className="mb-4 text-sm font-semibold text-white">Contents</h3>
          <ul className="space-y-1">
            {sections.map((section) => (
              <li key={section.id}>
                <button
                  onClick={() => scrollToSection(section.id)}
                  className={`block w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                    activeSection === section.id
                      ? 'bg-knowall-green/10 text-knowall-green font-medium'
                      : 'text-dark-400 hover:bg-dark-800 hover:text-white'
                  }`}
                >
                  {section.number && <span className="text-dark-500 mr-2">{section.number}.</span>}
                  {section.title}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </nav>

      {/* Right content - Scrollable box */}
      <div className="flex-1">
        <div
          ref={contentRef}
          className="border-dark-700 bg-dark-800/50 h-[calc(100vh-200px)] overflow-y-auto rounded-xl border p-8"
        >
          <div
            className="prose prose-invert prose-lg prose-headings:text-white prose-headings:font-bold prose-h1:text-3xl prose-h1:mb-8 prose-h1:border-b prose-h1:border-dark-700 prose-h1:pb-4 prose-h2:text-2xl prose-h2:mt-10 prose-h2:mb-4 prose-h2:text-knowall-green prose-h2:scroll-mt-4 prose-h3:text-xl prose-h3:mt-6 prose-h3:mb-3 prose-p:text-dark-300 prose-p:leading-relaxed prose-li:text-dark-300 prose-strong:text-white prose-strong:font-semibold prose-a:text-knowall-green prose-a:no-underline hover:prose-a:underline prose-code:text-knowall-green prose-code:bg-dark-800 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-pre:bg-dark-800 prose-pre:border prose-pre:border-dark-700 prose-table:border-collapse prose-th:bg-dark-800 prose-th:border prose-th:border-dark-700 prose-th:px-4 prose-th:py-2 prose-th:text-left prose-td:border prose-td:border-dark-700 prose-td:px-4 prose-td:py-2 prose-hr:border-dark-700 max-w-none"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>
      </div>
    </div>
  );
}
