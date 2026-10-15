import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

const getLicenceToken = vi.fn();
const isLicenceAdmin = vi.fn();
vi.mock('@/services/auth/licenceService', () => ({
  getLicenceToken: () => getLicenceToken(),
  isLicenceAdmin: (t: string) => isLicenceAdmin(t),
  getSubscribedSkus: async () => [
    {
      skuId: 'e3',
      skuPartNumber: 'ENTERPRISEPACK',
      consumedUnits: 2,
      prepaidUnits: { enabled: 3 },
    },
    {
      skuId: 'att',
      skuPartNumber: 'Dynamics_365_Business_Central_Essentials_Attach',
      consumedUnits: 1,
      prepaidUnits: { enabled: 1 },
    },
  ],
  getLicensedUsers: async () => [
    {
      id: 'sam',
      displayName: 'Sam Contoso',
      userPrincipalName: 'sam@contoso.com',
      accountEnabled: true,
      assignedLicenses: [{ skuId: 'e3' }, { skuId: 'att' }],
    },
  ],
}));
vi.mock('@/services/auth', () => ({
  useAuth: () => ({ account: { tenantId: 'contoso-tenant', homeAccountId: 'me' } }),
}));

import { LicencesPanel } from '@/components/team/LicencesPanel';

beforeEach(() => {
  vi.mocked(localStorage.getItem).mockReturnValue(null);
  getLicenceToken.mockReset();
  isLicenceAdmin.mockReset();
});

describe('LicencesPanel', () => {
  it("shows nothing until the directory permission is granted, or to someone who isn't an admin", async () => {
    getLicenceToken.mockResolvedValue(null);
    const { container, unmount } = render(<LicencesPanel />);
    await waitFor(() => expect(getLicenceToken).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
    unmount();

    getLicenceToken.mockResolvedValue('token');
    isLicenceAdmin.mockResolvedValue(false);
    const second = render(<LicencesPanel />);
    await waitFor(() => expect(isLicenceAdmin).toHaveBeenCalled());
    expect(second.container).toBeEmptyDOMElement();
  });

  it('shows an admin the totals, each person and what looks wrong', async () => {
    getLicenceToken.mockResolvedValue('token');
    isLicenceAdmin.mockResolvedValue(true);
    render(<LicencesPanel />);
    expect(
      (await screen.findAllByText('Office 365 E3', { selector: 'td' }))[0]
    ).toBeInTheDocument();
    // 3 purchased at £23.30
    expect(screen.getByText('£69.90')).toBeInTheDocument();
    expect(
      screen.getByText(/Essentials Attach without a qualifying base licence/)
    ).toHaveTextContent('Sam Contoso');
    expect(screen.getByText(/1 Office 365 E3 purchased but not assigned/)).toBeInTheDocument();
  });

  it("keeps an admin's own price for this organisation", async () => {
    getLicenceToken.mockResolvedValue('token');
    isLicenceAdmin.mockResolvedValue(true);
    render(<LicencesPanel />);
    // The totals table comes first
    const row = (await screen.findAllByText('Office 365 E3', { selector: 'td' }))[0].closest('tr')!;
    fireEvent.click(within(row).getByRole('button', { name: /£23.30/ }));
    const input = within(row).getByRole('spinbutton', { name: 'Price a month' });
    fireEvent.change(input, { target: { value: '20' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(await within(row).findByText('£60.00')).toBeInTheDocument();
    // Saved for this organisation (localStorage is a stub in tests)
    expect(localStorage.setItem).toHaveBeenCalledWith(
      'thyme_licence_prices_contoso-tenant',
      JSON.stringify({ ENTERPRISEPACK: 20 })
    );
  });
});
