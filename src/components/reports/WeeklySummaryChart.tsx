'use client';

import { useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { Card, CardContent, CardHeader } from '@/components/ui';
import { useTimeEntriesStore, useProjectsStore } from '@/hooks';
import { getWeekDays, formatDate, formatTime } from '@/utils';
import { format } from 'date-fns';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

export function WeeklySummaryChart() {
  const { entries, currentWeekStart } = useTimeEntriesStore();
  const { projects } = useProjectsStore();

  const weekDays = getWeekDays(currentWeekStart);

  const chartData = useMemo(() => {
    // Group entries by project and day
    const projectData: Record<string, Record<string, number>> = {};

    entries.forEach((entry) => {
      if (!projectData[entry.projectId]) {
        projectData[entry.projectId] = {};
      }
      const dateKey = entry.date;
      projectData[entry.projectId][dateKey] =
        (projectData[entry.projectId][dateKey] || 0) + entry.hours;
    });

    // Build datasets
    const datasets = Object.keys(projectData).map((projectId) => {
      const project = projects.find((p) => p.id === projectId);
      return {
        label: project?.name || 'Unknown',
        data: weekDays.map((day) => projectData[projectId][formatDate(day)] || 0),
        backgroundColor: project?.color || '#9ca3af',
        borderRadius: 4,
      };
    });

    return {
      labels: weekDays.map((day) => format(day, 'EEE')),
      datasets,
    };
  }, [entries, projects, weekDays]);

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom' as const,
      },
      tooltip: {
        callbacks: {
          label: (context: { dataset: { label: string }; raw: number }) => {
            return `${context.dataset.label}: ${formatTime(context.raw as number)}`;
          },
        },
      },
    },
    scales: {
      x: {
        stacked: true,
        grid: {
          display: false,
        },
      },
      y: {
        stacked: true,
        beginAtZero: true,
        ticks: {
          callback: (value: number) => formatTime(value),
        },
      },
    },
  };

  // Calculate totals by project
  const projectTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    entries.forEach((entry) => {
      totals[entry.projectId] = (totals[entry.projectId] || 0) + entry.hours;
    });
    return Object.entries(totals)
      .map(([projectId, hours]) => ({
        project: projects.find((p) => p.id === projectId),
        hours,
      }))
      .filter((t) => t.project)
      .sort((a, b) => b.hours - a.hours);
  }, [entries, projects]);

  const totalHours = entries.reduce((sum, e) => sum + e.hours, 0);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Chart */}
      <Card variant="bordered" className="lg:col-span-2">
        <CardHeader>
          <h3 className="text-lg font-semibold text-gray-900">
            Hours by Day
          </h3>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            {entries.length > 0 ? (
              <Bar data={chartData} options={options as never} />
            ) : (
              <div className="flex items-center justify-center h-full text-gray-500">
                No data for this week
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Summary */}
      <Card variant="bordered">
        <CardHeader>
          <h3 className="text-lg font-semibold text-gray-900">Summary</h3>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Total */}
            <div className="pb-4 border-b border-gray-200">
              <p className="text-sm text-gray-500">Total Hours</p>
              <p className="text-3xl font-bold text-gray-900">
                {formatTime(totalHours)}
              </p>
            </div>

            {/* By project */}
            <div className="space-y-3">
              <p className="text-sm font-medium text-gray-700">By Project</p>
              {projectTotals.map(({ project, hours }) => (
                <div
                  key={project?.id}
                  className="flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: project?.color }}
                    />
                    <span className="text-sm text-gray-700 truncate">
                      {project?.name}
                    </span>
                  </div>
                  <span className="text-sm font-medium text-gray-900">
                    {formatTime(hours)}
                  </span>
                </div>
              ))}

              {projectTotals.length === 0 && (
                <p className="text-sm text-gray-500">No entries this week</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
