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
    const entry = await timer.stop();
    if (entry) {
      console.log('Timer stopped, entry created:', entry);
    }
  };

  if (!timer.isRunning) {
    return (
      <Button
        onClick={onStartTimer}
        size="lg"
        className="w-14 h-14 rounded-full shadow-lg shadow-knowall-green/30 hover:shadow-knowall-green/50 transition-shadow animate-glow"
      >
        <PlayIcon className="w-6 h-6" />
        <span className="sr-only">Start timer</span>
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-4 bg-dark-800 rounded-xl shadow-lg p-4 border border-dark-700">
      {/* Timer Info */}
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-1">
          {currentProject && (
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: currentProject.color }}
            />
          )}
          <span className="font-medium text-white">
            {currentProject?.name || 'Unknown Project'}
          </span>
        </div>
        <p className="text-sm text-dark-400">
          {currentTask?.name || 'Unknown Task'}
        </p>
        {timer.notes && (
          <p className="text-sm text-dark-500 truncate">{timer.notes}</p>
        )}
      </div>

      {/* Timer Display */}
      <div className="text-2xl font-mono font-bold text-knowall-green tabular-nums">
        {formatDuration(timer.elapsedSeconds)}
      </div>

      {/* Stop Button */}
      <Button
        onClick={handleStop}
        variant="danger"
        size="icon"
        className="rounded-full"
      >
        <StopIcon className="w-5 h-5" />
        <span className="sr-only">Stop timer</span>
      </Button>
    </div>
  );
}
