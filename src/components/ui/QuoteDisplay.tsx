'use client';

import { useState, useEffect, useCallback } from 'react';
import { quotes, type Quote } from '@/config/quotes';

export interface QuoteDisplayProps {
  /** Interval in milliseconds to rotate quotes. Set to 0 to disable rotation. */
  rotateInterval?: number;
  /** Additional CSS classes for the container */
  className?: string;
  /** Whether to show the source (book/work) if available */
  showSource?: boolean;
}

function getRandomQuote(excludeIndex?: number): { quote: Quote; index: number } {
  let index: number;
  if (excludeIndex !== undefined && quotes.length > 1) {
    // Pick a different quote than the current one
    do {
      index = Math.floor(Math.random() * quotes.length);
    } while (index === excludeIndex);
  } else {
    index = Math.floor(Math.random() * quotes.length);
  }
  return { quote: quotes[index], index };
}

export function QuoteDisplay({
  rotateInterval = 10000,
  className = '',
  showSource = true,
}: QuoteDisplayProps) {
  const [{ quote, index }, setQuoteState] = useState(() => getRandomQuote());
  const [isTransitioning, setIsTransitioning] = useState(false);

  const rotateQuote = useCallback(() => {
    setIsTransitioning(true);
    setTimeout(() => {
      setQuoteState((prev) => getRandomQuote(prev.index));
      setIsTransitioning(false);
    }, 300); // Match the CSS transition duration
  }, []);

  useEffect(() => {
    if (rotateInterval <= 0) return;

    const interval = setInterval(rotateQuote, rotateInterval);
    return () => clearInterval(interval);
  }, [rotateInterval, rotateQuote]);

  return (
    <div
      className={`text-center ${className}`}
      aria-live="polite"
      aria-atomic="true"
      role="status"
    >
      <p
        className={`text-dark-300 mb-3 text-lg italic transition-opacity duration-300 ${
          isTransitioning ? 'opacity-0' : 'opacity-100'
        }`}
      >
        &quot;{quote.text}&quot;
      </p>
      <p
        className={`text-dark-500 text-sm transition-opacity duration-300 ${
          isTransitioning ? 'opacity-0' : 'opacity-100'
        }`}
      >
        — {quote.author}
        {showSource && quote.source && <>, {quote.source}</>}
      </p>
    </div>
  );
}
