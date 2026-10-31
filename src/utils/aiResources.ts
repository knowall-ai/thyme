// AI usage is a cost, not hours. AI agents are BC resources with a unit price only (what's
// charged for their time); their real costs (AI tokens, compute) are posted to the client's
// project against a dedicated Machine resource, e.g. AI-USAGE: unit of measure in currency
// units, unit cost 1, unit price 0, non-chargeable. So a posted Resource entry is AI, not
// hours, when its resource is a Machine (resourceType, /jobCostEntries only) or one of the
// configured AI resources. Planning lines and timesheets have no resource type, so they're
// matched by the configured AI resources (THYME_AI_RESOURCES) only.

/** The default AI usage resource, when THYME_AI_RESOURCES isn't set */
export const DEFAULT_AI_RESOURCES = 'AI-USAGE';

// THYME_AI_RESOURCES as the server has it, loaded at runtime from /api/config (see
// loadAiResources), so changing the setting needs no rebuild. Undefined until loaded.
let runtimeAiResources: string | undefined;
let loading: Promise<void> | null = null;

/**
 * Load THYME_AI_RESOURCES from the server once per page load; later calls reuse it. Hours are
 * worked out after this resolves. If it can't be loaded, the default (AI-USAGE) applies.
 */
export function loadAiResources(fetcher: typeof fetch = fetch): Promise<void> {
  if (!loading) {
    loading = (async () => {
      try {
        const response = await fetcher('/api/config', { cache: 'no-store' });
        if (!response.ok) return;
        const config = (await response.json()) as { aiResources?: unknown };
        if (typeof config.aiResources === 'string') runtimeAiResources = config.aiResources;
      } catch {
        // Keep the default
      }
    })();
  }
  return loading;
}

/** Set (or with undefined, clear) the runtime THYME_AI_RESOURCES; for tests */
export function setAiResources(value: string | undefined): void {
  runtimeAiResources = value;
  loading = value === undefined ? null : Promise.resolve();
}

/**
 * The configured AI resource numbers: THYME_AI_RESOURCES, comma-separated (default
 * AI-USAGE), upper case as BC stores Code fields
 */
export function getAiResourceNos(
  configured: string | undefined = runtimeAiResources ?? process.env.THYME_AI_RESOURCES
): ReadonlySet<string> {
  const nos = (configured ?? '')
    .split(',')
    .map((no) => no.trim().toUpperCase())
    .filter(Boolean);
  // Blank, whitespace or only commas: the default, so AI usage is never counted as hours
  return new Set(nos.length > 0 ? nos : [DEFAULT_AI_RESOURCES]);
}

/**
 * Whether a resource is AI usage, not someone's time: a Machine resource (resourceType from
 * /jobCostEntries, Timmie BC Extension 1.28.0.0+) or one of the configured AI resources
 */
export function isAiResource(
  resourceNo: string | undefined,
  resourceType?: string,
  aiResourceNos: ReadonlySet<string> = getAiResourceNos()
): boolean {
  if (resourceType === 'Machine') return true;
  return !!resourceNo && aiResourceNos.has(resourceNo.trim().toUpperCase());
}
