import { describe, it, expect } from 'vitest';
import {
  INTERNAL_CLIENT,
  UNKNOWN_CLIENT,
  filterPersonHours,
  getHoursByProject,
  getReportFilterOptions,
  getReportProject,
  getReportProjects,
  isReportFilterActive,
  matchesReportFilter,
  selectReportClients,
  toggleFilterValue,
  describeFilterSelection,
  describeReportFilters,
  NO_REPORT_FILTER,
} from '@/utils/reportFilters';
import { getPersonHours } from '@/utils/teamHours';
import type { BCResource, BCTimeSheetDetail, BCTimeSheetLine } from '@/types';

// CRONUS UK Ltd.-style demo projects
const projectsByNumber = new Map([
  [
    'PR-CONTOSO',
    {
      displayName: 'Contoso Website',
      billToCustomerNo: 'C10000',
      billToCustomerName: 'Contoso Ltd.',
    },
  ],
  [
    'PR-FABRIKAM',
    {
      displayName: 'Fabrikam Rollout',
      billToCustomerNo: 'C20000',
      billToCustomerName: 'Fabrikam, Inc.',
    },
  ],
  [
    'PR-FABRIKAM-2',
    { displayName: 'Fabrikam Support', billToCustomerNo: 'C20000', billToCustomerName: '' },
  ],
  [
    'INT-ADMIN',
    { displayName: 'Admin', billToCustomerNo: 'C99999', billToCustomerName: 'CRONUS - Internal' },
  ],
  [
    'INT-SELF',
    {
      displayName: 'Training',
      billToCustomerNo: 'C00001',
      billToCustomerName: 'CRONUS UK Ltd.',
      billToIsCompany: true,
    },
  ],
  ['INT-NONE', { displayName: 'Holidays', billToCustomerNo: '' }],
]);

const resource: BCResource = {
  id: 'id-R1',
  number: 'R1',
  name: 'Alex Contoso',
  type: 'Person',
  useTimeSheet: true,
  timeSheetOwnerUserId: 'ALEX',
};

const line = (lineNo: number, jobNo: string, status: BCTimeSheetLine['status']): BCTimeSheetLine =>
  ({
    id: `line-${lineNo}`,
    timeSheetNo: 'TS1',
    lineNo,
    type: 'Job',
    jobNo,
    jobTaskNo: '1000',
    status,
    chargeable: true,
  }) as BCTimeSheetLine;

const detail = (
  lineNo: number,
  date: string,
  quantity: number,
  postedQuantity = 0
): BCTimeSheetDetail =>
  ({
    id: `d-${lineNo}-${date}`,
    timeSheetNo: 'TS1',
    timeSheetLineNo: lineNo,
    date,
    quantity,
    postedQuantity,
  }) as BCTimeSheetDetail;

const week = { from: '2026-10-05', to: '2026-10-11' };

// A week across every stage, on three projects
const alex = getPersonHours(
  resource,
  37.5,
  [
    {
      lines: [
        line(10000, 'PR-CONTOSO', 'Open'),
        line(20000, 'PR-CONTOSO', 'Approved'),
        line(30000, 'PR-FABRIKAM', 'Submitted'),
        line(40000, 'INT-ADMIN', 'Approved'),
        line(50000, 'PR-FABRIKAM', 'Rejected'),
      ],
      details: [
        detail(10000, '2026-10-05', 3),
        detail(20000, '2026-10-06', 5, 2),
        detail(20000, '2026-10-07', 1.5, 1.5),
        detail(30000, '2026-10-07', 4),
        detail(40000, '2026-10-08', 2),
        detail(50000, '2026-10-09', 1),
      ],
    },
  ],
  projectsByNumber,
  week
);

describe('getReportProject', () => {
  it("uses the bill-to customer as the client, and the customer's number without a name", () => {
    expect(getReportProject('PR-CONTOSO', projectsByNumber.get('PR-CONTOSO'))).toEqual({
      number: 'PR-CONTOSO',
      name: 'Contoso Website',
      client: { id: 'customer:C10000', name: 'Contoso Ltd.' },
    });
    expect(getReportProject('PR-FABRIKAM-2', projectsByNumber.get('PR-FABRIKAM-2')).client).toEqual(
      { id: 'customer:C20000', name: 'C20000' }
    );
  });

  it('groups internal projects under Internal, as the billable rule does', () => {
    for (const number of ['INT-ADMIN', 'INT-SELF', 'INT-NONE']) {
      expect(getReportProject(number, projectsByNumber.get(number)).client).toBe(INTERNAL_CLIENT);
    }
  });

  it("names a project that isn't in the list by its fallback name or number", () => {
    expect(getReportProject('PR-OLD', undefined, 'Old Contoso Project')).toEqual({
      number: 'PR-OLD',
      name: 'Old Contoso Project',
      client: UNKNOWN_CLIENT,
    });
    expect(getReportProject('PR-OLD').name).toBe('PR-OLD');
  });
});

