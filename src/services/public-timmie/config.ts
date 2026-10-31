/**
 * Configuration for Ask Timmie, the public helper on the signed-out pages.
 *
 * It has its OWN Azure OpenAI resource and settings (PUBLIC_*), separate from anything
 * the signed-in app or the AI agent uses, so a credential leaked from the public side can
 * only ever reach that resource's small deployments. There is no fallback to any other
 * setting: unconfigured, the launcher still shows, with text and voice off and the reason.
 *
 * PUBLIC_ here means "for the public helper", not "sent to the browser": these are
 * server-side App Service settings (only NEXT_PUBLIC_* reaches the browser).
 */

export interface PublicAzureConfig {
  endpoint: string;
  /** Fallback only: managed identity is used first when the App Service has one. */
  apiKey?: string;
  chatDeployment?: string;
}

/** GPT-Live (the Live API) for voice, on Timmie's own Azure OpenAI resource. */
export interface PublicLiveConfig {
  provider: 'azure';
  /** REST base on the unversioned v1 surface: https://<resource>.openai.azure.com/openai/v1. */
  base: string;
  /** The gpt-live-1 deployment, sent as the session's model. */
  model: string;
  /** Fallback only: managed identity is used first when the App Service has one. */
  apiKey?: string;
  voice: string;
}

/**
 * Timmie's voice: `vesper`, a male GPT-Live voice that sounds British (RP). The GPT-Live
 * voices are aster, beacon, cinder, marin, stone and vesper; Bookie's `cedar` is not one.
 */
export const DEFAULT_VOICE = 'vesper';

const env = (name: string) => process.env[name]?.trim() || undefined;
const isProduction = () => process.env.NODE_ENV === 'production';

/** Kill switch: PUBLIC_TIMMIE_ENABLED=false hides the launcher and makes every route 503. */
export function publicTimmieEnabled(): boolean {
  return (process.env.PUBLIC_TIMMIE_ENABLED ?? 'true').trim().toLowerCase() !== 'false';
}

/** PUBLIC_TIMMIE_DISABLE_AI=1 (tests): no model calls; chat answers with a canned reply. */
export function publicAiDisabled(): boolean {
  return process.env.PUBLIC_TIMMIE_DISABLE_AI === '1';
}

// ---- Secrets --------------------------------------------------------------

const DEV_DEFAULTS =
  /^(change[-_ ]?me|changeme|secret|password|dev|development|test|example|placeholder|x+|0+)$/i;

/**
 * Why the signing secret can't be used, or undefined when it's fine. In production a
 * missing, short (< 32 characters), placeholder or single-character secret disables the
 * helper (with a logged reason) rather than silently signing with a throwaway key.
 */
export function secretProblem(): string | undefined {
  const secret = process.env.PUBLIC_TIMMIE_SECRET ?? '';
  if (!isProduction()) return undefined;
  if (!secret) return 'PUBLIC_TIMMIE_SECRET is not set';
  if (secret.length < 32) return 'PUBLIC_TIMMIE_SECRET is shorter than 32 characters';
  if (DEV_DEFAULTS.test(secret) || new Set(secret).size < 8) {
    return 'PUBLIC_TIMMIE_SECRET looks like a placeholder';
  }
  return undefined;
}

// ---- Azure OpenAI ---------------------------------------------------------

/** Only Azure OpenAI hosts may receive the key. */
export function isAzureOpenAiEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      /\.(openai\.azure\.com|cognitiveservices\.azure\.com|services\.ai\.azure\.com)$/.test(
        url.hostname
      )
    );
  } catch {
    return false;
  }
}

/** App Service's managed identity, when the app has one (set by the platform). */
export function hasManagedIdentity(): boolean {
  return !!(process.env.IDENTITY_ENDPOINT && process.env.IDENTITY_HEADER);
}

/** The public chat resource, or undefined when it isn't (validly) configured. */
export function publicAzureConfig(): PublicAzureConfig | undefined {
  const endpoint = env('PUBLIC_AZURE_OPENAI_ENDPOINT');
  const apiKey = env('PUBLIC_AZURE_OPENAI_API_KEY');
  if (!endpoint || !isAzureOpenAiEndpoint(endpoint)) return undefined;
  if (!apiKey && !hasManagedIdentity()) return undefined;
  return {
    endpoint: new URL(endpoint).origin,
    apiKey,
    chatDeployment: env('PUBLIC_TIMMIE_CHAT_DEPLOYMENT'),
  };
}

/**
 * GPT-Live for voice: Azure only (every KnowAll agent uses the Azure OpenAI API, never the
 * OpenAI API), on Timmie's own resource and the unversioned v1 surface, the only one Azure
 * serves GPT-Live on. Missing or invalid settings fail closed: voice shows as unavailable.
 */
export function publicLiveConfig(): PublicLiveConfig | undefined {
  const endpoint = env('PUBLIC_LIVE_ENDPOINT');
  const deployment = env('PUBLIC_LIVE_DEPLOYMENT');
  const apiKey = env('PUBLIC_LIVE_API_KEY');
  const voice = env('PUBLIC_TIMMIE_VOICE') ?? DEFAULT_VOICE;
  if (!/^[a-z][a-z0-9_-]{1,31}$/.test(voice)) return undefined;
  if (!endpoint || !deployment || !isAzureOpenAiEndpoint(endpoint)) return undefined;
  if (!/^[\w.-]{1,64}$/.test(deployment)) return undefined;
  if (!apiKey && !hasManagedIdentity()) return undefined;
  return {
    provider: 'azure',
    base: `${new URL(endpoint).origin}/openai/v1`,
    model: deployment,
    apiKey,
    voice,
  };
}

// ---- Front Door and origins -----------------------------------------------

/** The Azure Front Door profile id (X-Azure-FDID) whose X-Azure-SocketIP we trust. */
export function frontDoorId(): string | undefined {
  return env('PUBLIC_FRONT_DOOR_ID') ?? env('FRONT_DOOR_ID');
}

/** Extra site origins allowed to call /api/public/* (staging slots and the like). */
export function extraAllowedOrigins(): string[] {
  return (process.env.PUBLIC_TIMMIE_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim().replace(/\/$/, ''))
    .filter(Boolean);
}

// ---- Bot check ------------------------------------------------------------

/** Turnstile is used when both keys are set; otherwise the proof-of-work check. */
export function turnstileKeys(): { siteKey: string; secret: string } | undefined {
  const siteKey = env('PUBLIC_TURNSTILE_SITE_KEY');
  const secret = env('PUBLIC_TURNSTILE_SECRET');
  return siteKey && secret ? { siteKey, secret } : undefined;
}

const bitsFrom = (value: string | undefined, fallback: number) => {
  const bits = Number(value ?? fallback);
  return Number.isInteger(bits) && bits >= 8 && bits <= 24 ? bits : fallback;
};

/**
 * Proof-of-work difficulty in leading zero bits (about 2^bits SHA-256 hashes in the
 * browser): 16 for a chat pass, and harder, 18 by default, for a voice pass.
 */
export function powBits(purpose: 'chat' | 'voice' = 'chat'): number {
  const chat = bitsFrom(process.env.PUBLIC_TIMMIE_POW_BITS, 16);
  if (purpose === 'chat') return chat;
  return Math.max(chat, bitsFrom(process.env.PUBLIC_TIMMIE_VOICE_POW_BITS, 18));
}
