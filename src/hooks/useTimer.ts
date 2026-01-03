import { useEffect, useCallback } from 'react';
import { useTimerStore } from './useTimerStore';
import { useTimeEntriesStore } from './useTimeEntriesStore';
import { useProjectsStore } from './useProjectsStore';
import { formatDate, secondsToHours } from '@/utils';

export function useTimer(userId: string) {
  const timer = useTimerStore();
  const addEntry = useTimeEntriesStore((state) => state.addEntry);
  const projects = useProjectsStore((state) => state.projects);

  // Tick interval for updating elapsed time
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    if (timer.isRunning) {
      interval = setInterval(() => {
        timer.tick();
      }, 1000);
    }

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [timer.isRunning, timer.tick]);

  const start = useCallback(
    (projectId: string, taskId: string, notes?: string) => {
      if (timer.isRunning) {
        // Stop current timer first
        stop();
      }
      timer.startTimer(projectId, taskId, notes);
    },
    [timer]
  );

  const stop = useCallback(async () => {
    if (!timer.isRunning) return null;

    const { projectId, taskId, notes, elapsedSeconds } = timer.stopTimer();

    if (!projectId || !taskId || elapsedSeconds < 60) {
      // Don't save entries less than 1 minute
      return null;
    }

    const project = projects.find((p) => p.id === projectId);
    const task = project?.tasks.find((t) => t.id === taskId);

    if (!project || !task) return null;

    // Create time entry from timer
    const entry = await addEntry({
      projectId,
      taskId,
      userId,
      date: formatDate(new Date()),
      hours: Number(secondsToHours(elapsedSeconds).toFixed(2)),
      notes,
      isBillable: task.isBillable,
      isRunning: false,
    });

    return entry;
  }, [timer, addEntry, projects, userId]);

  const updateNotes = useCallback(
    (notes: string) => {
      timer.updateNotes(notes);
    },
    [timer]
  );

  return {
    isRunning: timer.isRunning,
    projectId: timer.projectId,
    taskId: timer.taskId,
    notes: timer.notes,
    elapsedSeconds: timer.elapsedSeconds,
    start,
    stop,
    updateNotes,
  };
}
