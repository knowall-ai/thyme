import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BCCompany } from '@/types';

// A controllable promise, so a test can finish loads in any order
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const ID_A = '00000000-0000-0000-0000-00000000000a';
const ID_B = '00000000-0000-0000-0000-00000000000b';

// bcClient's active company is what switchCompany changes (via setCompany)
const client = vi.hoisted(() => ({
  companyId: '00000000-0000-0000-0000-00000000000a',
  environment: 'production',
  setCompany(id: string, environment: string) {
    client.companyId = id;
    client.environment = environment;
  },
  setCompanyId: vi.fn(),
  getCompanyInfo: vi.fn(),
}));

const getProjectDetails = vi.fn();
const getProjectAnalytics = vi.fn();
const getBillingMode = vi.fn();
const getProjects = vi.fn();
const getWeekEntries = vi.fn();

vi.mock('@/services/bc/bcClient', () => ({ bcClient: client }));
vi.mock('@/services/bc/projectDetailsService', () => ({
  projectDetailsService: {
    getProjectDetails: (...args: unknown[]) => getProjectDetails(...args),
    getProjectAnalytics: (...args: unknown[]) => getProjectAnalytics(...args),
    getBillingMode: (...args: unknown[]) => getBillingMode(...args),
  },
}));
vi.mock('@/services/bc', () => ({
  bcClient: client,
  ExtensionNotInstalledError: class extends Error {},
  NoResourceError: class extends Error {},
  NoTimesheetError: class extends Error {},
  TimesheetNotEditableError: class extends Error {},
  timeEntryService: {
    getWeekEntries: (...args: unknown[]) => getWeekEntries(...args),
    getCurrentTimesheet: () => null,
  },
  projectService: {
    getProjects: (...args: unknown[]) => getProjects(...args),
    getProjectTasks: vi.fn().mockResolvedValue([]),
    getProjectHours: vi.fn().mockResolvedValue(new Map()),
    getProjectBudgets: vi.fn().mockResolvedValue(new Map()),
  },
}));

import { switchCompany } from '@/hooks/companySwitch';
import { useCompanyStore } from '@/hooks/useCompanyStore';
import { usePlanStore } from '@/hooks/usePlanStore';
import { useProjectDetailsStore } from '@/hooks/useProjectDetailsStore';
import { useProjectsStore } from '@/hooks/useProjectsStore';
import { useTimeEntriesStore } from '@/hooks/useTimeEntriesStore';

const companyA: BCCompany = {
  id: ID_A,
  name: 'Contoso',
  displayName: 'Contoso',
  environment: 'production',
};
const companyB: BCCompany = {
  id: ID_B,
  name: 'Contoso Two',
  displayName: 'Contoso Two',
  environment: 'production',
};

const projectFrom = (company: string) => ({
  project: { id: `${company}-id`, code: 'PR00100', name: `${company} project` },
  tasks: [],
});

beforeEach(() => {
  vi.clearAllMocks();
  client.setCompany(ID_A, 'production');
  client.getCompanyInfo.mockResolvedValue({ currencyCode: 'GBP' });
  useCompanyStore.setState({ selectedCompany: companyA, companyVersion: 0 });
  useProjectDetailsStore.getState().clearProject();
  useProjectsStore.getState().clearProjects();
});

describe('project details across a company switch', () => {
  it("doesn't let company B's PR00100 join company A's load still in flight", async () => {
    const loadA = deferred<ReturnType<typeof projectFrom>>();
    const loadB = deferred<ReturnType<typeof projectFrom>>();
    getProjectDetails.mockReturnValueOnce(loadA.promise).mockReturnValueOnce(loadB.promise);
    getProjectAnalytics.mockResolvedValue({ hours: 1 });

    const fetchA = useProjectDetailsStore.getState().fetchProjectDetails('PR00100');
    switchCompany(companyB);
    const fetchB = useProjectDetailsStore.getState().fetchProjectDetails('PR00100');

    // B started its own load rather than joining A's
    expect(getProjectDetails).toHaveBeenCalledTimes(2);

    // B finishes first, then A's late result arrives
    loadB.resolve(projectFrom('B'));
    await fetchB;
    loadA.resolve(projectFrom('A'));
    await fetchA;

    expect(useProjectDetailsStore.getState().project?.name).toBe('B project');
  });

  it("drops A's result when it lands after switching to B", async () => {
    const loadA = deferred<ReturnType<typeof projectFrom>>();
    getProjectDetails.mockReturnValueOnce(loadA.promise);

    const fetchA = useProjectDetailsStore.getState().fetchProjectDetails('PR00100');
    switchCompany(companyB);
    loadA.resolve(projectFrom('A'));
    await fetchA;

    expect(useProjectDetailsStore.getState().project).toBeNull();
    expect(useProjectDetailsStore.getState().isLoading).toBe(false);
  });
});

