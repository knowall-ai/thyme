import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const fetchOrgSettings = vi.fn();
vi.mock('@/services/settings/orgSettingsService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/settings/orgSettingsService')>();
  return { ...actual, fetchOrgSettings: () => fetchOrgSettings(), saveAgentSettings: vi.fn() };
});

import { AgentSettings } from '@/components/settings/AgentSettings';
import { useAgentSettingsStore } from '@/hooks/useAgentSettingsStore';
import { OrgSettingsError } from '@/services/settings/orgSettingsService';
import { TIMMIE_AGENT } from '@/utils/agentSettings';

describe('AgentSettings', () => {
  beforeEach(() => {
    fetchOrgSettings.mockReset();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    useAgentSettingsStore.setState({
      agent: TIMMIE_AGENT,
      canEdit: false,
      canSave: true,
      loaded: false,
      loadError: null,
    });
  });

  it('says why the settings did not load, and tries again', async () => {
    fetchOrgSettings.mockRejectedValueOnce(
      new OrgSettingsError('Settings are unavailable right now (503).')
    );
    render(<AgentSettings />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Settings are unavailable right now (503).'
    );

    fetchOrgSettings.mockResolvedValueOnce({
      agent: { kind: 'custom', name: 'Contoso Bot' },
      canEdit: true,
      canSave: true,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.getByLabelText('Agent name')).toHaveValue('Contoso Bot'));
  });

  it("tells an administrator when the server can't save settings", async () => {
    fetchOrgSettings.mockResolvedValue({ agent: TIMMIE_AGENT, canEdit: true, canSave: false });
    render(<AgentSettings />);
    expect(await screen.findByText(/has no settings storage set up/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Your own agent/ })).toBeDisabled();
  });
});
