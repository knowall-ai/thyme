'use client';

import { useState, useRef, useEffect } from 'react';
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
  startOfWeek,
  endOfWeek,
} from 'date-fns';
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { cn } from '@/utils';
import { Button } from './Button';

export interface DatePickerProps {
  selectedDate?: Date;
  onDateSelect: (date: Date) => void;
  className?: string;
  /** Show only the calendar icon without date text */
  iconOnly?: boolean;
}

export function DatePicker({
  selectedDate,
  onDateSelect,
  className,
  iconOnly = false,
}: DatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [viewDate, setViewDate] = useState(selectedDate || new Date());
  const containerRef = useRef<HTMLDivElement>(null);

  // Keep viewDate in sync with external selectedDate changes
  useEffect(() => {
    if (selectedDate) {
      setViewDate(selectedDate);
    }
  }, [selectedDate]);

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Close on escape key
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen]);

  const monthStart = startOfMonth(viewDate);
  const monthEnd = endOfMonth(viewDate);

  // Get all days to display (including padding days from prev/next months)
  // Week starts on Monday (weekStartsOn: 1)
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  const handleDateClick = (date: Date) => {
    onDateSelect(date);
    setIsOpen(false);
  };

  const handlePrevMonth = () => {
    setViewDate(subMonths(viewDate, 1));
  };

  const handleNextMonth = () => {
    setViewDate(addMonths(viewDate, 1));
  };

  const today = new Date();

  const handleTodayClick = () => {
    setViewDate(today);
    onDateSelect(today);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Open date picker"
        aria-expanded={isOpen}
        className={cn(
          'border-dark-600 bg-dark-700 flex h-10 items-center gap-2 rounded-lg border text-sm transition-colors',
          'hover:border-dark-500 focus:border-thyme-500 focus:ring-thyme-500 focus:ring-1 focus:outline-none',
          iconOnly ? 'w-10 justify-center' : 'w-full px-3',
          selectedDate ? 'text-white' : 'text-dark-400'
        )}
      >
        <CalendarIcon className="text-dark-400 h-4 w-4 shrink-0" />
        {!iconOnly && (
          <span className="truncate">
            {selectedDate ? format(selectedDate, 'd MMM yyyy') : 'Select date'}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          className="border-dark-600 bg-dark-800 absolute top-full left-0 z-50 mt-2 w-72 rounded-lg border p-3 shadow-xl"
          role="dialog"
          aria-modal="true"
          aria-label="Date picker"
        >
          {/* Month/Year Header */}
          <div className="mb-3 flex items-center justify-between">
            <Button
              variant="ghost"
              size="icon"
              onClick={handlePrevMonth}
              className="h-8 w-8"
              aria-label="Previous month"
            >
              <ChevronLeftIcon className="h-4 w-4" />
            </Button>
            <span className="text-sm font-semibold text-white">
              {format(viewDate, 'MMMM yyyy')}
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleNextMonth}
              className="h-8 w-8"
              aria-label="Next month"
            >
              <ChevronRightIcon className="h-4 w-4" />
            </Button>
          </div>

          {/* Day of Week Headers */}
          <div className="mb-1 grid grid-cols-7 gap-1" role="row">
            {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((day) => (
              <div
                key={day}
                role="columnheader"
                className="text-dark-400 py-1 text-center text-xs font-medium uppercase"
              >
                {day}
              </div>
            ))}
          </div>

          {/* Calendar Grid */}
          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map((day) => {
              const isCurrentMonth = isSameMonth(day, viewDate);
              const isSelected = selectedDate && isSameDay(day, selectedDate);
              const isToday = isSameDay(day, today);

              return (
                <button
                  key={day.toISOString()}
                  onClick={() => handleDateClick(day)}
                  aria-label={format(day, 'EEEE, MMMM d, yyyy')}
                  aria-selected={isSelected || undefined}
                  className={cn(
                    'h-8 w-8 rounded text-sm transition-colors',
                    'hover:bg-dark-700 focus-visible:ring-knowall-green focus-visible:ring-offset-dark-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
                    !isCurrentMonth && 'text-dark-500',
                    isCurrentMonth && !isSelected && 'text-dark-200',
                    isToday && !isSelected && 'text-knowall-green font-semibold',
                    isSelected && 'bg-knowall-green text-dark-950 hover:bg-knowall-green-light'
                  )}
                >
                  {format(day, 'd')}
                </button>
              );
            })}
          </div>

          {/* Today Button */}
          <div className="border-dark-700 mt-3 border-t pt-3">
            <Button variant="ghost" size="sm" onClick={handleTodayClick} className="w-full">
              Today
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