describe('per-entry stages', () => {
  it("add up to the person's stage totals, with posted and rejected hours as on the Team page", () => {
    const sum = alex.entries.reduce(
      (s, e) => ({
        posted: s.posted + e.stages.posted,
        approved: s.approved + e.stages.approved,
        submitted: s.submitted + e.stages.submitted,
        unsubmitted: s.unsubmitted + e.stages.unsubmitted,
        total: s.total + e.stages.total,
      }),
      { posted: 0, approved: 0, submitted: 0, unsubmitted: 0, total: 0 }
    );
    expect(sum).toEqual(alex.stages);
    expect(alex.stages).toEqual({
      posted: 3.5,
      approved: 5,
      submitted: 4,
      unsubmitted: 3,
      total: 16.5,
    });
    for (const entry of alex.entries) expect(entry.stages.total).toBe(entry.hours);
  });
});

describe('getHoursByProject', () => {
  it("splits each project's hours by stage, adding up to the same total hours", () => {
    const rows = getHoursByProject(alex.entries);
    expect(rows.map((r) => r.projectNo)).toEqual(['PR-CONTOSO', 'PR-FABRIKAM', 'INT-ADMIN']);
    const contoso = rows[0];
    expect(contoso.hours).toBe(9.5);
    expect(contoso.stages).toEqual({
      posted: 3.5,
      approved: 3,
      submitted: 0,
      unsubmitted: 3,
      total: 9.5,
    });
    // Rejected hours count in the total, but in no stage
    expect(rows[1].stages).toMatchObject({ submitted: 4, total: 5 });
    expect(rows[2]).toMatchObject({ hours: 2, billableHours: 0 });
    for (const row of rows) expect(row.stages.total).toBe(row.hours);
    expect(rows.reduce((sum, r) => sum + r.hours, 0)).toBe(alex.stages.total);
  });
});

