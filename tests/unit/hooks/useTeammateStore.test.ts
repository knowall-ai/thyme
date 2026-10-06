import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BCResource } from '@/types';

const getResources = vi.fn(async (): Promise<BCResource[]> => []);

vi.mock('@/services/bc/bcClient', () => ({
  bcClient: { getResources: () => getResources() },
}));

import { useTeammateStore } from '@/hooks/useTeammateStore';

function resource(partial: Partial<BCResource> & Pick<BCResource, 'id' | 'number'>): BCResource {
  return { name: partial.number, type: 'Person', useTimeSheet: true, ...partial };
}

describe('useTeammateStore.fetchTeammates', () => {
  beforeEach(() => {
    getResources.mockReset();
    useTeammateStore.setState({
      teammates: [],
      selectedTeammate: null,
      isLoading: false,
      error: null,
    });
  });

  it('keeps only resources that use timesheets', async () => {
    getResources.mockResolvedValue([
      resource({ id: 'a', number: 'R0001' }),
      resource({ id: 'b', number: 'R0002', useTimeSheet: false }),
      resource({ id: 'c', number: 'R0003', useTimeSheet: undefined }),
    ]);

    await useTeammateStore.getState().fetchTeammates();

    expect(useTimeSheetNumbers()).toEqual(['R0001']);
    expect(useTeammateStore.getState().error).toBeNull();
  });

  it('keeps the current selection when it is still in the fetched list', async () => {
    const alice = resource({ id: 'a', number: 'R0001' });
    useTeammateStore.setState({ selectedTeammate: alice });
    getResources.mockResolvedValue([alice, resource({ id: 'b', number: 'R0002' })]);

    await useTeammateStore.getState().fetchTeammates();

    expect(useTeammateStore.getState().selectedTeammate).toEqual(alice);
  });

  it('clears a selection that is not in the fetched list (e.g. after a company switch)', async () => {
    useTeammateStore.setState({ selectedTeammate: resource({ id: 'old', number: 'R0001' }) });
    // Same resource number in the new company, different record — must not be kept.
    getResources.mockResolvedValue([resource({ id: 'new', number: 'R0001' })]);

    await useTeammateStore.getState().fetchTeammates();

    expect(useTeammateStore.getState().selectedTeammate).toBeNull();
  });

  it('clears teammates and selection when the fetch fails', async () => {
    useTeammateStore.setState({
      teammates: [resource({ id: 'a', number: 'R0001' })],
      selectedTeammate: resource({ id: 'a', number: 'R0001' }),
    });
    getResources.mockRejectedValue(new Error('boom'));

    await useTeammateStore.getState().fetchTeammates();

    const state = useTeammateStore.getState();
    expect(state.teammates).toEqual([]);
    expect(state.selectedTeammate).toBeNull();
    expect(state.error).toBe('boom');
    expect(state.isLoading).toBe(false);
  });
});

function useTimeSheetNumbers(): string[] {
  return useTeammateStore.getState().teammates.map((t) => t.number);
}
