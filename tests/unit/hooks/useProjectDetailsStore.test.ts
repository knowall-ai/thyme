import { describe, it, expect, vi, beforeEach } from 'vitest';

const updateProjectName = vi.fn();
const clearPlanCache = vi.fn();
const getProjectDetails = vi.fn();
const getProjectAnalytics = vi.fn();

vi.mock('@/services/bc/bcClient', () => ({
  bcClient: {
    updateProjectName: (...args: unknown[]) => updateProjectName(...args),
    getCompanyInfo: vi.fn(async () => ({ currencyCode: 'GBP' })),
  },
}));

vi.mock('@/services/bc/projectDetailsService', () => ({
  projectDetailsService: {
    getProjectDetails: (...args: unknown[]) => getProjectDetails(...args),
    getProjectAnalytics: (...args: unknown[]) => getProjectAnalytics(...args),
  },
}));

vi.mock('@/hooks/usePlanStore', () => ({
  usePlanStore: { getState: () => ({ clearCache: clearPlanCache }) },
}));

vi.mock('@/hooks/useProjectsStore', async () => {
  const { create } = await import('zustand');
  return {
    useProjectsStore: create(() => ({ projects: [], selectedProject: null })),
  };
});

import {
  useProjectDetailsStore,
  PROJECT_NAME_MAX_LENGTH,
  ProjectRenamePermissionError,
} from '@/hooks/useProjectDetailsStore';
import { useProjectsStore } from '@/hooks/useProjectsStore';
import type { Project } from '@/types';

const project = (id: string, code: string, name: string): Project => ({
  id,
  code,
  name,
  color: '#000000',
  status: 'active',
  isFavorite: false,
  tasks: [],
});

describe('useProjectDetailsStore.renameProject', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    useProjectDetailsStore.setState({ project: project('p1', 'PR0001', 'Contoso Website') });
    useProjectsStore.setState({
      projects: [project('p1', 'PR0001', 'Contoso Website'), project('p2', 'PR0002', 'Other')],
      selectedProject: project('p1', 'PR0001', 'Contoso Website'),
    });
  });

  it('saves the trimmed name and updates the details, the projects list and the plan', async () => {
    updateProjectName.mockResolvedValue({
      id: 'p1',
      number: 'PR0001',
      displayName: 'Contoso Portal',
    });

    await useProjectDetailsStore.getState().renameProject('  Contoso Portal  ');

    expect(updateProjectName).toHaveBeenCalledWith('p1', 'Contoso Portal');
    expect(useProjectDetailsStore.getState().project?.name).toBe('Contoso Portal');
    const { projects, selectedProject } = useProjectsStore.getState();
    expect(projects.map((p) => p.name)).toEqual(['Contoso Portal', 'Other']);
    expect(selectedProject?.name).toBe('Contoso Portal');
    expect(clearPlanCache).toHaveBeenCalled();
  });

  it('rejects an empty name without calling Business Central', async () => {
    await expect(useProjectDetailsStore.getState().renameProject('   ')).rejects.toThrow(
      'Project name cannot be empty'
    );
    expect(updateProjectName).not.toHaveBeenCalled();
  });

  it('rejects a name longer than BC allows', async () => {
    const tooLong = 'a'.repeat(PROJECT_NAME_MAX_LENGTH + 1);
    await expect(useProjectDetailsStore.getState().renameProject(tooLong)).rejects.toThrow(
      `${PROJECT_NAME_MAX_LENGTH} characters`
    );
    expect(updateProjectName).not.toHaveBeenCalled();
  });

  it('skips the save when the name is unchanged', async () => {
    await useProjectDetailsStore.getState().renameProject('Contoso Website ');
    expect(updateProjectName).not.toHaveBeenCalled();
  });

  it('explains a permission refusal and keeps the original name', async () => {
    updateProjectName.mockRejectedValue(
      new Error('BC Custom API Error (403): {"error":{"code":"Forbidden"}}')
    );

    await expect(useProjectDetailsStore.getState().renameProject('Contoso Portal')).rejects.toThrow(
      "You don't have permission to rename projects in Business Central"
    );
    await expect(
      useProjectDetailsStore.getState().renameProject('Contoso Portal')
    ).rejects.toBeInstanceOf(ProjectRenamePermissionError);
    expect(useProjectDetailsStore.getState().project?.name).toBe('Contoso Website');
    expect(useProjectsStore.getState().projects[0].name).toBe('Contoso Website');
  });

  it('recognises a permission error BC reports in its message', async () => {
    updateProjectName.mockRejectedValue(
      new Error(
        'BC Custom API Error (400): You do not have the following permissions on TableData Job: Modify'
      )
    );

    await expect(useProjectDetailsStore.getState().renameProject('Contoso Portal')).rejects.toThrow(
      "You don't have permission"
    );
  });

  it('reports other failures generically', async () => {
    updateProjectName.mockRejectedValue(new Error('BC Custom API Error (500): boom'));

    await expect(useProjectDetailsStore.getState().renameProject('Contoso Portal')).rejects.toThrow(
      'Failed to rename the project in Business Central'
    );
    expect(useProjectDetailsStore.getState().project?.name).toBe('Contoso Website');
  });
});

describe('useProjectDetailsStore.fetchProjectDetails', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getProjectDetails.mockResolvedValue({ project: { code: 'PR001' }, tasks: [] });
    getProjectAnalytics.mockResolvedValue({ futurePlannedHours: 8 });
    useProjectDetailsStore.getState().clearProject();
  });

  it('skips refetching the project already loaded', async () => {
    await useProjectDetailsStore.getState().fetchProjectDetails('PR001');
    await useProjectDetailsStore.getState().fetchProjectDetails('PR001');

    expect(getProjectAnalytics).toHaveBeenCalledTimes(1);
  });

  it('refetches when forced, without taking the page down', async () => {
    await useProjectDetailsStore.getState().fetchProjectDetails('PR001');
    getProjectAnalytics.mockResolvedValue({ futurePlannedHours: 16 });

    const loadingStates: boolean[] = [];
    const unsubscribe = useProjectDetailsStore.subscribe((s) => loadingStates.push(s.isLoading));
    await useProjectDetailsStore.getState().fetchProjectDetails('PR001', { force: true });
    unsubscribe();

    expect(getProjectAnalytics).toHaveBeenCalledTimes(2);
    expect(useProjectDetailsStore.getState().analytics?.futurePlannedHours).toBe(16);
    expect(loadingStates).not.toContain(true);
  });
});
