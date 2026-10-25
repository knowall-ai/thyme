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
    { label: 'Posted', hours: stages.posted, color: 'bg-timmie-700' },
    { label: 'Approved', hours: stages.approved, color: 'bg-timmie-500' },
    { label: 'Submitted', hours: stages.submitted, color: 'bg-amber-500' },
    { label: 'Unsubmitted', hours: stages.unsubmitted, color: 'bg-amber-500/40' },
  ];
}

/** Hours by stage in words, for a tooltip or screen readers, e.g. "Posted 1.0h · ..." */
export function getStageSummary(
  stages: Omit<StageHours, 'total'>,
  formatHours: (hours: number) => string = (hours) => `${hours.toFixed(1)}h`
): string {
  return getStageSegments(stages)
    .map((seg) => `${seg.label} ${formatHours(seg.hours)}`)
    .join(' · ');
}

// Hours closer than this are the same (floating-point rounding, far below a minute)
const HOURS_EPSILON = 1e-6;

export interface StageBarProps {
  segments: StageSegment[];
  /** Hours that fill the whole bar; segments are drawn as a share of it */
  max: number;
  /**
   * The estimate, in hours: when the hours have gone past it, a white line marks where
   * (none when they haven't, as the bar then ends at the estimate anyway)
   */
  estimate?: number;
  className?: string;
}

/** Stacked bar of hours by timesheet stage */
export function StageBar({ segments, max, estimate, className }: StageBarProps) {
  const total = segments.reduce((sum, seg) => sum + seg.hours, 0);
  // Past the estimate by more than rounding (0.1 + 0.2 hours sums a hair over 0.3)
  const overEstimate =
    estimate !== undefined && estimate > 0 && total - estimate > HOURS_EPSILON && max > 0;
  // With a marker, className goes on the box around the bar (it may set width or
  // margins), so the bar fills it and the marker can stand out above and below
  const bar = (
    <div
      className={cn(
        'bg-dark-600 flex h-1.5 w-full overflow-hidden rounded-full',
        !overEstimate && className
      )}
    >
      {segments.map((seg) => (
        <div
          key={seg.label}
          className={cn('h-full transition-all', seg.color)}
          style={{ width: `${max > 0 ? (seg.hours / max) * 100 : 0}%` }}
        />
      ))}
    </div>
  );
  if (!overEstimate) return bar;
  return (
    <div className={cn('relative', className)}>
      {bar}
      <div
        className="absolute -top-1 -bottom-1 w-0.5 -translate-x-1/2 rounded-full bg-white shadow-[0_0_2px_rgba(0,0,0,0.8)]"
        style={{ left: `${(Math.min(estimate, max) / max) * 100}%` }}
        title={`Estimate: ${estimate.toFixed(1)}h`}
        aria-hidden="true"
        data-testid="estimate-marker"
      />
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
