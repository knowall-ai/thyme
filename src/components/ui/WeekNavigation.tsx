'use client';

import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { Button } from './Button';
import { DatePicker } from './DatePicker';
import { formatWeekRange, getWeekStart, isSameDayAs } from '@/utils';

export interface WeekNavigationProps {
  currentWeekStart: Date;
  onPrevious: () => void;
  onNext: () => void;
  onToday: () => void;
  onDateSelect: (date: Date) => void;
}

export function WeekNavigation({
  currentWeekStart,
  onPrevious,
  onNext,
  onToday,
  onDateSelect,
}: WeekNavigationProps) {
  const isCurrentWeek = isSameDayAs(currentWeekStart, getWeekStart(new Date()));

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

      <DatePicker selectedDate={currentWeekStart} onDateSelect={onDateSelect} />

      <h2 className="text-lg font-semibold text-white">{formatWeekRange(currentWeekStart)}</h2>

      {!isCurrentWeek && (
        <Button variant="ghost" size="sm" onClick={onToday}>
          Today
        </Button>
      )}
    </div>
  );
}
