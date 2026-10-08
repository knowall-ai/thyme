/**
 * Each person's GitHub username, stored on their BC resource (Thyme BC Extension 1.21+), so
 * Poppie knows whose GitHub pull requests and issues are whose. (Their Azure DevOps user is
 * their Microsoft 365 sign-in, so Thyme doesn't ask for it.)
 *
 * A Thyme administrator can change anyone's and a person their own; BC decides and tells
 * Thyme per resource (`canEditConnectedAccounts`).
 */

import type { BCResource } from '@/types';

/** Longest GitHub login */
export const MAX_GITHUB_USERNAME_LENGTH = 39;

const GITHUB_LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9]))*$/;

/**
 * Whether the installed Thyme BC Extension stores GitHub usernames on resources. Older
 * versions don't return the field at all.
 */
export function hasGitHubUsernameField(resources: Pick<BCResource, 'githubUsername'>[]) {
  return resources.some((resource) => typeof resource.githubUsername === 'string');
}

/**
 * A GitHub login from what was typed, the same way BC normalises it: trimmed, without a
 * leading @ or a github.com profile URL around it. '' when blank (clears it); null when it
 * isn't a valid login (letters, digits and single hyphens, not starting or ending with a
 * hyphen, at most 39 characters).
 */
export function normaliseGitHubUsername(input: string): string | null {
  let value = input.trim();
  if (value === '') return '';
  const host = value.toLowerCase().indexOf('github.com/');
  if (host >= 0) value = value.slice(host + 'github.com/'.length);
  value = value.replace(/\/+$/, '').replace(/^@+/, '');
  if (value.length === 0 || value.length > MAX_GITHUB_USERNAME_LENGTH) return null;
  return GITHUB_LOGIN.test(value) ? value : null;
}

/** The person's GitHub profile, or null when they have no (valid) username */
export function getGitHubProfileUrl(username: string | null | undefined): string | null {
  const login = username ? normaliseGitHubUsername(username) : null;
  return login ? `https://github.com/${encodeURIComponent(login)}` : null;
}

/** What to tell the user when BC refuses to save a GitHub username */
export function describeGitHubUsernameSaveError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('(403)')) {
    return "You don't have permission in Business Central to change this. Ask an administrator.";
  }
  // An extension without the action
  if (message.includes('(404)') || (message.includes('(400)') && /does not exist/i.test(message))) {
    return 'GitHub usernames need a newer version of the Thyme BC Extension (1.21 or later).';
  }
  if (message.includes('(400)')) {
    // The body is JSON ({"error":{"message":...}}); BC appends "  CorrelationId:  <guid>."
    let reason: string | undefined;
    const jsonStart = message.indexOf('{');
    if (jsonStart >= 0) {
      try {
        const body = JSON.parse(message.slice(jsonStart));
        if (typeof body?.error?.message === 'string') reason = body.error.message;
      } catch {
        reason = undefined;
      }
    }
    reason = reason?.replace(/\s*CorrelationId:.*$/, '').trim() || undefined;
    return reason
      ? `Business Central rejected the change: ${reason}`
      : 'Business Central rejected the change. Check the username and try again.';
  }
  return 'Failed to save the GitHub username. Please try again.';
}
