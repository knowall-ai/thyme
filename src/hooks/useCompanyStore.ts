import { create } from 'zustand';
import type { BCCompany, BCEnvironmentType } from '@/types';
import { bcClient } from '@/services/bc/bcClient';

interface CompanyStore {
  companies: BCCompany[];
  selectedCompany: BCCompany | null;
  /** Increments each time company changes - use in effect deps to force refetch */
  companyVersion: number;
  /** True once the company list has loaded successfully at least once */
  companiesLoaded: boolean;
  /** Environments whose companies couldn't be loaded last time (the list may be partial) */
  failedEnvironments: BCEnvironmentType[];
  isLoading: boolean;
  error: string | null;

  fetchCompanies: () => Promise<void>;
  selectCompany: (company: BCCompany) => void;
  getCurrentCompanyId: () => string;
  getCompaniesByEnvironment: (env: BCEnvironmentType) => BCCompany[];
  getEnvironments: () => BCEnvironmentType[];
}

// In-flight company fetch, shared so the company picker and the URL sync don't
// both query every environment at the same time
let companiesRequest: Promise<void> | null = null;

export const useCompanyStore = create<CompanyStore>((set, get) => ({
  companies: [],
  selectedCompany: null,
  companyVersion: 0,
  companiesLoaded: false,
  failedEnvironments: [],
  isLoading: false,
  error: null,

  fetchCompanies: () => {
    if (!companiesRequest) {
      companiesRequest = loadCompanies().finally(() => {
        companiesRequest = null;
      });
    }
    return companiesRequest;

    async function loadCompanies() {
      set({ isLoading: true, error: null });
      try {
        // Fetch companies from all environments
        const { companies, failedEnvironments } = await bcClient.getAllCompanies();

        // Nothing loaded because every request that mattered failed: an error, not "no companies"
        if (companies.length === 0 && failedEnvironments.length > 0) {
          throw new Error(
            `Couldn't load companies from Business Central (${failedEnvironments.join(', ')})`
          );
        }

        // Handle empty companies array
        if (companies.length === 0) {
          set({
            companies: [],
            selectedCompany: null,
            companiesLoaded: true,
            failedEnvironments: [],
            isLoading: false,
          });
          return;
        }

        // Find the currently selected company (match by ID and environment)
        const currentCompanyId = bcClient.companyId;
        const currentEnv = bcClient.environment;
        let selectedCompany = companies.find(
          (c) => c.id === currentCompanyId && c.environment === currentEnv
        );

        // The remembered company's environment didn't load, so we can't tell whether it's
        // still available: keep it (in bcClient) rather than replacing it with a fallback.
        // selectedCompany stays null until a retry finds it.
        const rememberedUnknown =
          !selectedCompany && !!currentCompanyId && failedEnvironments.includes(currentEnv);

        // Fallback: find by ID only, or use first company
        if (!selectedCompany && !rememberedUnknown) {
          selectedCompany = companies.find((c) => c.id === currentCompanyId) || companies[0];
        }

        // Update bcClient if selection changed
        if (selectedCompany && selectedCompany.environment) {
          const needsUpdate =
            selectedCompany.id !== currentCompanyId || selectedCompany.environment !== currentEnv;
          if (needsUpdate) {
            bcClient.setCompany(selectedCompany.id, selectedCompany.environment);
          }
        }

        set({
          companies,
          selectedCompany: selectedCompany ?? null,
          companiesLoaded: true,
          failedEnvironments,
          isLoading: false,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to fetch companies';
        set({ error: message, isLoading: false });
      }
    }
  },

  selectCompany: (company: BCCompany) => {
    const current = get().selectedCompany;
    if (current?.id !== company.id || current?.environment !== company.environment) {
      if (company.environment) {
        bcClient.setCompany(company.id, company.environment);
      } else {
        bcClient.setCompanyId(company.id);
      }
      // Increment version to trigger refetch in all components that depend on it
      set((state) => ({
        selectedCompany: company,
        companyVersion: state.companyVersion + 1,
      }));
    }
  },

  getCurrentCompanyId: () => {
    return bcClient.companyId;
  },

  getCompaniesByEnvironment: (env: BCEnvironmentType) => {
    return get().companies.filter((c) => c.environment === env);
  },

  getEnvironments: () => {
    const envs = new Set(
      get()
        .companies.map((c) => c.environment)
        .filter(Boolean)
    );
    // Return in preferred order: sandbox first, then production
    const order: BCEnvironmentType[] = ['sandbox', 'production'];
    return order.filter((e) => envs.has(e));
  },
}));
