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
