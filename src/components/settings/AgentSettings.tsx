'use client';

import { useEffect, useId, useState } from 'react';
import toast from 'react-hot-toast';
import { SparklesIcon } from '@heroicons/react/24/outline';
import { Button, Card } from '@/components/ui';
import { useAgentSettingsStore } from '@/hooks/useAgentSettingsStore';
import {
  AGENT_NAME_MAX_LENGTH,
  TIMMIE_ADMIN_ROLE,
  TIMMIE_AGENT,
  normaliseAgentName,
  type AgentKind,
  type AgentSettings as Agent,
} from '@/utils/agentSettings';

/**
 * Settings card for the organisation's AI agent: Timmie's own, or the organisation's own
 * (e.g. Poppie). Everyone sees which agent is in use; only Timmie administrators can
 * change it.
 */
export function AgentSettings() {
  const nameId = useId();
  const {
    agent,
    canEdit: isAdmin,
    canSave,
    loaded,
    loadError,
    load,
    save,
  } = useAgentSettingsStore();
  const canEdit = isAdmin && canSave;
  const [kind, setKind] = useState<AgentKind>(agent.kind);
  const [name, setName] = useState(agent.kind === 'custom' ? agent.name : '');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    void load();
  }, [load]);

  // Show the saved choice whenever it (re)loads
  useEffect(() => {
    setKind(agent.kind);
    setName(agent.kind === 'custom' ? agent.name : '');
    setError(null);
  }, [agent]);

  if (!loaded) {
    if (!loadError) return null;
    return (
      <Card variant="bordered" className="p-6">
        <div className="mb-4 flex items-center gap-3">
          <SparklesIcon className="text-timmie-500 h-6 w-6" />
          <h2 className="text-lg font-semibold text-white">AI Agent</h2>
        </div>
        <p role="alert" className="mb-4 text-sm text-red-400">
          Couldn’t load your organisation’s agent: {loadError} Until it loads, Timmie uses its own
          agent.
        </p>
        <Button size="sm" variant="secondary" onClick={() => void load()}>
          Try again
        </Button>
      </Card>
    );
  }

  const customName = normaliseAgentName(name);
  const next: Agent | null =
    kind === 'timmie' ? TIMMIE_AGENT : customName ? { kind: 'custom', name: customName } : null;
  const unchanged = next?.kind === agent.kind && next.name === agent.name;

  const handleSave = async () => {
    if (!next) return;
    setIsSaving(true);
    setError(null);
    try {
      await save(next);
      toast.success(`Timmie now works with ${next.name}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the agent.');
    } finally {
      setIsSaving(false);
    }
  };

  const option = (value: AgentKind, label: string, description: string) => (
    <label className="flex cursor-pointer items-start gap-3">
      <input
        type="radio"
        name="agent-kind"
        value={value}
        checked={kind === value}
        disabled={!canEdit}
        onChange={() => setKind(value)}
        className="accent-timmie-500 mt-1"
      />
      <span>
        <span className="text-dark-100 block">{label}</span>
        <span className="text-dark-400 text-sm">{description}</span>
      </span>
    </label>
  );

  return (
    <Card variant="bordered" className="p-6">
      <div className="mb-4 flex items-center gap-3">
        <SparklesIcon className="text-timmie-500 h-6 w-6" />
        <h2 className="text-lg font-semibold text-white">AI Agent</h2>
      </div>
      <p className="text-dark-400 mb-4 text-sm">
        The agent that suggests time entries and reviews timesheets and plans for your organisation.
      </p>

      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void handleSave();
        }}
      >
        <fieldset className="space-y-3">
          <legend className="sr-only">Agent</legend>
          {option('timmie', 'Timmie', 'Timmie’s own agent.')}
          {option(
            'custom',
            'Your own agent',
            'An agent your organisation runs that works with Timmie.'
          )}
        </fieldset>

        {kind === 'custom' && (
          <div className="pl-7">
            <label htmlFor={nameId} className="text-dark-100 block">
              Agent name
            </label>
            <p className="text-dark-400 mb-2 text-sm">
              The name it signs its reviews with. Timmie shows this name and looks for the agent’s
              heartbeat in Business Central under it.
            </p>
            <input
              id={nameId}
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!canEdit}
              maxLength={AGENT_NAME_MAX_LENGTH}
              placeholder="e.g. Poppie"
              aria-invalid={!!name && !customName}
              className="border-dark-600 bg-dark-800 text-dark-100 focus:ring-timmie-500 w-64 rounded-lg border px-3 py-2 focus:ring-2 focus:outline-none disabled:opacity-60"
            />
            {name && !customName && (
              <p className="mt-2 text-sm text-red-400">
                Start with a letter; use letters, numbers, spaces, hyphens and apostrophes.
              </p>
            )}
          </div>
        )}

        {canEdit ? (
          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={!next || unchanged || isSaving}>
              {isSaving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        ) : isAdmin ? (
          <p className="text-dark-400 text-sm">
            This Timmie server has no settings storage set up, so the agent can’t be changed. Ask
            whoever runs it to set <code>ORG_SETTINGS_TABLE_ENDPOINT</code>.
          </p>
        ) : (
          <p className="text-dark-400 text-sm">
            Only Timmie administrators (the <code>{TIMMIE_ADMIN_ROLE}</code> role) can change this.
          </p>
        )}
      </form>

      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-red-500/10 p-3 text-sm text-red-400">
          {error}
        </p>
      )}
    </Card>
  );
}
