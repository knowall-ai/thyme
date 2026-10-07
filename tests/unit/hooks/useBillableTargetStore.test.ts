import { describe, it, expect, vi, beforeEach } from 'vitest';

const getThymeSetup = vi.fn();

vi.mock('@/services/bc/bcClient', () => ({
  bcClient: {
    getThymeSetup: (...args: unknown[]) => getThymeSetup(...args),
  },
}));

import { useBillableTargetStore } from '@/hooks/useBillableTargetStore';

describe('useBillableTargetStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useBillableTargetStore.setState({
      companyDefaultPercent: null,
      setupAvailable: null,
      loadedForCompanyVersion: -1,
      isLoading: false,
    });
  });

  it('loads the company default once per company', async () => {
    getThymeSetup.mockResolvedValue({ id: 's1', defaultBillableTargetPercent: 70 });
    await useBillableTargetStore.getState().loadCompanyDefault(1);
    await useBillableTargetStore.getState().loadCompanyDefault(1);

    expect(getThymeSetup).toHaveBeenCalledTimes(1);
    expect(useBillableTargetStore.getState()).toMatchObject({
      companyDefaultPercent: 70,
      setupAvailable: true,
      loadedForCompanyVersion: 1,
    });
  });

  it('marks setup unavailable on an extension without Thyme Setup', async () => {
    getThymeSetup.mockResolvedValue(null);
    await useBillableTargetStore.getState().loadCompanyDefault(1);

    expect(useBillableTargetStore.getState()).toMatchObject({
      companyDefaultPercent: null,
      setupAvailable: false,
      loadedForCompanyVersion: 1,
    });
  });

  it('ignores a slow load for a company the user has switched away from', async () => {
    let resolveFirst: (value: unknown) => void = () => {};
    getThymeSetup
      .mockReturnValueOnce(new Promise((resolve) => (resolveFirst = resolve)))
      .mockResolvedValueOnce({ id: 's2', defaultBillableTargetPercent: 60 });

    const first = useBillableTargetStore.getState().loadCompanyDefault(1);
    await useBillableTargetStore.getState().loadCompanyDefault(2);
    resolveFirst({ id: 's1', defaultBillableTargetPercent: 90 });
    await first;

    expect(useBillableTargetStore.getState()).toMatchObject({
      companyDefaultPercent: 60,
      loadedForCompanyVersion: 2,
    });
  });

  it('only records a saved default for the company it was saved for', async () => {
    getThymeSetup.mockResolvedValue({ id: 's1', defaultBillableTargetPercent: 75 });
    await useBillableTargetStore.getState().loadCompanyDefault(1);

    useBillableTargetStore.getState().setCompanyDefault(80, 1);
    expect(useBillableTargetStore.getState().companyDefaultPercent).toBe(80);

    useBillableTargetStore.getState().setCompanyDefault(50, 0);
    expect(useBillableTargetStore.getState().companyDefaultPercent).toBe(80);
  });
});
