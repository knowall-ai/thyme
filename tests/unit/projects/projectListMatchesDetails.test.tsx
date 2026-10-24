import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type {
  BCJobPlanningLine,
  BCTimeEntry,
  BCTimeSheet,
  BCTimeSheetDetail,
  BCTimeSheetLine,
  Project,
} from '@/types';

// One set of BC data (CRONUS-style demo names), served both per project (as the project
// page loads it) and company-wide (as the Projects list loads it)
const timesheets = [
  { number: 'TS001', resourceNo: 'R0010', startingDate: '2026-10-05' },
  // Over six months old: the list used to leave this time out
  { number: 'TS002', resourceNo: 'R0020', startingDate: '2025-01-06' },
  // A machine resource's timesheet: not a person, so not counted
  { number: 'TS003', resourceNo: 'M0001', startingDate: '2026-10-05' },
] as BCTimeSheet[];

const tsLine = (
  timeSheetNo: string,
  lineNo: number,
  jobNo: string,
  status: BCTimeSheetLine['status'],
  hours: number
): BCTimeSheetLine => ({
  id: `${timeSheetNo}-${lineNo}`,
  timeSheetNo,
  lineNo,
  type: 'Job',
  jobNo,
  jobTaskNo: '100',
  totalQuantity: hours,
  status,
  chargeable: true,
});
const timesheetLines = [
  tsLine('TS001', 10000, 'PR00010', 'Approved', 10),
  tsLine('TS001', 20000, 'PR00010', 'Submitted', 4),
  tsLine('TS002', 10000, 'PR00010', 'Open', 3),
  tsLine('TS002', 20000, 'PR00010', 'Rejected', 2),
  tsLine('TS003', 10000, 'PR00010', 'Approved', 8),
  tsLine('TS001', 30000, 'PR00020', 'Open', 6),
];
const timesheetDetails: BCTimeSheetDetail[] = timesheetLines.map((l) => ({
  id: `d-${l.id}`,
  timeSheetNo: l.timeSheetNo,
  timeSheetLineNo: l.lineNo,
  date: '2026-10-05',
  quantity: l.totalQuantity,
  jobNo: l.jobNo,
  // 6 of TS001's 10 approved hours have been posted
  postedQuantity: l.id === 'TS001-10000' ? 6 : 0,
}));

const timeEntries = [
  { id: 'e1', jobNo: 'PR00010', jobTaskNo: '100', quantity: 6, totalCost: 0, totalPrice: 0 },
] as BCTimeEntry[];

const planLine = (overrides: Partial<BCJobPlanningLine>): BCJobPlanningLine => ({
  id: 'pl',
  jobNo: 'PR00010',
  jobTaskNo: '100',
  lineNo: 10000,
  planningDate: '0001-01-01',
  lineType: 'Billable',
  type: 'Resource',
  number: 'R0010',
  description: 'Design work',
  quantity: 0,
  unitCost: 0,
  unitPrice: 0,
  totalCost: 0,
  totalPrice: 0,
  lastModifiedDateTime: '2026-10-05T00:00:00Z',
  ...overrides,
});
const planningLines = [
  // Estimate: 4 days of R0010 (7.5h days) + 10h of R0020 = 40h
  planLine({ quantity: 4, totalPrice: 3000 }),
  planLine({ lineType: 'Both Budget and Billable', number: 'R0020', quantity: 10 }),
  // The Plan, not the estimate: the list used to measure against this
  planLine({ lineType: 'Budget', quantity: 2 }),
  // Planned absence isn't part of the estimate
  planLine({ jobTaskNo: '900', number: 'R0020', quantity: 8 }),
  planLine({ type: 'Item', number: 'ITEM1', quantity: 1, totalPrice: 500 }),
  // The internal project's plan
  planLine({ jobNo: 'PR00020', lineType: 'Budget', number: 'R0020', quantity: 20 }),
];

const jobTasks: Record<string, { jobTaskNo: string; description: string }[]> = {
  PR00010: [
    { jobTaskNo: '100', description: 'Design' },
    { jobTaskNo: '900', description: 'Absence - Holiday' },
  ],
  PR00020: [{ jobTaskNo: '100', description: 'Training' }],
};

const forJob = <T extends { jobNo?: string }>(rows: T[], jobNo: string) =>
  rows.filter((r) => r.jobNo === jobNo);

const client = vi.hoisted(() => ({
  isExtensionInstalled: vi.fn(async () => true),
  getResources: vi.fn(),
  getTimeSheetsFrom: vi.fn(),
  getResourceUnitsOfMeasure: vi.fn(),
  // Per project (the project page)
  getTimeSheetLinesForJob: vi.fn(),
  getTimeSheetDetailsForJob: vi.fn(),
  getJobPlanningLines: vi.fn(),
  // No jobCostEntries (extension before 1.28.0.0): both use timeEntries
  getJobCostEntries: vi.fn(async () => null),
  getTimeEntries: vi.fn(),
  getJobTasks: vi.fn(),
  // Company-wide (the Projects list)
  getAllJobTimeSheetLines: vi.fn(),
  getAllJobTimeSheetDetails: vi.fn(),
  getAllTimeEntries: vi.fn(),
  getAllJobPlanningLines: vi.fn(),
  companyId: 'cronus',
  environment: 'sandbox',
}));
vi.mock('@/services/bc/bcClient', () => ({ bcClient: client }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useParams: () => ({}),
}));
vi.mock('@/components/projects/ProjectPlanDialog', () => ({ ProjectPlanDialog: () => null }));

