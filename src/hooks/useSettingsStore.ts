import { migrateLegacyStorageKey } from '@/utils/legacyStorage';
import { appStorage } from '@/services/demo/demoStorage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { UserSettings } from '@/types';

const SETTINGS_STORAGE_KEY = 'timmie-settings-storage';

migrateLegacyStorageKey('thyme-settings-storage', SETTINGS_STORAGE_KEY);

interface SettingsStore extends UserSettings {
  updateSettings: (settings: Partial<UserSettings>) => void;
  resetSettings: () => void;
}

const defaultSettings: UserSettings = {
  defaultProjectId: undefined,
  defaultTaskId: undefined,
  weeklyHoursTarget: 40,
  notificationsEnabled: true,
  requireTimesheetComments: false,
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
      name: SETTINGS_STORAGE_KEY,
      // In the demo, this tab's sessionStorage: never a real session's settings
      storage: createJSONStorage(() => appStorage()),
    }
  )
);
