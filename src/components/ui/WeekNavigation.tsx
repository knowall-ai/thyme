'use client';

import { addWeeks, endOfWeek, format } from 'date-fns';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { Button } from './Button';
import { DatePicker } from './DatePicker';
import {
  formatWeekRange,
  getWeekStart,
  isSameDayAs,
  DATE_FORMAT_FULL,
  DATE_FORMAT_SHORT,
} from '@/utils';

export interface WeekNavigationProps {
  currentWeekStart: Date;
  onPrevious: () => void;
  onNext: () => void;
  onToday: () => void;
  onDateSelect: (date: Date) => void;
  /** Number of weeks being displayed (default: 1) */
  weeksToShow?: number;
  /** Always show Today button even when on current week (default: false) */
  alwaysShowToday?: boolean;
}

/**
 * Format a date range spanning multiple weeks
 */
function formatMultiWeekRange(startDate: Date, weeksToShow: number): string {
  const endDate = endOfWeek(addWeeks(startDate, weeksToShow - 1), { weekStartsOn: 1 });
  const startMonth = format(startDate, 'MMM');
  const endMonth = format(endDate, 'MMM');

  if (startMonth === endMonth) {
    return `${format(startDate, 'd')} - ${format(endDate, DATE_FORMAT_FULL)}`;
  }
  return `${format(startDate, DATE_FORMAT_SHORT)} - ${format(endDate, DATE_FORMAT_FULL)}`;
}

export function WeekNavigation({
  currentWeekStart,
  onPrevious,
  onNext,
  onToday,
  onDateSelect,
  weeksToShow = 1,
  alwaysShowToday = false,
}: WeekNavigationProps) {
  const isCurrentWeek = isSameDayAs(currentWeekStart, getWeekStart(new Date()));
  const showTodayButton = alwaysShowToday || !isCurrentWeek;

  const dateRangeLabel =
    weeksToShow > 1
      ? formatMultiWeekRange(currentWeekStart, weeksToShow)
      : formatWeekRange(currentWeekStart);

  return (
    <div className="flex items-center gap-4">
      <div className="flex items-center gap-1">
        <Button variant="outline" size="icon" onClick={onPrevious}>
          <ChevronLeftIcon className="h-5 w-5" />
          <span className="sr-only">Previous week</span>
        </Button>
        <Button variant="outline" size="icon" onClick={onNext}>
          <ChevronRightIcon className="h-5 w-5" />
          <span className="sr-only">Next week</span>
        </Button>
      </div>

      <DatePicker selectedDate={currentWeekStart} onDateSelect={onDateSelect} iconOnly />

      <h2 className="text-lg font-semibold text-white">{dateRangeLabel}</h2>

      {showTodayButton && (
        <Button variant="ghost" size="sm" onClick={onToday}>
          Today
        </Button>
      )}
    </div>
  );
}
