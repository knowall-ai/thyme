import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BCCompany } from '@/types';

const getAllCompanies = vi.fn();
const setCompany = vi.fn();

vi.mock('@/services/bc/bcClient', () => ({
  bcClient: {
    companyId: '00000000-0000-0000-0000-000000000001',
    environment: 'production',
    getAllCompanies: (...args: unknown[]) => getAllCompanies(...args),
    setCompany: (...args: unknown[]) => setCompany(...args),
    setCompanyId: vi.fn(),
  },
}));

import { confirmDiscardRunningTimer, switchCompany } from '@/hooks/companySwitch';
import { useCompanyStore } from '@/hooks/useCompanyStore';
import { useProjectDetailsStore } from '@/hooks/useProjectDetailsStore';
import { useProjectsStore } from '@/hooks/useProjectsStore';
import { useTeammateStore } from '@/hooks/useTeammateStore';
import { useTimerStore } from '@/hooks/useTimerStore';

const contoso: BCCompany = {
  id: '00000000-0000-0000-0000-000000000001',
  name: 'Contoso',
  displayName: 'Contoso',
  environment: 'production',
};
const contosoSandbox: BCCompany = { ...contoso, environment: 'sandbox' };

describe('switchCompany', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCompanyStore.setState({ selectedCompany: contoso, companyVersion: 0 });
    useProjectsStore.setState({ projects: [{ id: 'p1' } as never] });
    useProjectDetailsStore.setState({ project: { code: 'PR00100' } as never });
    useTeammateStore.setState({ selectedTeammate: { id: 't1' } as never });
  });

  it('selects the company and clears the previous company data', () => {
    // Same GUID in another environment is a different company
    switchCompany(contosoSandbox);

    expect(setCompany).toHaveBeenCalledWith(contoso.id, 'sandbox');
    expect(useCompanyStore.getState().selectedCompany).toBe(contosoSandbox);
    expect(useCompanyStore.getState().companyVersion).toBe(1);
    expect(useProjectsStore.getState().projects).toEqual([]);
    expect(useProjectDetailsStore.getState().project).toBeNull();
    expect(useTeammateStore.getState().selectedTeammate).toBeNull();
  });

  it('does nothing when the company is already active', () => {
    switchCompany({ ...contoso });

    expect(setCompany).not.toHaveBeenCalled();
    expect(useCompanyStore.getState().companyVersion).toBe(0);
    expect(useProjectsStore.getState().projects).toHaveLength(1);
  });
});

describe('confirmDiscardRunningTimer', () => {
  beforeEach(() => {
    useTimerStore.getState().reset();
  });

  it('allows the switch when no timer is running', () => {
    const confirmSpy = vi.spyOn(window, 'confirm');
    expect(confirmDiscardRunningTimer()).toBe(true);
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it('asks first, and keeps the timer if the user says no', () => {
    useTimerStore.getState().startTimer('p1', 't1');
    vi.spyOn(window, 'confirm').mockReturnValueOnce(false);
    expect(confirmDiscardRunningTimer()).toBe(false);
    expect(useTimerStore.getState().isRunning).toBe(true);

    vi.spyOn(window, 'confirm').mockReturnValueOnce(true);
    expect(confirmDiscardRunningTimer()).toBe(true);
    expect(useTimerStore.getState().isRunning).toBe(false);
  });
});

describe('useCompanyStore.fetchCompanies', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCompanyStore.setState({ companies: [], selectedCompany: null, companiesLoaded: false });
  });

  it('shares one request between concurrent callers and marks the list loaded', async () => {
    getAllCompanies.mockResolvedValue([contoso, contosoSandbox]);

    await Promise.all([
      useCompanyStore.getState().fetchCompanies(),
      useCompanyStore.getState().fetchCompanies(),
    ]);

    expect(getAllCompanies).toHaveBeenCalledTimes(1);
    expect(useCompanyStore.getState().companiesLoaded).toBe(true);
    expect(useCompanyStore.getState().selectedCompany).toBe(contoso);
  });

  it('stays not-loaded when the request fails', async () => {
    getAllCompanies.mockRejectedValue(new Error('Network down'));

    await useCompanyStore.getState().fetchCompanies();

    expect(useCompanyStore.getState().companiesLoaded).toBe(false);
    expect(useCompanyStore.getState().error).toBe('Network down');
  });
});