describe('filtering', () => {
  const projects = getReportProjects(alex.entries, projectsByNumber);

  const matching = (filter: { clientIds: string[]; projectNos: string[] }) =>
    alex.entries.filter((e) => matchesReportFilter(e, filter, projects)).map((e) => e.projectId);

  it('matches entries by client and by project', () => {
    expect(matching({ clientIds: ['customer:C20000'], projectNos: [] })).toHaveLength(2);
    expect(matching({ clientIds: [INTERNAL_CLIENT.id], projectNos: [] })).toEqual(['INT-ADMIN']);
    const project = { clientIds: [], projectNos: ['PR-CONTOSO'] };
    expect(matching(project)).toHaveLength(3);
    expect(matching({ clientIds: [], projectNos: [] })).toHaveLength(alex.entries.length);
    expect(isReportFilterActive(NO_REPORT_FILTER)).toBe(false);
    expect(isReportFilterActive(project)).toBe(true);
  });

  it('matches any picked client or project, and both filters together', () => {
    // Either client
    expect(
      matching({ clientIds: ['customer:C10000', INTERNAL_CLIENT.id], projectNos: [] })
    ).toEqual(['PR-CONTOSO', 'PR-CONTOSO', 'PR-CONTOSO', 'INT-ADMIN']);
    // Either project
    expect(matching({ clientIds: [], projectNos: ['PR-CONTOSO', 'PR-FABRIKAM'] })).toHaveLength(5);
    // One of the clients and one of the projects
    expect(
      matching({
        clientIds: ['customer:C10000', 'customer:C20000'],
        projectNos: ['PR-FABRIKAM', 'INT-ADMIN'],
      })
    ).toEqual(['PR-FABRIKAM', 'PR-FABRIKAM']);
    // None of these projects is Unknown client's
    expect(matching({ clientIds: [UNKNOWN_CLIENT.id], projectNos: [] })).toEqual([]);
  });

  it('toggles a value in and out of the picks', () => {
    expect(toggleFilterValue([], 'a')).toEqual(['a']);
    expect(toggleFilterValue(['a', 'b'], 'c')).toEqual(['a', 'b', 'c']);
    expect(toggleFilterValue(['a', 'b'], 'a')).toEqual(['b']);
  });

  it("restricts a person's stages and billable hours to the entries kept", () => {
    const contoso = filterPersonHours(alex, (e) => e.projectId === 'PR-CONTOSO');
    expect(contoso.entries).toHaveLength(3);
    expect(contoso.stages.total).toBe(9.5);
    expect(contoso.billableHours).toBe(9.5);
    expect(contoso.capacity).toBe(37.5);
    // Nothing filtered out: the same person
    expect(filterPersonHours(alex, () => true)).toBe(alex);
  });

  it("keeps the projects of the clients picked, and drops other clients'", () => {
    const filter = { clientIds: [], projectNos: ['PR-CONTOSO', 'PR-FABRIKAM'] };
    expect(selectReportClients(filter, ['customer:C10000'], projects)).toEqual({
      clientIds: ['customer:C10000'],
      projectNos: ['PR-CONTOSO'],
    });
    expect(selectReportClients(filter, ['customer:C20000'], projects)).toEqual({
      clientIds: ['customer:C20000'],
      projectNos: ['PR-FABRIKAM'],
    });
    // Both clients: both projects stay
    expect(selectReportClients(filter, ['customer:C10000', 'customer:C20000'], projects)).toEqual({
      clientIds: ['customer:C10000', 'customer:C20000'],
      projectNos: filter.projectNos,
    });
    // Dropping a client drops its projects
    const both = {
      clientIds: ['customer:C10000', 'customer:C20000'],
      projectNos: filter.projectNos,
    };
    expect(selectReportClients(both, ['customer:C20000'], projects).projectNos).toEqual([
      'PR-FABRIKAM',
    ]);
    expect(selectReportClients(filter, [INTERNAL_CLIENT.id], projects).projectNos).toEqual([]);
    // No clients: every project stays
    expect(selectReportClients(filter, [], projects)).toEqual(filter);
  });

  it('describes the picks: everything, the names, or how many', () => {
    expect(describeFilterSelection([], 'All Clients', 'clients')).toBe('All Clients');
    expect(describeFilterSelection(['Contoso Ltd.'], 'All Clients', 'clients')).toBe(
      'Contoso Ltd.'
    );
    expect(describeFilterSelection(['Contoso Ltd.', 'Fabrikam, Inc.'], 'All', 'clients')).toBe(
      '2 clients'
    );
    expect(describeFilterSelection(['Contoso Ltd.', 'Fabrikam, Inc.'], 'All', 'clients', 2)).toBe(
      'Contoso Ltd., Fabrikam, Inc.'
    );
    expect(describeFilterSelection(['A', 'B', 'C'], 'All', 'resources', 2)).toBe('3 resources');
    expect(
      describeReportFilters({
        clients: ['Adatum Corporation', 'Trey Research'],
        projects: [],
        resources: ['Alex', 'Sam', 'Kim'],
      })
    ).toBe('Adatum Corporation, Trey Research · All projects · 3 resources');
    expect(
      describeReportFilters({ clients: [], projects: ['Contoso Website'], resources: [] })
    ).toBe('All clients · Contoso Website · All resources');
  });

  it('lists clients by name with Internal and Unknown last, and narrows projects to the client', () => {
    const all = [
      ...projects.values(),
      getReportProject('PR-OLD'),
      getReportProject('PR-ZETA', {
        displayName: 'Alpha',
        billToCustomerNo: 'C30000',
        billToCustomerName: 'Adatum Corporation',
      }),
    ];
    const options = getReportFilterOptions(all);
    expect(options.clients.map((c) => c.name)).toEqual([
      'Adatum Corporation',
      'Contoso Ltd.',
      'Fabrikam, Inc.',
      'Internal',
      'Unknown client',
    ]);
    expect(options.projects.map((p) => p.name)).toEqual([
      'Admin',
      'Alpha',
      'Contoso Website',
      'Fabrikam Rollout',
      'PR-OLD',
    ]);
    expect(getReportFilterOptions(all, ['customer:C20000']).projects.map((p) => p.number)).toEqual([
      'PR-FABRIKAM',
    ]);
    // Several clients: all their projects
    expect(
      getReportFilterOptions(all, [
        'customer:C20000',
        'customer:C30000',
        UNKNOWN_CLIENT.id,
      ]).projects.map((p) => p.number)
    ).toEqual(['PR-ZETA', 'PR-FABRIKAM', 'PR-OLD']);
    // The client list isn't narrowed
    expect(getReportFilterOptions(all, ['customer:C20000']).clients).toHaveLength(5);
  });

  it('names a client by its customer name even when another project only has the number', () => {
    const named = getReportProject('PR-A', {
      displayName: 'A',
      billToCustomerNo: 'C40000',
      billToCustomerName: 'Northwind Traders',
    });
    const numberOnly = getReportProject('PR-B', { displayName: 'B', billToCustomerNo: 'C40000' });
    for (const order of [
      [named, numberOnly],
      [numberOnly, named],
    ]) {
      expect(getReportFilterOptions(order).clients).toEqual([
        { id: 'customer:C40000', name: 'Northwind Traders' },
      ]);
    }
  });
});
