import { randomBytes } from 'node:crypto';
import type { CallUpdate } from './live';

/**
 * The calls this instance is supervising, in memory (Timmie runs on one App Service
 * instance; see docs/PUBLIC_ASSISTANT.adoc). The browser gets an unguessable call key;
 * with it, and only from the same IP, it can read the call's captions
 * (/api/public/voice/events) and end it (/api/public/voice/end). Nothing else about the
 * call (the session id, any credential) ever leaves the server.
 */
interface LiveCallEntry {
  ip: string;
  listeners: Set<(update: CallUpdate) => void>;
  /** The last few updates, for a caption stream that connects a moment after the call. */
  backlog: CallUpdate[];
  ended?: string;
  end: (reason: string) => void;
}

const calls = new Map<string, LiveCallEntry>();

export function registerCall(ip: string, end: (reason: string) => void) {
  const key = randomBytes(24).toString('base64url');
  const entry: LiveCallEntry = { ip, listeners: new Set(), backlog: [], end };
  calls.set(key, entry);
  return {
    key,
    publish(update: CallUpdate) {
      entry.backlog.push(update);
      if (entry.backlog.length > 20) entry.backlog.shift();
      if (update.type === 'ended') {
        entry.ended = update.reason;
        // Keep the entry briefly so a late caption stream still learns that it ended.
        setTimeout(() => calls.delete(key), 30_000).unref?.();
      }
      for (const listener of entry.listeners) listener(update);
    },
  };
}

/** The call for this key, only for the IP that started it. */
export function findCall(key: unknown, ip: string): LiveCallEntry | undefined {
  if (typeof key !== 'string' || key.length > 64) return undefined;
  const entry = calls.get(key);
  return entry && entry.ip === ip ? entry : undefined;
}

/** For tests. */
export function resetCalls() {
  calls.clear();
}
