import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  GREETED_KEY,
  GREETINGS,
  MUTED_KEY,
  greetingAudioSrc,
  markGreeted,
  pickGreeting,
  readMuted,
  shouldGreet,
  writeMuted,
} from '@/services/public-timmie/greetings';
import { GREETING_CLIPS } from '@/services/public-timmie/greeting-clips';

/** A real key-value store (the test setup replaces localStorage with no-op mocks). */
function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, String(v)),
  };
}

describe('greetings', () => {
  it('has about five short greetings with unique ids, each saying his name and ending on one question', () => {
    expect(GREETINGS.length).toBeGreaterThanOrEqual(5);
    expect(new Set(GREETINGS.map((g) => g.id)).size).toBe(GREETINGS.length);
    for (const g of GREETINGS) {
      expect(g.id).toMatch(/^[a-z0-9-]+$/);
      expect(g.text).toMatch(/Timmie/);
      expect(g.text.trim().endsWith('?')).toBe(true);
      expect(g.text.match(/\?/g)).toHaveLength(1);
      // About 25 words is under ten seconds spoken.
      expect(g.text.split(/\s+/).length).toBeLessThanOrEqual(26);
      expect(g.text).not.toMatch(/—|https?:|\.ie\b|\.ai\b/);
    }
  });

  it('only lists clips that exist, and keeps them small', () => {
    for (const id of GREETING_CLIPS) {
      const g = GREETINGS.find((x) => x.id === id);
      expect(g, id).toBeTruthy();
      const file = path.resolve(__dirname, '../../../public', greetingAudioSrc(g!)!.slice(1));
      expect(existsSync(file), file).toBe(true);
      expect(statSync(file).size).toBeLessThan(120 * 1024);
    }
  });

  it('a greeting without a recorded clip has no audio (text only)', () => {
    expect(greetingAudioSrc(GREETINGS[0], [])).toBeUndefined();
    expect(greetingAudioSrc(GREETINGS[0], [GREETINGS[0].id])).toBe(
      `/timmie/greetings/${GREETINGS[0].id}.mp3`
    );
  });

  it('picks each greeting, deterministically for a given random number', () => {
    expect(pickGreeting(() => 0)).toBe(GREETINGS[0]);
    expect(pickGreeting(() => 0.999999)).toBe(GREETINGS[GREETINGS.length - 1]);
    expect(pickGreeting(() => 1)).toBe(GREETINGS[GREETINGS.length - 1]);
    const seen = new Set(
      GREETINGS.map((_, i) => pickGreeting(() => (i + 0.5) / GREETINGS.length).id)
    );
    expect(seen.size).toBe(GREETINGS.length);
  });

  it('greets once per session', () => {
    const session = memoryStorage();
    expect(shouldGreet(session)).toBe(true);
    markGreeted(session);
    expect(session.getItem(GREETED_KEY)).toBe('1');
    expect(shouldGreet(session)).toBe(false);
    expect(shouldGreet(memoryStorage())).toBe(true); // a new session
  });

  it('remembers the mute, with voice on by default', () => {
    const local = memoryStorage();
    expect(readMuted(local)).toBe(false);
    writeMuted(local, true);
    expect(local.getItem(MUTED_KEY)).toBe('1');
    expect(readMuted(local)).toBe(true);
    writeMuted(local, false);
    expect(readMuted(local)).toBe(false);
  });

  it('copes with storage that throws (privacy modes)', () => {
    const broken = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    };
    expect(shouldGreet(broken)).toBe(true);
    expect(readMuted(broken)).toBe(false);
    expect(() => markGreeted(broken)).not.toThrow();
    expect(() => writeMuted(broken, true)).not.toThrow();
  });
});
