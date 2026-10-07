import { describe, it, expect } from 'vitest';
import {
  DEFAULT_PROJECT_STATUSES,
  filterProjectsByStatus,
  isDefaultProjectStatuses,
  projectStatusSummary,
  toggleProjectStatus,
  type ProjectStatus,
} from '@/utils/projectStatusFilter';

const projects: { id: string; status: ProjectStatus }[] = [
  { id: 'a', status: 'active' },
  { id: 'b', status: 'completed' },
  { id: 'c', status: 'archived' },
  { id: 'd', status: 'active' },
];

describe('filterProjectsByStatus', () => {
  it('defaults to Active only', () => {
    expect(filterProjectsByStatus(projects, DEFAULT_PROJECT_STATUSES).map((p) => p.id)).toEqual([
      'a',
      'd',
    ]);
  });

  it('supports multiple statuses', () => {
    const ids = filterProjectsByStatus(projects, ['active', 'completed']).map((p) => p.id);
    expect(ids).toEqual(['a', 'b', 'd']);
  });

  it('includes archived only when selected', () => {
    expect(filterProjectsByStatus(projects, ['archived']).map((p) => p.id)).toEqual(['c']);
    expect(filterProjectsByStatus(projects, ['active', 'completed', 'archived'])).toHaveLength(4);
  });

  it('returns nothing for an empty selection', () => {
    expect(filterProjectsByStatus(projects, [])).toEqual([]);
  });
});

describe('toggleProjectStatus', () => {
  it('adds a missing status in canonical order', () => {
    expect(toggleProjectStatus(['archived'], 'active')).toEqual(['active', 'archived']);
  });

  it('removes a selected status, allowing an empty selection', () => {
    expect(toggleProjectStatus(['active', 'completed'], 'completed')).toEqual(['active']);
    expect(toggleProjectStatus(['active'], 'active')).toEqual([]);
  });
});

describe('projectStatusSummary', () => {
  it('summarises without truncation-prone text', () => {
    expect(projectStatusSummary(['active'])).toBe('Active');
    expect(projectStatusSummary(['completed', 'active'])).toBe('Active, Completed');
    expect(projectStatusSummary(['active', 'completed', 'archived'])).toBe('All statuses');
    expect(projectStatusSummary([])).toBe('No statuses');
  });
});

describe('isDefaultProjectStatuses', () => {
  it('is true only for Active only', () => {
    expect(isDefaultProjectStatuses(['active'])).toBe(true);
    expect(isDefaultProjectStatuses(['active', 'completed'])).toBe(false);
    expect(isDefaultProjectStatuses([])).toBe(false);
  });
});
