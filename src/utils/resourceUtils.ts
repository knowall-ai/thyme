import type { BCResource } from '@/types';

/**
 * Human-readable label for a BC resource.
 *
 * Resources expose `name` (the BC field) and sometimes `displayName` (a
 * compatibility alias); fall back to the resource `number` so the label is
 * never empty. Shared so the teammate dropdown, the read-only banner and the
 * dashboard header all render the same thing.
 */
export function getResourceDisplayName(
  resource: Pick<BCResource, 'name' | 'displayName' | 'number'>
): string {
  return resource.name || resource.displayName || resource.number;
}

/**
 * Single-character avatar initial for a BC resource, derived from its label.
 */
export function getResourceInitial(
  resource: Pick<BCResource, 'name' | 'displayName' | 'number'>
): string {
  return getResourceDisplayName(resource).charAt(0) || '?';
}