describe('project details after switching away and back (A -> B -> A)', () => {
  it("starts a fresh load instead of joining the first visit's, and ignores its late result", async () => {
    getProjectDetails.mockResolvedValue(projectFrom('A'));
    const firstAnalytics = deferred<{ hours: number }>();
    getProjectAnalytics
      .mockReturnValueOnce(firstAnalytics.promise)
      .mockResolvedValueOnce({ hours: 2 });

    // First visit: the project loads, its analytics are still pending
    const firstVisit = useProjectDetailsStore.getState().fetchProjectDetails('PR00100');
    await vi.waitFor(() => expect(useProjectDetailsStore.getState().project).not.toBeNull());

    switchCompany(companyB);
    switchCompany(companyA);

    // Second visit to A loads again rather than joining the first visit's promise
    await useProjectDetailsStore.getState().fetchProjectDetails('PR00100');
    expect(getProjectDetails).toHaveBeenCalledTimes(2);

    // The first visit's analytics arrive late and are dropped
    firstAnalytics.resolve({ hours: 1 });
    await firstVisit;

    const state = useProjectDetailsStore.getState();
    expect(state.project?.name).toBe('A project');
    expect(state.analytics).toEqual({ hours: 2 });
  });
});

describe('projects list across a company switch', () => {
  it("drops company A's list when it lands after switching to B", async () => {
    const loadA = deferred<{ id: string; code: string }[]>();
    getProjects.mockReturnValueOnce(loadA.promise);

    const fetchA = useProjectsStore.getState().fetchProjects();
    switchCompany(companyB);
    loadA.resolve([{ id: 'a1', code: 'PR00100' }]);
    await fetchA;

    expect(useProjectsStore.getState().projects).toEqual([]);
  });

  it("clears billing badges on switch and doesn't keep A's in-flight ones", async () => {
    useProjectsStore.setState({ billingModes: new Map([['PR00100', 'Fixed Price']]) });
    const modeA = deferred<string>();
    getBillingMode.mockReturnValueOnce(modeA.promise);

    const fetchA = useProjectsStore.getState().fetchBillingModes(['PR00200']);
    switchCompany(companyB);
    expect(useProjectsStore.getState().billingModes.size).toBe(0);

    modeA.resolve('T&M');
    await fetchA;
    expect(useProjectsStore.getState().billingModes.size).toBe(0);

    // B fetches its own mode for the same project code rather than reusing A's
    getBillingMode.mockResolvedValueOnce('Mixed');
    await useProjectsStore.getState().fetchBillingModes(['PR00100']);
    expect(useProjectsStore.getState().billingModes.get('PR00100')).toBe('Mixed');
  });
});

describe('time entries across a company switch', () => {
  it("drops company A's week when it lands after switching to B", async () => {
    const weekA = deferred<{ id: string }[]>();
    getWeekEntries.mockReturnValueOnce(weekA.promise);

    const fetchA = useTimeEntriesStore.getState().fetchWeekEntries('user@contoso.com');
    switchCompany(companyB);
    expect(useTimeEntriesStore.getState().isLoading).toBe(false);

    weekA.resolve([{ id: 'a-entry' }]);
    await fetchA;

    expect(useTimeEntriesStore.getState().entries).toEqual([]);
  });
});

describe('plan across a company switch', () => {
  it("resets the displayed plan and its cache so B never shows A's plan", () => {
    usePlanStore.setState({
      teamMembers: [{ id: 'm1' } as never],
      projects: [{ id: 'p1' } as never],
      allAllocations: [{ id: 'x1' } as never],
      cache: { resources: [] } as never,
      selectedAllocationId: 'x1',
    });

    switchCompany(companyB);

    const plan = usePlanStore.getState();
    expect(plan.teamMembers).toEqual([]);
    expect(plan.projects).toEqual([]);
    expect(plan.allAllocations).toEqual([]);
    expect(plan.cache).toBeNull();
    expect(plan.selectedAllocationId).toBeNull();
  });
});
