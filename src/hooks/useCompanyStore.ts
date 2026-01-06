import { create } from 'zustand';
import type { BCCompany, BCEnvironmentType } from '@/types';
import { bcClient } from '@/services/bc/bcClient';

interface CompanyStore {
  companies: BCCompany[];
  selectedCompany: BCCompany | null;
  isLoading: boolean;
  error: string | null;

  fetchCompanies: () => Promise<void>;
  selectCompany: (company: BCCompany) => void;
  getCurrentCompanyId: () => string;
  getCompaniesByEnvironment: (env: BCEnvironmentType) => BCCompany[];
  getEnvironments: () => BCEnvironmentType[];
}

export const useCompanyStore = create<CompanyStore>((set, get) => ({
  companies: [],
  selectedCompany: null,
  isLoading: false,
  error: null,

  fetchCompanies: async () => {
    set({ isLoading: true, error: null });
    try {
      // Fetch companies from all environments
      const companies = await bcClient.getAllCompanies();

      // Handle empty companies array
      if (!companies || companies.length === 0) {
        set({
          companies: [],
          selectedCompany: null,
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

      // Fallback: find by ID only, or use first company
      if (!selectedCompany) {
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
        selectedCompany,
        isLoading: false,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch companies';
      set({ error: message, isLoading: false });
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
      set({ selectedCompany: company });
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
