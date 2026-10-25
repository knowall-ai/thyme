/**
 * Timmie's opening lines on the public pages. One is picked per visit so he doesn't
 * sound like a recording. Each can have a pre-recorded clip at
 * public/timmie/greetings/<id>.mp3 (made once, with Azure OpenAI text-to-speech, by
 * scripts/generate-timmie-greetings.ts, which also lists it in greeting-clips.ts), so a
 * page view costs nothing and calls no API. A greeting without a clip shows as text only.
 *
 * Every greeting: British, warm, under ten seconds spoken, says his name, and ends with
 * one question. If you change the text, regenerate the clips.
 *
 * Pure (no browser globals): the widget passes in its storage.
 */
import { GREETING_CLIPS } from './greeting-clips';

export interface Greeting {
  id: string;
  text: string;
}

export const GREETINGS: Greeting[] = [
  {
    id: 'timesheet',
    text: "Hi, I'm Timmie. I keep time for teams on Business Central. Want to know how I'd fill in your timesheet for you?",
  },
  {
    id: 'three-questions',
    text: 'Timmie here. People ask what I cost, how I connect to Business Central, or if I really do timesheets. Which is yours?',
  },
  {
    id: 'on-time',
    text: "Good to see you. I'm Timmie, and I'm rather keen on timesheets arriving on time. Shall I show you how Timmie makes that painless?",
  },
  {
    id: 'free',
    text: "Hello, I'm Timmie. I'm free and open source, and I live on top of Business Central. What would you like to know?",
  },
  {
    id: 'talk-or-type',
    text: 'Hi there, Timmie here. You can talk to me or type, whichever suits. What brings you to Timmie today?',
  },
];

/** The pre-recorded clip for a greeting. */
export const greetingAudioSrc = (
  greeting: Greeting,
  clips: readonly string[] = GREETING_CLIPS
): string | undefined =>
  clips.includes(greeting.id) ? `/timmie/greetings/${greeting.id}.mp3` : undefined;

/** Pick a greeting; pass a random function to make the choice deterministic. */
export function pickGreeting(
  random: () => number = Math.random,
  greetings: Greeting[] = GREETINGS
): Greeting {
  const index = Math.min(
    greetings.length - 1,
    Math.max(0, Math.floor(random() * greetings.length))
  );
  return greetings[index];
}

type KeyValueStore = Pick<Storage, 'getItem' | 'setItem'>;

/** sessionStorage: Timmie has greeted (or been dismissed or muted) in this browser session. */
export const GREETED_KEY = 'ask-timmie:greeted';
/** localStorage: the visitor muted Timmie's voice. */
export const MUTED_KEY = 'ask-timmie:muted';

function safely<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    // Storage can throw (privacy modes, blocked cookies): behave as if it were empty.
    return fallback;
  }
}

/** Greet once per browser session: not on every page change, and not after a dismissal. */
export function shouldGreet(session: KeyValueStore | undefined): boolean {
  return safely(() => session?.getItem(GREETED_KEY) !== '1', true);
}

export function markGreeted(session: KeyValueStore | undefined): void {
  safely(() => session?.setItem(GREETED_KEY, '1'), undefined);
}

/** Voice is on by default; muting is remembered across visits. */
export function readMuted(local: KeyValueStore | undefined): boolean {
  return safely(() => local?.getItem(MUTED_KEY) === '1', false);
}

export function writeMuted(local: KeyValueStore | undefined, muted: boolean): void {
  safely(() => local?.setItem(MUTED_KEY, muted ? '1' : '0'), undefined);
}
