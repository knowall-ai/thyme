import { cn } from '@/utils';
import type { StageHours } from '@/utils';

export interface StageSegment {
  label: string;
  hours: number;
  color: string;
}

// Same colours as the Hours per Week bars; posted is the darker, settled green
export function getStageSegments(stages: Omit<StageHours, 'total'>): StageSegment[] {
  return [
    { label: 'Posted', hours: stages.posted, color: 'bg-thyme-700' },
    { label: 'Approved', hours: stages.approved, color: 'bg-thyme-500' },
    { label: 'Submitted', hours: stages.submitted, color: 'bg-amber-500' },
    { label: 'Unsubmitted', hours: stages.unsubmitted, color: 'bg-amber-500/40' },
  ];
}

export interface StageBarProps {
  segments: StageSegment[];
  /** Hours that fill the whole bar; segments are drawn as a share of it */
  max: number;
  className?: string;
}

/** Stacked bar of hours by timesheet stage */
export function StageBar({ segments, max, className }: StageBarProps) {
  return (
    <div className={cn('bg-dark-600 flex h-1.5 w-full overflow-hidden rounded-full', className)}>
      {segments.map((seg) => (
        <div
          key={seg.label}
          className={cn('h-full transition-all', seg.color)}
          style={{ width: `${max > 0 ? (seg.hours / max) * 100 : 0}%` }}
        />
      ))}
    </div>
  );
}

export interface StageLegendProps {
  segments: StageSegment[];
  formatHours: (hours: number) => string;
  className?: string;
}

/** Colour key for a StageBar, with each stage's hours */
export function StageLegend({ segments, formatHours, className }: StageLegendProps) {
  return (
    <div className={cn('flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-500', className)}>
      {segments.map((seg) => (
        <span key={seg.label} className="flex items-center gap-1">
          <span className={cn('inline-block h-2 w-2 rounded-sm', seg.color)} />
          {seg.label} {formatHours(seg.hours)}
        </span>
      ))}
    </div>
  );
}
