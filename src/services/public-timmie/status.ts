import {
  publicAiDisabled,
  publicAzureConfig,
  publicLiveConfig,
  publicTimmieEnabled,
  secretProblem,
} from './config';
import type { PublicStatus } from './shared';

const NOT_SET_UP =
  "Ask Timmie isn't set up on this site yet. The help and pricing pages have the answers, and the enquiry form reaches the team.";

/**
 * Whether Ask Timmie is on (the kill switch) and which of text and voice work, with a
 * plain reason for each one that doesn't. Reveals nothing but booleans and fixed text.
 * Anything missing (the Azure settings, or in production the signing secret) fails
 * closed: that mode shows as unavailable.
 */
export function publicStatus(): PublicStatus {
  if (!publicTimmieEnabled()) return { enabled: false, chat: false, voice: false };
  if (secretProblem()) {
    return {
      enabled: true,
      chat: false,
      voice: false,
      chatReason: NOT_SET_UP,
      voiceReason: NOT_SET_UP,
    };
  }
  if (publicAiDisabled()) {
    // Tests: chat answers with a canned reply; no calls.
    return {
      enabled: true,
      chat: true,
      voice: false,
      voiceReason: 'Voice is switched off on this site.',
    };
  }
  const chatConfig = publicAzureConfig();
  const chat = !!chatConfig?.chatDeployment;
  const voice = !!publicLiveConfig();
  if (!chat && !voice) {
    return { enabled: true, chat, voice, chatReason: NOT_SET_UP, voiceReason: NOT_SET_UP };
  }
  return {
    enabled: true,
    chat,
    voice,
    ...(chat ? {} : { chatReason: 'Chat isn’t set up on this site yet.' }),
    ...(voice ? {} : { voiceReason: 'Voice isn’t set up on this site yet.' }),
  };
}
