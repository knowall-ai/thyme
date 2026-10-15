import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { BcHealthBanner } from '@/components/layout/BcHealthBanner';
import { BC_UNREACHABLE_EVENT } from '@/utils/bcHealth';

function stubHealth(status: string) {
  const fetchMock = vi.fn(async () =>
    Response.json({ status, passed: 0, total: 3, checkedAt: '2026-10-15T15:00:00Z' })
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const callFailed = () =>
  act(async () => void window.dispatchEvent(new Event(BC_UNREACHABLE_EVENT)));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('BcHealthBanner', () => {
  it('shows nothing, and asks nothing, until a Business Central call fails', () => {
    const fetchMock = stubHealth('down');
    const { container } = render(<BcHealthBanner />);
    expect(container).toBeEmptyDOMElement();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("says it's Microsoft when Business Central is down", async () => {
    const fetchMock = stubHealth('down');
    render(<BcHealthBanner />);
    await callFailed();
    expect(await screen.findByRole('alert')).toHaveTextContent(/Microsoft issue, not Thyme/);
    expect(fetchMock).toHaveBeenCalledWith('/api/health/bc', { cache: 'no-store' });
    expect(screen.getByRole('link', { name: /Service health/ })).toHaveAttribute(
      'href',
      'https://admin.microsoft.com/#/servicehealth'
    );
  });

  it('stays hidden when Business Central is fine (the failure was elsewhere)', async () => {
    stubHealth('ok');
    const { container } = render(<BcHealthBanner />);
    await callFailed();
    expect(container).toBeEmptyDOMElement();
  });

  it('asks once for a burst of failures', async () => {
    const fetchMock = stubHealth('down');
    render(<BcHealthBanner />);
    await callFailed();
    await callFailed();
    await callFailed();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
