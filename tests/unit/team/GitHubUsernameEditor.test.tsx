import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

const { updateResourceGitHubUsername } = vi.hoisted(() => ({
  updateResourceGitHubUsername: vi.fn(),
}));
vi.mock('@/services/bc', () => ({ bcClient: { updateResourceGitHubUsername } }));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

import { GitHubUsernameEditor } from '@/components/team/GitHubUsernameEditor';
import { useCompanyStore } from '@/hooks';

const renderEditor = (onSaved = vi.fn(), onClose = vi.fn()) => {
  render(
    <GitHubUsernameEditor
      isOpen
      onClose={onClose}
      resourceId="00000000-0000-0000-0000-000000000001"
      personName="Alex Contoso"
      current=""
      onSaved={onSaved}
    />
  );
  return { onSaved, onClose };
};

describe('GitHubUsernameEditor', () => {
  beforeEach(() => {
    updateResourceGitHubUsername.mockReset();
  });

  it('saves the login from a pasted profile link', async () => {
    updateResourceGitHubUsername.mockResolvedValue({ id: 'r1', githubUsername: 'alex-contoso' });
    const { onSaved, onClose } = renderEditor();
    fireEvent.change(screen.getByLabelText('GitHub username'), {
      target: { value: 'https://github.com/alex-contoso?tab=repositories' },
    });
    expect(screen.getByLabelText('GitHub username')).toHaveValue('alex-contoso');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(onSaved).toHaveBeenCalledWith({ id: 'r1', githubUsername: 'alex-contoso' })
    );
    expect(updateResourceGitHubUsername).toHaveBeenCalledWith(
      '00000000-0000-0000-0000-000000000001',
      'alex-contoso'
    );
    expect(onClose).toHaveBeenCalled();
  });

  it('disables Save for an invalid username', () => {
    renderEditor();
    fireEvent.change(screen.getByLabelText('GitHub username'), { target: { value: 'bad--name' } });
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(screen.getByText(/Enter a GitHub username/)).toBeInTheDocument();
  });

  it('ignores a save that finishes after the company changed', async () => {
    let finish!: (value: unknown) => void;
    updateResourceGitHubUsername.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const { onSaved, onClose } = renderEditor();
    fireEvent.change(screen.getByLabelText('GitHub username'), {
      target: { value: 'alex-contoso' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    act(() => {
      useCompanyStore.setState((s) => ({ companyVersion: s.companyVersion + 1 }));
    });
    await act(async () => {
      finish({ id: 'r1', githubUsername: 'alex-contoso' });
    });
    expect(onSaved).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('shows why BC refused, unless the company changed meanwhile', async () => {
    updateResourceGitHubUsername.mockRejectedValueOnce(new Error('BC API Error (403): Forbidden'));
    renderEditor();
    fireEvent.change(screen.getByLabelText('GitHub username'), {
      target: { value: 'alex-contoso' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/permission/);
  });
});
