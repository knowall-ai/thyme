import { describe, it, expect } from 'vitest';
import {
  AGENT_NAME_MAX_LENGTH,
  TIMMIE_AGENT,
  isTimmieAdmin,
  normaliseAgentName,
  normaliseAgentSettings,
} from '@/utils/agentSettings';

describe('normaliseAgentName', () => {
  it.each([
    ['Poppie', 'Poppie'],
    ['  Agent   Smith ', 'Agent Smith'],
    ["O'Neill-2", "O'Neill-2"],
    ['Zoë', 'Zoë'],
  ])('accepts %j as %j', (input, expected) => {
    expect(normaliseAgentName(input)).toBe(expected);
  });

  it.each(['', '   ', '2bot', '<b>Bot</b>', 'a'.repeat(AGENT_NAME_MAX_LENGTH + 1), 42, null])(
    'rejects %j',
    (input) => {
      expect(normaliseAgentName(input)).toBeNull();
    }
  );
});

describe('normaliseAgentSettings', () => {
  it("always names Timmie's agent Timmie", () => {
    expect(normaliseAgentSettings({ kind: 'timmie', name: 'Someone' })).toEqual(TIMMIE_AGENT);
  });

  it('keeps a valid custom agent and refuses anything else', () => {
    expect(normaliseAgentSettings({ kind: 'custom', name: 'Poppie' })).toEqual({
      kind: 'custom',
      name: 'Poppie',
    });
    expect(normaliseAgentSettings({ kind: 'custom', name: '' })).toBeNull();
    expect(normaliseAgentSettings({ kind: 'robot' })).toBeNull();
    expect(normaliseAgentSettings('custom')).toBeNull();
  });
});

describe('isTimmieAdmin', () => {
  it('needs the Timmie.Admin role in the roles claim', () => {
    expect(isTimmieAdmin(['Timmie.Admin'])).toBe(true);
    expect(isTimmieAdmin(['Timmie.User'])).toBe(false);
    expect(isTimmieAdmin('Timmie.Admin')).toBe(false);
    expect(isTimmieAdmin(undefined)).toBe(false);
  });
});
