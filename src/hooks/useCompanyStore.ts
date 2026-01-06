import { create } from 'zustand';
import type { BCCompany } from '@/types';
import { bcClient } from '@/services/bc/bcClient';

interface CompanyStore {
  companies: BCCompany[];
  selectedCompany: BCCompany | null;
  isLoading: boolean;
  error: string | null;

  fetchCompanies: () => Promise<void>;
  selectCompany: (company: BCCompany) => void;
  getCurrentCompanyId: () => string;
}

export const useCompanyStore = create<CompanyStore>((set, get) => ({
  companies: [],
  selectedCompany: null,
  isLoading: false,
  error: null,

  fetchCompanies: async () => {
    set({ isLoading: true, error: null });
    try {
      const companies = await bcClient.getCompanies();

      // Find the currently selected company
      const currentCompanyId = bcClient.companyId;
      const selectedCompany = companies.find((c) => c.id === currentCompanyId) || companies[0];

      // If we found a company and it's different from stored, update it
      if (selectedCompany && selectedCompany.id !== currentCompanyId) {
        bcClient.setCompanyId(selectedCompany.id);
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
    if (current?.id !== company.id) {
      bcClient.setCompanyId(company.id);
      set({ selectedCompany: company });
      // Note: Components should listen for company changes and reload data
    }
  },

  getCurrentCompanyId: () => {
    return bcClient.companyId;
  },
}));
