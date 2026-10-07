import { describe, it, expect, vi, beforeEach } from 'vitest';

const getResources = vi.fn();
const getEmployees = vi.fn();
const getResourceByEmail = vi.fn();

vi.mock('@/services/bc/bcClient', () => ({
  bcClient: {
    getResources: (...args: unknown[]) => getResources(...args),
    getEmployees: (...args: unknown[]) => getEmployees(...args),
    getResourceByEmail: (...args: unknown[]) => getResourceByEmail(...args),
  },
}));

import { useTeammateStore } from '@/hooks/useTeammateStore';

const resource = (id: string, number: string, name: string) => ({
  id,
  number,
  name,
  displayName: name,
  type: 'Person',
  useTimeSheet: true,
  timeSheetOwnerUserId: name.toUpperCase().replace(' ', '.'),
});

describe('useTeammateStore.fetchTeammates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getEmployees.mockResolvedValue([]);
    getResourceByEmail.mockResolvedValue(null);
    useTeammateStore.setState({ teammates: [], selectedTeammate: null, error: null });
  });

  it('keeps a selection that is still in the refreshed list', async () => {
    getResources.mockResolvedValue([resource('r1', 'RES01', 'Jane Doe')]);
    await useTeammateStore.getState().fetchTeammates();
    useTeammateStore.getState().selectTeammate(useTeammateStore.getState().teammates[0]);

    await useTeammateStore.getState().fetchTeammates();

    expect(useTeammateStore.getState().selectedTeammate?.id).toBe('r1');
  });

  it('clears a selection that is not in the refreshed list (e.g. after a company switch)', async () => {
    getResources.mockResolvedValue([resource('r1', 'RES01', 'Jane Doe')]);
    await useTeammateStore.getState().fetchTeammates();
    useTeammateStore.getState().selectTeammate(useTeammateStore.getState().teammates[0]);

    // The other company has a different set of resources
    getResources.mockResolvedValue([resource('r9', 'RES09', 'John Smith')]);
    await useTeammateStore.getState().fetchTeammates();

    expect(useTeammateStore.getState().selectedTeammate).toBeNull();
  });

  it('clears the selection when the fetch fails', async () => {
    getResources.mockResolvedValue([resource('r1', 'RES01', 'Jane Doe')]);
    await useTeammateStore.getState().fetchTeammates();
    useTeammateStore.getState().selectTeammate(useTeammateStore.getState().teammates[0]);

    getResources.mockRejectedValue(new Error('network'));
    await useTeammateStore.getState().fetchTeammates();

    expect(useTeammateStore.getState().selectedTeammate).toBeNull();
    expect(useTeammateStore.getState().teammates).toEqual([]);
  });
});

describe('useTeammateStore employee enrichment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getResourceByEmail.mockResolvedValue(null);
    useTeammateStore.setState({ teammates: [], selectedTeammate: null, error: null });
  });

  it('enriches a resource from the one employee with the same name', async () => {
    getResources.mockResolvedValue([resource('r1', 'RES01', 'Jane Doe')]);
    getEmployees.mockResolvedValue([{ displayName: 'Jane Doe', jobTitle: 'Consultant' }]);
    await useTeammateStore.getState().fetchTeammates();
    expect(useTeammateStore.getState().teammates[0].jobTitle).toBe('Consultant');
  });

  it('does not enrich when the name is ambiguous', async () => {
    getResources.mockResolvedValue([
      resource('r1', 'RES01', 'Alex Smith'),
      resource('r2', 'RES02', 'Alex Smith'),
      resource('r3', 'RES03', 'Sam Lee'),
    ]);
    getEmployees.mockResolvedValue([
      { displayName: 'Alex Smith', jobTitle: 'Developer' },
      { displayName: 'Sam Lee', jobTitle: 'Analyst' },
      { displayName: 'Sam Lee', jobTitle: 'Designer' },
    ]);
    await useTeammateStore.getState().fetchTeammates();
    const byNo = Object.fromEntries(
      useTeammateStore.getState().teammates.map((t) => [t.resourceNo, t.jobTitle])
    );
    expect(byNo).toEqual({ RES01: undefined, RES02: undefined, RES03: undefined });
  });

  it('leaves out placeholder resources with no time sheet owner', async () => {
    getResources.mockResolvedValue([
      resource('r1', 'RES01', 'Jane Doe'),
      { ...resource('r2', 'DESIGN', 'Design Resource'), timeSheetOwnerUserId: '' },
    ]);
    await useTeammateStore.getState().fetchTeammates();
    expect(useTeammateStore.getState().teammates.map((t) => t.resourceNo)).toEqual(['RES01']);
  });
});

describe('useTeammateStore out-of-order fetches', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getEmployees.mockResolvedValue([]);
    getResourceByEmail.mockResolvedValue(null);
    useTeammateStore.setState({ teammates: [], selectedTeammate: null, error: null });
  });

  it('ignores an older fetch that resolves after a newer one', async () => {
    let resolveOld: (value: unknown) => void = () => {};
    getResources
      .mockImplementationOnce(() => new Promise((resolve) => (resolveOld = resolve)))
      .mockResolvedValueOnce([resource('r9', 'RES09', 'New Company Person')]);

    const oldFetch = useTeammateStore.getState().fetchTeammates(); // e.g. previous company
    await useTeammateStore.getState().fetchTeammates(); // newer company, resolves first
    resolveOld([resource('r1', 'RES01', 'Old Company Person')]);
    await oldFetch;

    expect(useTeammateStore.getState().teammates.map((t) => t.resourceNo)).toEqual(['RES09']);
  });
});
