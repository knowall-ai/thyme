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

export interface TeamConfig {
  /** Utilization percentage thresholds and colors */
  utilization: MetricConfig;
  /** Billable percentage thresholds and colors */
  billable: MetricConfig;
  /** Default weekly capacity in hours per team member */
  defaultCapacity: number;
}

/**
 * Default team configuration.
 * TODO: Load from user settings/API when settings page is implemented.
 */
export const teamConfig: TeamConfig = {
  utilization: {
    thresholds: {
      low: 20, // Below 20% is red
      high: 80, // Above 80% is green, 20-80% is amber
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
  defaultCapacity: 40, // 40 hours per week
};

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
 * Get the appropriate color class for a utilization percentage.
 */
export function getUtilizationColor(utilization: number): string {
  return getMetricColor(utilization, teamConfig.utilization);
}

/**
 * Get the appropriate color class for a billable percentage.
 */
export function getBillableColor(billablePercent: number): string {
  return getMetricColor(billablePercent, teamConfig.billable);
}
