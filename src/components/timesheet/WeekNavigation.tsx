'use client';

import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { Button } from '@/components/ui';
import { formatWeekRange, getWeekStart, isSameDayAs } from '@/utils';

interface WeekNavigationProps {
  currentWeekStart: Date;
  onPrevious: () => void;
  onNext: () => void;
  onToday: () => void;
}

export function WeekNavigation({
  currentWeekStart,
  onPrevious,
  onNext,
  onToday,
}: WeekNavigationProps) {
  const isCurrentWeek = isSameDayAs(currentWeekStart, getWeekStart(new Date()));

  return (
    <div className="flex items-center gap-4">
      <div className="flex items-center gap-1">
        <Button variant="outline" size="icon" onClick={onPrevious}>
          <ChevronLeftIcon className="w-5 h-5" />
          <span className="sr-only">Previous week</span>
        </Button>
        <Button variant="outline" size="icon" onClick={onNext}>
          <ChevronRightIcon className="w-5 h-5" />
          <span className="sr-only">Next week</span>
        </Button>
      </div>

      <h2 className="text-lg font-semibold text-white">
        {formatWeekRange(currentWeekStart)}
      </h2>

      {!isCurrentWeek && (
        <Button variant="ghost" size="sm" onClick={onToday}>
          Today
        </Button>
      )}
    </div>
  );
}