import { projectDetailsService, type ProjectAnalytics } from '@/services/bc/projectDetailsService';
import { projectService } from '@/services/bc/projectService';
import { useProjectsStore } from '@/hooks/useProjectsStore';
import { useProjectDetailsStore } from '@/hooks/useProjectDetailsStore';
import { ProjectList } from '@/components/projects/ProjectList';
import { ProjectKPICards } from '@/components/projects/ProjectKPICards';
import { toStageHours } from '@/utils';

const project = (code: string, name: string, isInternal = false): Project => ({
  id: code,
  code,
  name,
  customerName: isInternal ? 'CRONUS UK Ltd.' : 'Contoso',
  isInternal,
  color: '#22c55e',
  status: 'active',
  isFavorite: false,
  tasks: jobTasks[code].map((t) => ({
    id: t.jobTaskNo,
    projectId: code,
    code: t.jobTaskNo,
    name: t.description,
    isBillable: !isInternal,
  })),
});
const projects = [project('PR00010', 'Contoso Website'), project('PR00020', 'Training', true)];

beforeEach(() => {
  vi.clearAllMocks();
  client.getResources.mockResolvedValue([
    { number: 'R0010', name: 'Designer' },
    { number: 'R0020', name: 'Developer' },
  ]);
  client.getTimeSheetsFrom.mockResolvedValue(timesheets);
  client.getResourceUnitsOfMeasure.mockResolvedValue([
    { resourceNo: 'R0010', code: 'HOUR', qtyPerUnitOfMeasure: 7.5 },
  ]);
  client.getTimeSheetLinesForJob.mockImplementation(async (job: string) =>
    forJob(timesheetLines, job)
  );
  client.getTimeSheetDetailsForJob.mockImplementation(async (job: string) =>
    forJob(timesheetDetails, job)
  );
  client.getJobPlanningLines.mockImplementation(async (job: string) => forJob(planningLines, job));
  client.getTimeEntries.mockImplementation(async (job: string) => forJob(timeEntries, job));
  client.getJobTasks.mockImplementation(async (job: string) => jobTasks[job] ?? []);
  client.getAllJobTimeSheetLines.mockResolvedValue(timesheetLines);
  client.getAllJobTimeSheetDetails.mockResolvedValue(timesheetDetails);
  client.getAllTimeEntries.mockResolvedValue(timeEntries);
  client.getAllJobPlanningLines.mockResolvedValue(planningLines);
});

// The project page's stage split, as its Time Spent card works it out
const detailStages = (analytics: ProjectAnalytics) =>
  toStageHours(
    {
      total: analytics.hoursSpent,
      approved: analytics.approvedHours,
      submitted: analytics.submittedHours,
      unsubmitted: analytics.unsubmittedHours,
    },
    analytics.timesheetPostedHours
  );

describe('Projects list figures match the project page', () => {
  it('gives a project the same time spent, stages, estimate and billing mode', async () => {
    const analytics = await projectDetailsService.getProjectAnalytics('PR00010');
    const figures = (await projectService.getProjectFigures(projects)).get('PR00010')!;

    // Old (6 months+) time counts; the machine's time doesn't
    expect(analytics.hoursSpent).toBe(19);
    expect(figures.timeByStage).toEqual(detailStages(analytics));
    expect(figures.timeByStage).toEqual({
      posted: 6,
      approved: 4,
      submitted: 4,
      unsubmitted: 3,
      total: 19,
    });
    // Measured against the estimate, not the Plan, and without planned absence
    expect(analytics.estimateHours).toBe(40);
    expect(figures.estimateHours).toBe(analytics.estimateHours);
    expect(figures.plannedHours).toBe(analytics.hoursPlanned);
    expect(figures.billingMode).toBe(analytics.billingMode);
    expect(figures.billingMode).toBe('Mixed');
  });

  it("keeps an internal project's planned time, as the project page does", async () => {
    const analytics = await projectDetailsService.getProjectAnalytics('PR00020', true);
    const figures = (await projectService.getProjectFigures(projects)).get('PR00020')!;

    expect(figures.timeByStage).toEqual(detailStages(analytics));
    expect(figures.plannedHours).toBe(analytics.hoursPlanned);
    expect(figures.plannedHours).toBe(20);
  });

  it('loads every project in a fixed number of requests', async () => {
    await projectService.getProjectFigures(projects);
    expect(client.getTimeSheetLinesForJob).not.toHaveBeenCalled();
    expect(client.getJobPlanningLines).not.toHaveBeenCalled();
    expect(client.getJobTasks).not.toHaveBeenCalled();
    expect(client.getAllJobTimeSheetLines).toHaveBeenCalledTimes(1);
    expect(client.getAllJobPlanningLines).toHaveBeenCalledTimes(1);
  });

  it('shows the same budget used on the list row as on the Time Spent card', async () => {
    // The project page
    const analytics = await projectDetailsService.getProjectAnalytics('PR00010');
    useProjectDetailsStore.setState({ project: projects[0], analytics, hiddenKpis: [] });
    const { unmount } = render(<ProjectKPICards />);
    expect(screen.getByText(/48% of 40/)).toBeInTheDocument();
    unmount();

    // The Projects list, loaded the way the page loads it
    useProjectsStore.setState({ projects, fetchProjects: vi.fn(async () => {}) });
    await useProjectsStore.getState().fetchProjectHours();
    render(<ProjectList />);

    const row = screen.getByText('Contoso Website').closest('tr')!;
    expect(within(row).getByText('40h')).toBeInTheDocument();
    expect(within(row).getByText('19.0h')).toBeInTheDocument();
    expect(within(row).getByText('21h (48%)')).toBeInTheDocument();
    // The bar's stages, for screen readers and as a tooltip
    expect(
      within(row).getByText('Posted 6.0h · Approved 4.0h · Submitted 4.0h · Unsubmitted 3.0h')
    ).toBeInTheDocument();
  });
});
