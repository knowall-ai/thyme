'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';

interface Screenshot {
  src: string;
  alt: string;
  title: string;
  description: string;
}

// Captured with scripts/capture-screenshots.mjs; a missing image shows a placeholder slide
const screenshots: Screenshot[] = [
  {
    src: '/screenshots/timesheet.png',
    alt: 'Weekly timesheet with time entries and billable % for each day',
    title: 'Weekly Timesheet',
    description:
      "Enter time against projects and tasks in a weekly grid, and see each day's billable % against your target.",
  },
  {
    src: '/screenshots/poppie-suggestions.png',
    alt: "The AI agent's suggested time entries for the week, grouped by day, with Add and Edit buttons",
    title: 'AI Time Suggestions',
    description:
      'The AI agent suggests entries from your calendar, GitHub and Azure DevOps. Add each one, edit it first or dismiss it.',
  },
  {
    src: '/screenshots/projects.png',
    alt: 'Project details with estimate, time spent by stage, forecast and Spend vs Budget chart',
    title: 'Projects',
    description:
      'Track spend against the quoted estimate, forecast the finish date from planned hours, and break time down by task.',
  },
  {
    src: '/screenshots/team.png',
    alt: 'Team overview with hours by timesheet stage, timesheet completion and billable % against target',
    title: 'Team',
    description:
      "See your team's hours, timesheet completion and billable % against each person's target.",
  },
  {
    src: '/screenshots/plan.png',
    alt: 'Resource plan with a person expanded to show daily allocations by project and task',
    title: 'Plan',
    description:
      'Plan people across projects and tasks, with over-capacity days in red and under-capacity days in amber.',
  },
  {
    src: '/screenshots/plan-review.png',
    alt: "Plan grid with the AI agent's verdict in the week header and its review open, showing a proposed change",
    title: 'AI Plan Review',
    description:
      "The AI agent checks each week's plan for targets, capacity, holidays and budget burn, and proposes changes you can apply.",
  },
  {
    src: '/screenshots/approvals.png',
    alt: 'Submitted timesheet expanded with one row per entry, its day, and daily hours',
    title: 'Approvals',
    description:
      "Review each entry with its day, the daily hours, billable % against target and the AI agent's notes, then approve.",
  },
  {
    src: '/screenshots/reports.png',
    alt: 'Reports with a period picker, client and project filters, and hours by project split by stage',
    title: 'Reports',
    description:
      'Report on any period by client and project, with a Team table, then print or export to CSV.',
  },
];

export function ScreenshotCarousel() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);
  const [imageErrors, setImageErrors] = useState<Set<number>>(new Set());

  const goToNext = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % screenshots.length);
  }, []);

  const goToPrev = useCallback(() => {
    setCurrentIndex((prev) => (prev - 1 + screenshots.length) % screenshots.length);
  }, []);

  const goToSlide = (index: number) => {
    setCurrentIndex(index);
    setIsAutoPlaying(false);
  };

  // Auto-advance every 5 seconds
  useEffect(() => {
    if (!isAutoPlaying) return;

    const timer = setInterval(goToNext, 5000);
    return () => clearInterval(timer);
  }, [isAutoPlaying, goToNext]);

  // Pause on hover
  const handleMouseEnter = () => setIsAutoPlaying(false);
  const handleMouseLeave = () => setIsAutoPlaying(true);

  const handleImageError = (index: number) => {
    setImageErrors((prev) => new Set(prev).add(index));
  };

  const currentScreenshot = screenshots[currentIndex];
  const hasImageError = imageErrors.has(currentIndex);

  return (
    <div className="relative" onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
      {/* Main carousel */}
      <div className="border-dark-700 bg-dark-900 overflow-hidden rounded-2xl border shadow-2xl">
        {/* Browser chrome */}
        <div className="border-dark-700 bg-dark-800 flex items-center gap-2 border-b px-4 py-3">
          <div className="h-3 w-3 rounded-full bg-red-500/80" />
          <div className="h-3 w-3 rounded-full bg-yellow-500/80" />
          <div className="h-3 w-3 rounded-full bg-green-500/80" />
          <span className="text-dark-400 ml-3 text-sm">gettimm.ie</span>
        </div>

        {/* Screenshot container */}
        <div className="bg-dark-950 relative aspect-video">
          {hasImageError ? (
            // Placeholder when image doesn't exist
            <div className="flex h-full flex-col items-center justify-center p-8">
              <div className="bg-brand/10 mb-4 flex h-20 w-20 items-center justify-center rounded-2xl">
                <svg
                  className="text-brand h-10 w-10"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
              </div>
              <h3 className="mb-2 text-xl font-semibold text-white">{currentScreenshot.title}</h3>
              <p className="text-dark-400 max-w-md text-center">{currentScreenshot.description}</p>
            </div>
          ) : (
            <Image
              src={currentScreenshot.src}
              alt={currentScreenshot.alt}
              fill
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 80vw, 1200px"
              className="object-cover object-top"
              priority
              onError={() => handleImageError(currentIndex)}
            />
          )}

          {/* Navigation arrows */}
          <button
            onClick={goToPrev}
            className="bg-dark-900/80 hover:bg-dark-800 absolute top-1/2 left-4 -translate-y-1/2 rounded-full p-2 transition-colors"
            aria-label="Previous screenshot"
          >
            <ChevronLeftIcon className="h-6 w-6 text-white" />
          </button>
          <button
            onClick={goToNext}
            className="bg-dark-900/80 hover:bg-dark-800 absolute top-1/2 right-4 -translate-y-1/2 rounded-full p-2 transition-colors"
            aria-label="Next screenshot"
          >
            <ChevronRightIcon className="h-6 w-6 text-white" />
          </button>
        </div>

        {/* Caption bar */}
        <div className="border-dark-700 bg-dark-800 border-t px-6 py-4">
          <h3 className="font-semibold text-white">{currentScreenshot.title}</h3>
          <p className="text-dark-400 text-sm">{currentScreenshot.description}</p>
        </div>
      </div>

      {/* Dot indicators */}
      <div className="mt-6 flex justify-center gap-2">
        {screenshots.map((_, index) => (
          <button
            key={index}
            onClick={() => goToSlide(index)}
            className={`h-2 rounded-full transition-all ${
              index === currentIndex ? 'bg-brand w-8' : 'bg-dark-600 hover:bg-dark-500 w-2'
            }`}
            aria-label={`Go to screenshot ${index + 1}`}
          />
        ))}
      </div>

      {/* Thumbnail strip */}
      <div className="mt-6 hidden gap-2 lg:flex">
        {screenshots.map((screenshot, index) => (
          <button
            key={index}
            onClick={() => goToSlide(index)}
            className={`border-dark-700 bg-dark-800 relative flex-1 overflow-hidden rounded-lg border transition-all ${
              index === currentIndex ? 'ring-brand ring-2' : 'opacity-60 hover:opacity-100'
            }`}
          >
            <div className="relative aspect-video">
              {imageErrors.has(index) ? (
                <div className="bg-dark-900 flex h-full items-center justify-center">
                  <span className="text-dark-500 text-xs">{screenshot.title}</span>
                </div>
              ) : (
                <Image
                  src={screenshot.src}
                  alt={screenshot.alt}
                  fill
                  sizes="(max-width: 1024px) 0px, 150px"
                  className="object-cover object-top"
                  onError={() => handleImageError(index)}
                />
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
