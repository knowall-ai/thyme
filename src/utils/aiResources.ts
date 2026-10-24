// AI usage is a cost, not hours. AI agents are BC resources with a unit price only (what's
// charged for their time); their real costs (AI tokens, compute) are posted to the client's
// project against a dedicated Machine resource, e.g. AI-USAGE: unit of measure in currency
// units, unit cost 1, unit price 0, non-chargeable. So a posted Resource entry is AI, not
// hours, when its resource is a Machine (resourceType, /jobCostEntries only) or one of the
// configured AI resources. Planning lines and timesheets have no resource type, so they're
// matched by the configured AI resources (THYME_AI_RESOURCES) only.

/** The default AI usage resource, when THYME_AI_RESOURCES isn't set */
export const DEFAULT_AI_RESOURCES = 'AI-USAGE';

/**
 * The configured AI resource numbers: THYME_AI_RESOURCES, comma-separated (default
 * AI-USAGE), upper case as BC stores Code fields
 */
export function getAiResourceNos(
  configured: string | undefined = process.env.THYME_AI_RESOURCES
): ReadonlySet<string> {
  const value = configured?.trim() ? configured : DEFAULT_AI_RESOURCES;
  return new Set(
    value
      .split(',')
      .map((no) => no.trim().toUpperCase())
      .filter(Boolean)
  );
}

/**
 * Whether a resource is AI usage, not someone's time: a Machine resource (resourceType from
 * /jobCostEntries, Thyme BC Extension 1.28.0.0+) or one of the configured AI resources
 */
export function isAiResource(
  resourceNo: string | undefined,
  resourceType?: string,
  aiResourceNos: ReadonlySet<string> = getAiResourceNos()
): boolean {
  if (resourceType === 'Machine') return true;
  return !!resourceNo && aiResourceNos.has(resourceNo.trim().toUpperCase());
}
