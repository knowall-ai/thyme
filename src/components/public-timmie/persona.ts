import { GREETINGS, greetingAudioSrc, type Greeting } from '@/services/public-timmie/greetings';

/**
 * Everything that makes this assistant "Timmie" rather than any other agent, in one place.
 * The widget (launcher, bubble, panel) reads only this, the transport and the voice
 * adapter, so it can move into the shared knowall-ai/agent-embed package with a
 * different persona. See docs/PUBLIC_ASSISTANT.adoc, "Seams".
 */
export interface Persona {
  name: string;
  /** Who he is, shown under his name. */
  role: string;
  avatar: { small: string; large: string };
  /** Opening lines, each with an id and a pre-recorded clip. */
  greetings: Greeting[];
  /** The greeting's recorded clip, or undefined when it has none (text only). */
  greetingAudioSrc: (greeting: Greeting) => string | undefined;
  /** Suggested first questions. */
  chips: string[];
  /** Accent colour (the KnowAll lime by default). */
  accent: string;
}

export const TIMMIE_PERSONA: Persona = {
  name: 'Timmie',
  role: 'KnowAll AI’s timekeeper',
  avatar: { small: '/timmie/avatar-64.png', large: '/timmie/avatar-192.png' },
  greetings: GREETINGS,
  greetingAudioSrc: (greeting) => greetingAudioSrc(greeting),
  chips: [
    'What is Timmie?',
    'How does it work with Business Central?',
    'Is it really free?',
    'What does the AI agent do?',
    'How do I get a demo?',
  ],
  accent: '#9dff0a',
};
