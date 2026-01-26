'use client';

import { PlayIcon, StopIcon } from '@heroicons/react/24/solid';
import { Button } from '@/components/ui';
import { useTimer, useProjectsStore } from '@/hooks';
import { useAuth } from '@/services/auth';
import { formatDuration } from '@/utils';

interface TimerDisplayProps {
  onStartTimer: () => void;
}

export function TimerDisplay({ onStartTimer }: TimerDisplayProps) {
  const { account } = useAuth();
  const userId = account?.localAccountId || '';

  const timer = useTimer(userId);
  const { projects } = useProjectsStore();

  const currentProject = projects.find((p) => p.id === timer.projectId);
  const currentTask = currentProject?.tasks.find((t) => t.id === timer.taskId);

  const handleStop = async () => {
    await timer.stop();
  };

  if (!timer.isRunning) {
    return (
      <Button
        onClick={onStartTimer}
        size="lg"
        className="animate-glow shadow-knowall-green/30 hover:shadow-knowall-green/50 h-14 w-14 rounded-full shadow-lg transition-shadow"
      >
        <PlayIcon className="h-8 w-8" />
        <span className="sr-only">Start timer</span>
      </Button>
    );
  }

  return (
    <div className="border-dark-700 bg-dark-800 flex flex-col gap-3 rounded-xl border p-4 shadow-lg sm:flex-row sm:items-center sm:gap-4">
      {/* Timer Info */}
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-2">
          {currentProject && (
            <div
              className="h-3 w-3 shrink-0 rounded-full"
              style={{ backgroundColor: currentProject.color }}
            />
          )}
          <span className="truncate font-medium text-white">
            {currentProject?.name || 'Unknown Project'}
          </span>
        </div>
        <p className="text-dark-400 truncate text-sm">{currentTask?.name || 'Unknown Task'}</p>
        {timer.notes && <p className="text-dark-500 truncate text-sm">{timer.notes}</p>}
      </div>

      {/* Timer Display and Stop Button */}
      <div className="flex items-center justify-between gap-4 sm:justify-end">
        <div className="text-knowall-green font-mono text-2xl font-bold tabular-nums">
          {formatDuration(timer.elapsedSeconds)}
        </div>

        {/* Stop Button */}
        <Button onClick={handleStop} variant="danger" size="icon" className="rounded-full">
          <StopIcon className="h-5 w-5" />
          <span className="sr-only">Stop timer</span>
        </Button>
      </div>
    </div>
  );
}
