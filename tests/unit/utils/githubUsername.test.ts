import { describe, it, expect } from 'vitest';
import {
  describeGitHubUsernameSaveError,
  getGitHubProfileUrl,
  hasGitHubUsernameField,
  normaliseGitHubUsername,
} from '@/utils';

describe('hasGitHubUsernameField', () => {
  it('is false on extensions without the field', () => {
    expect(hasGitHubUsernameField([{}, {}])).toBe(false);
  });

  it('is true once any resource returns it, even blank', () => {
    expect(hasGitHubUsernameField([{}, { githubUsername: '' }])).toBe(true);
  });
});

describe('normaliseGitHubUsername', () => {
  it('keeps a valid login as typed, trimmed', () => {
    expect(normaliseGitHubUsername('  octo-cat ')).toBe('octo-cat');
    expect(normaliseGitHubUsername('Contoso42')).toBe('Contoso42');
  });

  it('turns an @mention or a profile URL into the login', () => {
    expect(normaliseGitHubUsername('@alex-contoso')).toBe('alex-contoso');
    expect(normaliseGitHubUsername('https://github.com/alex-contoso')).toBe('alex-contoso');
    expect(normaliseGitHubUsername('github.com/alex-contoso/')).toBe('alex-contoso');
    expect(normaliseGitHubUsername('HTTPS://GitHub.com/Alex-Contoso')).toBe('Alex-Contoso');
    expect(normaliseGitHubUsername('https://www.github.com/alex-contoso')).toBe('alex-contoso');
  });

  it('returns an empty string for blank input (clears it)', () => {
    expect(normaliseGitHubUsername('')).toBe('');
    expect(normaliseGitHubUsername('   ')).toBe('');
  });

  it('rejects what GitHub would not allow', () => {
    expect(normaliseGitHubUsername('-leading')).toBeNull();
    expect(normaliseGitHubUsername('trailing-')).toBeNull();
    expect(normaliseGitHubUsername('double--hyphen')).toBeNull();
    expect(normaliseGitHubUsername('has space')).toBeNull();
    expect(normaliseGitHubUsername('under_score')).toBeNull();
    expect(normaliseGitHubUsername('https://github.com/contoso/repo')).toBeNull();
    expect(normaliseGitHubUsername('@')).toBeNull();
    // Another host that merely contains "github.com/" is not a GitHub profile
    expect(normaliseGitHubUsername('https://notgithub.com/alex')).toBeNull();
    expect(normaliseGitHubUsername('https://example.com/github.com/alex')).toBeNull();
    expect(normaliseGitHubUsername('a'.repeat(39))).toBe('a'.repeat(39));
    expect(normaliseGitHubUsername('a'.repeat(40))).toBeNull();
  });
});

describe('getGitHubProfileUrl', () => {
  it('links to the profile', () => {
    expect(getGitHubProfileUrl('alex-contoso')).toBe('https://github.com/alex-contoso');
  });

  it('is null without a valid username', () => {
    expect(getGitHubProfileUrl('')).toBeNull();
    expect(getGitHubProfileUrl(undefined)).toBeNull();
    expect(getGitHubProfileUrl('not valid')).toBeNull();
  });
});

describe('describeGitHubUsernameSaveError', () => {
  it('explains a permission error', () => {
    expect(describeGitHubUsernameSaveError(new Error('BC API Error (403): Forbidden'))).toMatch(
      /permission/
    );
  });

  it('asks for a newer extension when the action is missing', () => {
    expect(
      describeGitHubUsernameSaveError(new Error('BC API Error (404): No HTTP resource was found'))
    ).toMatch(/newer version of the Thyme BC Extension/);
  });

  it("shows BC's reason for a rejected value, without the correlation id", () => {
    const body = JSON.stringify({
      error: {
        code: 'Internal_ServerError',
        message:
          'You are not allowed to change the GitHub username of resource R0010.  CorrelationId:  0000.',
      },
    });
    expect(describeGitHubUsernameSaveError(new Error(`BC API Error (400): ${body}`))).toBe(
      'Business Central rejected the change: You are not allowed to change the GitHub username of resource R0010.'
    );
  });

  it('falls back to a generic message', () => {
    expect(describeGitHubUsernameSaveError(new Error('network down'))).toMatch(/Failed to save/);
  });
});

describe('collapsePasted', () => {
  it('turns a pasted profile URL or @login into the login', async () => {
    const { collapsePasted } = await import('@/components/team/GitHubUsernameInput');
    expect(collapsePasted('https://github.com/alex-contoso')).toBe('alex-contoso');
    expect(collapsePasted('@alex-contoso')).toBe('alex-contoso');
  });

  it('leaves typing alone, including half-typed or invalid values', async () => {
    const { collapsePasted } = await import('@/components/team/GitHubUsernameInput');
    expect(collapsePasted('alex-')).toBe('alex-');
    expect(collapsePasted('https://github.com/contoso/repo')).toBe(
      'https://github.com/contoso/repo'
    );
  });
});
