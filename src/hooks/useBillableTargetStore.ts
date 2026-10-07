import { create } from 'zustand';
import { bcClient } from '@/services/bc/bcClient';

/**
 * The company default billable target (Thyme Setup in BC), shared by the Team page,
 * Reports and Settings so a change in Settings shows everywhere.
 */
interface BillableTargetStore {
  /** Company default billable %, or null when not loaded / not available */
  companyDefaultPercent: number | null;
  /** false when the installed Thyme BC Extension has no Thyme Setup API */
  setupAvailable: boolean | null;
  /** companyVersion the default was loaded for (-1 = never) */
  loadedForCompanyVersion: number;
  isLoading: boolean;

  /** Load the default for the current company (no-op if already loaded for it) */
  loadCompanyDefault: (companyVersion: number) => Promise<void>;
  /**
   * Record a default that was just saved to BC for the company at `companyVersion`;
   * ignored if the user has switched company since (the new company loads its own)
   */
  setCompanyDefault: (percent: number, companyVersion: number) => void;
}

// The in-flight load, so components mounting together share one request
let inFlight: { companyVersion: number; promise: Promise<void> } | null = null;

export const useBillableTargetStore = create<BillableTargetStore>((set, get) => ({
  companyDefaultPercent: null,
  setupAvailable: null,
  loadedForCompanyVersion: -1,
  isLoading: false,

  loadCompanyDefault: async (companyVersion) => {
    if (get().loadedForCompanyVersion === companyVersion) return;
    if (inFlight?.companyVersion === companyVersion) return inFlight.promise;

    const promise = (async () => {
      set({ isLoading: true, companyDefaultPercent: null, setupAvailable: null });
      try {
        const setup = await bcClient.getThymeSetup();
        // A company switch while loading makes this result stale
        if (inFlight?.companyVersion !== companyVersion) return;
        set({
          companyDefaultPercent: setup?.defaultBillableTargetPercent ?? null,
          setupAvailable: setup !== null,
          loadedForCompanyVersion: companyVersion,
        });
      } catch (error) {
        if (inFlight?.companyVersion !== companyVersion) return;
        if (process.env.NODE_ENV === 'development') {
          console.error('Failed to load Thyme Setup', error);
        }
        // Leave loadedForCompanyVersion alone so the next mount retries
        set({ companyDefaultPercent: null, setupAvailable: null });
      } finally {
        if (inFlight?.companyVersion === companyVersion) {
          inFlight = null;
          set({ isLoading: false });
        }
      }
    })();
    inFlight = { companyVersion, promise };
    return promise;
  },

  setCompanyDefault: (percent, companyVersion) => {
    if (get().loadedForCompanyVersion !== companyVersion) return;
    set({ companyDefaultPercent: percent, setupAvailable: true });
  },
}));
