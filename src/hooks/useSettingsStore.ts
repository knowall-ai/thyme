import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { UserSettings } from '@/types';

interface SettingsStore extends UserSettings {
  updateSettings: (settings: Partial<UserSettings>) => void;
  resetSettings: () => void;
}

const defaultSettings: UserSettings = {
  defaultProjectId: undefined,
  defaultTaskId: undefined,
  weeklyHoursTarget: 40,
  notificationsEnabled: true,
  theme: 'system',
};

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      ...defaultSettings,

      updateSettings: (settings: Partial<UserSettings>) => {
        set((state) => ({ ...state, ...settings }));
      },

      resetSettings: () => {
        set(defaultSettings);
      },
    }),
    {
      name: 'thyme-settings-storage',
    }
  )
);
