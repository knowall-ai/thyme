import type { Project } from '@/types';

/**
 * Orders projects alphabetically by name (case-insensitive, numbers in natural
 * order), falling back to the project number when two names match.
 */
export function compareProjectsByName(
  a: Pick<Project, 'name' | 'code'>,
  b: Pick<Project, 'name' | 'code'>
): number {
  return (
    (a.name ?? '').localeCompare(b.name ?? '', undefined, { sensitivity: 'base', numeric: true }) ||
    (a.code ?? '').localeCompare(b.code ?? '', undefined, { numeric: true })
  );
}
