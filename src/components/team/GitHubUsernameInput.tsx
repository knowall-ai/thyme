'use client';

import { normaliseGitHubUsername, MAX_GITHUB_USERNAME_LENGTH } from '@/utils';

export interface GitHubUsernameInputProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  /** Helper text under the field (replaced by the error when the value isn't valid) */
  hint?: string;
}

/**
 * A pasted profile URL or @login becomes the login straight away, so the field (which already
 * shows "github.com/") reads naturally. Anything else is left as typed.
 */
export function collapsePasted(value: string): string {
  const looksPasted = /github\.com\//i.test(value) || value.trim().startsWith('@');
  if (!looksPasted) return value;
  return normaliseGitHubUsername(value) ?? value;
}

/**
 * A GitHub username field: "github.com/" prefix, accepts a login, @login or profile URL.
 * Shows why the value isn't valid; the caller checks normaliseGitHubUsername before saving.
 */
export function GitHubUsernameInput({
  id,
  value,
  onChange,
  disabled,
  hint,
}: GitHubUsernameInputProps) {
  const invalid = normaliseGitHubUsername(value) === null;
  const hintId = `${id}-hint`;
  return (
    <div>
      <div className="border-dark-600 bg-dark-800 focus-within:ring-knowall-green flex max-w-sm items-center rounded-lg border focus-within:ring-2">
        <span className="text-dark-400 pl-3 text-sm select-none">github.com/</span>
        <input
          id={id}
          type="text"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          // Room for a pasted profile URL; BC stores just the login
          maxLength={MAX_GITHUB_USERNAME_LENGTH + 40}
          value={value}
          onChange={(e) => onChange(collapsePasted(e.target.value))}
          disabled={disabled}
          placeholder="username"
          aria-invalid={invalid}
          aria-describedby={hintId}
          className="text-dark-100 placeholder:text-dark-500 w-full min-w-0 bg-transparent py-2 pr-3 pl-0.5 focus:outline-none disabled:opacity-50"
        />
      </div>
      <p
        id={hintId}
        className={invalid ? 'mt-1 text-sm text-red-400' : 'text-dark-400 mt-1 text-xs'}
      >
        {invalid
          ? 'Enter a GitHub username: letters, digits and single hyphens, not starting or ending with a hyphen.'
          : hint}
      </p>
    </div>
  );
}
