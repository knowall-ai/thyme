'use client';

import { useEffect, useId, useState } from 'react';
import toast from 'react-hot-toast';
import { Button, Modal } from '@/components/ui';
import { bcClient } from '@/services/bc';
import { describeGitHubUsernameSaveError, normaliseGitHubUsername } from '@/utils';
import type { BCResource } from '@/types';
import { GitHubUsernameInput } from './GitHubUsernameInput';

export interface GitHubUsernameEditorProps {
  isOpen: boolean;
  onClose: () => void;
  /** BC resource SystemId */
  resourceId: string;
  personName: string;
  /** Their GitHub username now ('' = not set) */
  current: string;
  /** Whether it's the signed-in user's own */
  isCurrentUser?: boolean;
  /** Called with the updated resource after BC accepts the change */
  onSaved: (resource: BCResource) => void;
}

/**
 * Set or clear one person's GitHub username, so Poppie can suggest time for their pull
 * requests and issues. Saves to their BC resource; BC decides whether the user may (an
 * administrator for anyone, a person for their own).
 */
export function GitHubUsernameEditor({
  isOpen,
  onClose,
  resourceId,
  personName,
  current,
  isCurrentUser = false,
  onSaved,
}: GitHubUsernameEditorProps) {
  const inputId = useId();
  const [value, setValue] = useState(current);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Start from the person's current username each time the dialog opens
  useEffect(() => {
    if (!isOpen) return;
    setValue(current);
    setError(null);
  }, [isOpen, current]);

  const normalised = normaliseGitHubUsername(value);
  const unchanged = normalised === current;

  const handleSave = async () => {
    if (normalised === null) return;
    setIsSaving(true);
    setError(null);
    try {
      const updated = await bcClient.updateResourceGitHubUsername(resourceId, normalised);
      onSaved(updated);
      toast.success(
        normalised
          ? `GitHub username saved for ${personName}`
          : `GitHub username removed for ${personName}`
      );
      onClose();
    } catch (err) {
      setError(describeGitHubUsernameSaveError(err));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`GitHub username - ${personName}`} size="sm">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void handleSave();
        }}
      >
        <div>
          <label htmlFor={inputId} className="text-dark-200 mb-1 block text-sm font-medium">
            GitHub username
          </label>
          <GitHubUsernameInput
            id={inputId}
            value={value}
            onChange={setValue}
            disabled={isSaving}
            hint={`So Poppie can suggest time for ${isCurrentUser ? 'your' : 'their'} pull requests and issues. Leave blank to remove it. Azure DevOps uses ${isCurrentUser ? 'your' : 'their'} Microsoft 365 sign-in.`}
          />
        </div>

        {error && (
          <p role="alert" className="rounded-lg bg-red-500/10 p-3 text-sm text-red-400">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button type="submit" disabled={normalised === null || unchanged || isSaving}>
            {isSaving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
