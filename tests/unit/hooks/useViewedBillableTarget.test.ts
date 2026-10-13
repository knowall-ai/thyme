import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { BCResource } from '@/types';

const client = vi.hoisted(() => ({
  getResources: vi.fn(),
  getResourceForCurrentUser: vi.fn(),
  getThymeSetup: vi.fn(),
}));
vi.mock('@/services/bc/bcClient', () => ({ bcClient: client }));

import { useViewedBillableTarget } from '@/hooks/useViewedBillableTarget';
import { useBillableTargetStore } from '@/hooks/useBillableTargetStore';

const resource = (overrides: Partial<BCResource>): BCResource =>
  ({ id: 'r', number: 'R1', name: 'Contoso Person', ...overrides }) as BCResource;

describe('useViewedBillableTarget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useBillableTargetStore.setState({
      companyDefaultPercent: null,
      setupAvailable: null,
      loadedForCompanyVersion: -1,
      isLoading: false,
    });
    client.getThymeSetup.mockResolvedValue({ defaultBillableTargetPercent: 75 });
  });

  it("uses the signed-in user's own target", async () => {
    client.getResourceForCurrentUser.mockResolvedValue(
      resource({ billableTargetSet: true, billableTargetPercent: 25 })
    );
    const { result } = renderHook(() => useViewedBillableTarget(null, 'me@contoso.com'));
    await waitFor(() => expect(result.current).toEqual({ percent: 25, isDefault: false }));
    expect(client.getResourceForCurrentUser).toHaveBeenCalledWith('me@contoso.com');
  });

  it('falls back to the company default for a teammate without their own', async () => {
    client.getResources.mockResolvedValue([resource({ number: "R'2", billableTargetSet: false })]);
    const { result } = renderHook(() => useViewedBillableTarget("R'2", 'me@contoso.com'));
    await waitFor(() => expect(result.current).toEqual({ percent: 75, isDefault: true }));
    // The resource number is escaped for the OData filter
    expect(client.getResources).toHaveBeenCalledWith("number eq 'R''2'");
  });

  it('shows no target on extensions without billable targets', async () => {
    client.getResourceForCurrentUser.mockResolvedValue(resource({}));
    const { result } = renderHook(() => useViewedBillableTarget(null, 'me@contoso.com'));
    await waitFor(() => expect(client.getResourceForCurrentUser).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(result.current).toBeNull();
    expect(client.getThymeSetup).not.toHaveBeenCalled();
  });

  it("never shows a previous person's target after switching", async () => {
    let resolveMine!: (r: BCResource) => void;
    client.getResourceForCurrentUser.mockReturnValue(
      new Promise<BCResource>((r) => {
        resolveMine = r;
      })
    );
    client.getResources.mockResolvedValue([
      resource({ number: 'R2', billableTargetSet: true, billableTargetPercent: 40 }),
    ]);
    const { result, rerender } = renderHook(
      ({ resourceNo }) => useViewedBillableTarget(resourceNo, 'me@contoso.com'),
      { initialProps: { resourceNo: null as string | null } }
    );
    rerender({ resourceNo: 'R2' });
    await waitFor(() => expect(result.current).toEqual({ percent: 40, isDefault: false }));
    // The signed-in user's slow load finishing late doesn't replace the teammate's
    resolveMine(resource({ billableTargetSet: true, billableTargetPercent: 90 }));
    await new Promise((r) => setTimeout(r, 0));
    expect(result.current).toEqual({ percent: 40, isDefault: false });
  });
});
