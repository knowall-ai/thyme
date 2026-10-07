/**
 * Team page configuration settings.
 * These can eventually be made configurable via Settings.
 */

export interface ThresholdConfig {
  /** Below this percentage shows as low */
  low: number;
  /** Above this percentage shows as high, between low and high shows as medium */
  high: number;
}

export interface ColorConfig {
  /** Color class for low values (under low threshold) */
  low: string;
  /** Color class for medium values (between thresholds) */
  medium: string;
  /** Color class for high values (above high threshold) */
  high: string;
}

export interface MetricConfig {
  thresholds: ThresholdConfig;
  colors: ColorConfig;
}

/** How close someone's billable % must be to their target for each colour */
export interface BillableTargetBands {
  /** At or above target, or short of it by up to this many points: on target (green) */
  onTarget: number;
  /** Short of target by up to this many points: near target (amber); further: off target (red) */
  nearTarget: number;
}

export interface TeamConfig {
  /**
   * Timesheet completion: hours logged ÷ capacity. Everyone is expected to log their
   * full capacity, so 100% is the goal whatever their billable target.
   */
  timesheetCompletion: MetricConfig;
  /** Billable percentage thresholds and colors, used when billable targets aren't available */
  billable: MetricConfig;
  /** Billable % against each person's billable target */
  billableTarget: {
    bands: BillableTargetBands;
    /** Used if BC doesn't return a company default (thymeSetup) */
    fallbackDefaultPercent: number;
  };
  /** Default weekly capacity in hours per team member */
  defaultCapacity: number;
}

/**
 * Default team configuration.
 * TODO: Load from user settings/API when settings page is implemented.
 */
export const teamConfig: TeamConfig = {
  timesheetCompletion: {
    thresholds: {
      low: 70, // Below 70% of capacity logged is red (timesheet well short)
      high: 95, // 95%+ is green (timesheet complete), 70-95% is amber
    },
    colors: {
      low: 'bg-red-500',
      medium: 'bg-yellow-500',
      high: 'bg-knowall-green',
    },
  },
  billable: {
    thresholds: {
      low: 50, // Below 50% is low
      high: 70, // Above 70% is high, 50-70% is medium
    },
    colors: {
      low: 'bg-slate-500/20 text-slate-400',
      medium: 'bg-yellow-500/20 text-yellow-400',
      high: 'bg-green-500/20 text-green-400',
    },
  },
  billableTarget: {
    bands: {
      onTarget: 5, // Within 5 points of target (or over it) is green
      nearTarget: 15, // Within 15 points is amber, further below is red
    },
    fallbackDefaultPercent: 75,
  },
  defaultCapacity: 40, // Fallback hours per week, only when BC has no unit-of-measure data for a person
};

/** User-facing explanation of timesheet completion, shown as a tooltip */
export const TIMESHEET_COMPLETION_DESCRIPTION =
  'Hours logged ÷ capacity for the week. Everyone is expected to log their full capacity, so 100% means the timesheet is complete.';

/**
 * Get the appropriate color class for a metric percentage.
 */
function getMetricColor(value: number, config: MetricConfig): string {
  const { thresholds, colors } = config;

  if (value >= thresholds.high) {
    return colors.high;
  } else if (value >= thresholds.low) {
    return colors.medium;
  }
  return colors.low;
}

/**
 * Get the appropriate color class for a timesheet completion percentage.
 */
export function getTimesheetCompletionColor(completion: number): string {
  return getMetricColor(completion, teamConfig.timesheetCompletion);
}

/**
 * Get the appropriate color class for a billable percentage (no target known).
 */
export function getBillableColor(billablePercent: number): string {
  return getMetricColor(billablePercent, teamConfig.billable);
}
