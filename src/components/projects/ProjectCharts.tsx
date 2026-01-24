'use client';

import { useState } from 'react';
import { useProjectDetailsStore } from '@/hooks/useProjectDetailsStore';
import { Card } from '@/components/ui';
import { cn } from '@/utils';

type ChartView = 'weekly' | 'progress';

export function ProjectCharts() {
  const { analytics, isLoadingAnalytics } = useProjectDetailsStore();
  const [chartView, setChartView] = useState<ChartView>('weekly');

  if (isLoadingAnalytics) {
    return (
      <Card variant="bordered" className="p-6">
        <div className="h-64 animate-pulse rounded bg-dark-600" />
      </Card>
    );
  }

  const weeklyData = analytics?.weeklyData ?? [];
  const maxHours = Math.max(...weeklyData.map((d) => d.hours), 1);

  return (
    <Card variant="bordered" className="p-6">
      {/* Toggle buttons */}
      <div className="mb-6 flex gap-2">
        <button
          onClick={() => setChartView('weekly')}
          className={cn(
            'rounded-lg px-4 py-2 text-sm font-medium transition-colors',
            chartView === 'weekly'
              ? 'bg-thyme-600 text-white'
              : 'bg-dark-600 text-gray-400 hover:text-white'
          )}
        >
          Hours per Week
        </button>
        <button
          onClick={() => setChartView('progress')}
          className={cn(
            'rounded-lg px-4 py-2 text-sm font-medium transition-colors',
            chartView === 'progress'
              ? 'bg-thyme-600 text-white'
              : 'bg-dark-600 text-gray-400 hover:text-white'
          )}
        >
          Project Progress
        </button>
      </div>

      {/* Chart area */}
      {weeklyData.length === 0 ? (
        <div className="flex h-64 items-center justify-center">
          <p className="text-gray-500">No time data available for this project</p>
        </div>
      ) : chartView === 'weekly' ? (
        <WeeklyBarChart data={weeklyData} maxHours={maxHours} />
      ) : (
        <ProgressLineChart data={weeklyData} />
      )}
    </Card>
  );
}

interface WeeklyDataPoint {
  week: string;
  hours: number;
  cumulative: number;
}

function WeeklyBarChart({ data, maxHours }: { data: WeeklyDataPoint[]; maxHours: number }) {
  // Show last 12 weeks maximum
  const displayData = data.slice(-12);

  return (
    <div className="h-64">
      <div className="flex h-full items-end gap-2">
        {displayData.map((point) => {
          const heightPercent = (point.hours / maxHours) * 100;
          return (
            <div key={point.week} className="flex flex-1 flex-col items-center gap-2">
              <div className="relative flex w-full flex-1 items-end justify-center">
                <div
                  className="w-full max-w-8 rounded-t bg-thyme-500 transition-all hover:bg-thyme-400"
                  style={{ height: `${heightPercent}%`, minHeight: point.hours > 0 ? '4px' : '0' }}
                  title={`${point.hours.toFixed(1)} hours`}
                />
              </div>
              <span className="whitespace-nowrap text-xs text-gray-500">
                {formatWeekLabel(point.week)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ProgressLineChart({ data }: { data: WeeklyDataPoint[] }) {
  if (data.length === 0) return null;

  const maxCumulative = Math.max(...data.map((d) => d.cumulative), 1);
  const displayData = data.slice(-12);

  // Calculate SVG path
  const width = 100;
  const height = 60;
  const points = displayData.map((d, i) => {
    const x = (i / (displayData.length - 1 || 1)) * width;
    const y = height - (d.cumulative / maxCumulative) * height;
    return `${x},${y}`;
  });

  const pathD = `M ${points.join(' L ')}`;
  const areaD = `${pathD} L ${width},${height} L 0,${height} Z`;

  return (
    <div className="h-64">
      <div className="flex h-full flex-col">
        <div className="relative flex-1 overflow-hidden">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="h-full w-full"
            preserveAspectRatio="xMidYMid meet"
          >
            {/* Grid lines */}
            {[0.25, 0.5, 0.75].map((ratio) => (
              <line
                key={ratio}
                x1="0"
                y1={height * ratio}
                x2={width}
                y2={height * ratio}
                stroke="currentColor"
                className="text-dark-600"
                strokeWidth="0.5"
              />
            ))}
            {/* Area fill */}
            <path d={areaD} fill="currentColor" className="text-thyme-500/20" />
            {/* Line */}
            <path
              d={pathD}
              fill="none"
              stroke="currentColor"
              className="text-thyme-500"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />
            {/* Points */}
            {displayData.map((d, i) => {
              const x = (i / (displayData.length - 1 || 1)) * width;
              const y = height - (d.cumulative / maxCumulative) * height;
              return (
                <circle
                  key={d.week}
                  cx={x}
                  cy={y}
                  r="1.5"
                  fill="currentColor"
                  className="text-thyme-500"
                >
                  <title>{`${d.cumulative.toFixed(1)} total hours`}</title>
                </circle>
              );
            })}
          </svg>
        </div>
        {/* X-axis labels */}
        <div className="mt-2 flex justify-between">
          {displayData.length > 0 && (
            <>
              <span className="text-xs text-gray-500">{formatWeekLabel(displayData[0].week)}</span>
              <span className="text-xs text-gray-500">
                {formatWeekLabel(displayData[displayData.length - 1].week)}
              </span>
            </>
          )}
        </div>
        {/* Total */}
        <div className="mt-2 text-center">
          <span className="text-sm text-gray-400">
            Total: <span className="font-medium text-white">{maxCumulative.toFixed(1)} hours</span>
          </span>
        </div>
      </div>
    </div>
  );
}

function formatWeekLabel(weekString: string): string {
  // weekString is in format "2024-W01"
  const match = weekString.match(/(\d{4})-W(\d{2})/);
  if (!match) return weekString;
  const [, year, week] = match;
  // Show just the week number for brevity, or month abbreviation
  return `W${parseInt(week)}`;
}
