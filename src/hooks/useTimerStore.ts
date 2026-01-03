import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { TimerState } from '@/types';

interface TimerStore extends TimerState {
  startTimer: (projectId: string, taskId: string, notes?: string) => void;
  stopTimer: () => { projectId?: string; taskId?: string; notes?: string; elapsedSeconds: number };
  updateNotes: (notes: string) => void;
  tick: () => void;
  reset: () => void;
}

export const useTimerStore = create<TimerStore>()(
  persist(
    (set, get) => ({
      isRunning: false,
      projectId: undefined,
      taskId: undefined,
      notes: undefined,
      startTime: undefined,
      elapsedSeconds: 0,

      startTimer: (projectId: string, taskId: string, notes?: string) => {
        set({
          isRunning: true,
          projectId,
          taskId,
          notes,
          startTime: new Date().toISOString(),
          elapsedSeconds: 0,
        });
      },

      stopTimer: () => {
        const state = get();
        const result = {
          projectId: state.projectId,
          taskId: state.taskId,
          notes: state.notes,
          elapsedSeconds: state.elapsedSeconds,
        };

        set({
          isRunning: false,
          projectId: undefined,
          taskId: undefined,
          notes: undefined,
          startTime: undefined,
          elapsedSeconds: 0,
        });

        return result;
      },

      updateNotes: (notes: string) => {
        set({ notes });
      },

      tick: () => {
        const state = get();
        if (state.isRunning && state.startTime) {
          const start = new Date(state.startTime);
          const now = new Date();
          const elapsed = Math.floor((now.getTime() - start.getTime()) / 1000);
          set({ elapsedSeconds: elapsed });
        }
      },

      reset: () => {
        set({
          isRunning: false,
          projectId: undefined,
          taskId: undefined,
          notes: undefined,
          startTime: undefined,
          elapsedSeconds: 0,
        });
      },
    }),
    {
      name: 'thyme-timer-storage',
    }
  )
);
