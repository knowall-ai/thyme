'use client';

import { useEffect, useId, useState } from 'react';
import toast from 'react-hot-toast';
import { LinkIcon } from '@heroicons/react/24/outline';
import { Button, Card, GitHubIcon } from '@/components/ui';
import { GitHubUsernameInput } from '@/components/team/GitHubUsernameInput';
import { bcClient } from '@/services/bc';
import { useAuth } from '@/services/auth';
import { useCompanyStore } from '@/hooks';
import {
  describeGitHubUsernameSaveError,
  getGitHubProfileUrl,
  normaliseGitHubUsername,
} from '@/utils';
import type { BCResource } from '@/types';

/**
 * Settings card where people set their own GitHub username (on their BC resource in the
 * selected company), so Poppie can suggest time for their pull requests and issues. Hidden
 * when they have no resource here or the Thyme BC Extension predates GitHub usernames (1.21).
 */
export function ConnectedAccountsSettings() {
  const inputId = useId();
  const { account } = useAuth();
  const { companyVersion } = useCompanyStore();
  const userName = account?.username;
  const [resource, setResource] = useState<BCResource | null>(null);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // The signed-in user's resource in this company; a reply for an earlier company is ignored
  useEffect(() => {
    let cancelled = false;
    setResource(null);
    if (!userName) return;
    bcClient
      .getResourceForCurrentUser(userName)
      .then((found) => {
        if (cancelled) return;
        setResource(found);
        setValue(found?.githubUsername ?? '');
        setError(null);
      })
      .catch(() => {
        // No extension or no access: nothing to show
        if (!cancelled) setResource(null);
      });
    return () => {
      cancelled = true;
    };
  }, [userName, companyVersion]);

  if (!resource || typeof resource.githubUsername !== 'string') return null;

  const current = resource.githubUsername;
  const canEdit = resource.canEditConnectedAccounts !== false;
  const normalised = normaliseGitHubUsername(value);
  const unchanged = normalised === current;
  const profileUrl = getGitHubProfileUrl(current);

  const handleSave = async () => {
    if (normalised === null) return;
    setIsSaving(true);
    setError(null);
    try {
      const saved = await bcClient.updateResourceGitHubUsername(resource.id, normalised);
      setResource(saved);
      setValue(saved.githubUsername ?? normalised);
      toast.success(normalised ? 'GitHub username saved' : 'GitHub username removed');
    } catch (err) {
      setError(describeGitHubUsernameSaveError(err));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card variant="bordered" className="p-6">
      <div className="mb-1 flex items-center gap-3">
        <LinkIcon className="text-thyme-500 h-6 w-6" />
        <h2 className="text-lg font-semibold text-white">Connected accounts</h2>
      </div>
      <p className="text-dark-400 mb-4 text-sm">
        So Poppie can suggest time for your work outside Thyme. Saved on your resource in this
        company.
      </p>

      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void handleSave();
        }}
      >
        <label
          htmlFor={inputId}
          className="text-dark-200 flex items-center gap-2 text-sm font-medium"
        >
          <GitHubIcon className="h-4 w-4" />
          GitHub username
          {profileUrl && (
            <a
              href={profileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-dark-400 hover:text-knowall-green text-xs font-normal"
            >
              View profile
            </a>
          )}
        </label>
        <div className="flex flex-wrap items-start gap-2">
          <div className="w-full max-w-sm min-w-0">
            <GitHubUsernameInput
              id={inputId}
              value={value}
              onChange={setValue}
              disabled={isSaving || !canEdit}
              hint="For your pull requests and issues. Paste your profile link if that's easier. Leave blank to remove it."
            />
          </div>
          {canEdit && (
            <Button type="submit" disabled={normalised === null || unchanged || isSaving}>
              {isSaving ? 'Saving...' : 'Save'}
            </Button>
          )}
        </div>
        {error && (
          <p role="alert" className="rounded-lg bg-red-500/10 p-3 text-sm text-red-400">
            {error}
          </p>
        )}
        <p className="text-dark-400 text-xs">
          Azure DevOps uses your Microsoft 365 sign-in
          {userName && (
            <>
              {' '}
              (<span>{userName}</span>)
            </>
          )}
          ; there&apos;s nothing to set.
        </p>
      </form>
    </Card>
  );
}
