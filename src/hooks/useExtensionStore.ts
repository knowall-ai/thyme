import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const MODAL_DISMISSED_KEY = 'thyme_extension_preview_modal_dismissed';

interface ExtensionStore {
  /** null = not checked yet, true = installed, false = not installed */
  isInstalled: boolean | null;
  /** Whether we're currently checking extension status */
  isChecking: boolean;
  /** Whether the user has dismissed the preview modal with "don't show again" */
  modalDismissed: boolean;

  /** Set extension installation status */
  setIsInstalled: (isInstalled: boolean | null) => void;
  /** Set checking state */
  setIsChecking: (isChecking: boolean) => void;
  /** Dismiss modal (optionally with "don't show again") */
  dismissModal: (dontShowAgain: boolean) => void;
  /** Reset modal dismissed state */
  resetModalDismissed: () => void;
  /** Reset all state (useful when company changes) */
  reset: () => void;
}

export const useExtensionStore = create<ExtensionStore>()(
  persist(
    (set) => ({
      isInstalled: null,
      isChecking: false,
      modalDismissed: false,

      setIsInstalled: (isInstalled) => set({ isInstalled }),

      setIsChecking: (isChecking) => set({ isChecking }),

      dismissModal: (dontShowAgain) => {
        if (dontShowAgain) {
          // Persist to localStorage for permanent dismissal
          localStorage.setItem(MODAL_DISMISSED_KEY, 'true');
        }
        set({ modalDismissed: true });
      },

      resetModalDismissed: () => {
        localStorage.removeItem(MODAL_DISMISSED_KEY);
        set({ modalDismissed: false });
      },

      reset: () => {
        // Check localStorage for persisted dismissal
        const persisted = localStorage.getItem(MODAL_DISMISSED_KEY) === 'true';
        set({
          isInstalled: null,
          isChecking: false,
          modalDismissed: persisted,
        });
      },
    }),
    {
      name: 'thyme-extension-store',
      // Only persist modalDismissed, not the runtime state
      partialize: (state) => ({ modalDismissed: state.modalDismissed }),
      // Hydrate from localStorage on load
      onRehydrateStorage: () => (state) => {
        if (state) {
          // Also check the explicit localStorage key
          const persisted = localStorage.getItem(MODAL_DISMISSED_KEY) === 'true';
          if (persisted && !state.modalDismissed) {
            state.modalDismissed = true;
          }
        }
      },
    }
  )
);
