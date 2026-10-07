import { describe, it, expect } from 'vitest';
import { buildCsv, buildCsvRows } from '@/utils/csvExport';
import type { Project, TimeEntry } from '@/types';

const projects: Project[] = [
  {
    id: '11111111-aaaa-bbbb-cccc-000000000001',
    code: 'PR00100',
    name: 'Contoso Website',
    color: '#000',
    status: 'active',
    isFavorite: false,
    tasks: [
      {
        id: '22222222-aaaa-bbbb-cccc-000000000001',
        projectId: '11111111-aaaa-bbbb-cccc-000000000001',
        code: '1000',
        name: 'Design',
        isBillable: true,
      },
    ],
  },
];

const entry = (overrides: Partial<TimeEntry> = {}): TimeEntry =>
  ({
    id: 'line_2026-10-05',
    projectId: 'PR00100',
    taskId: '1000',
    userId: 'u1',
    date: '2026-10-05',
    hours: 1.5,
    notes: 'Said "hi"',
    isBillable: true,
    ...overrides,
  }) as TimeEntry;

describe('buildCsvRows', () => {
  it('resolves project and task names from the BC project number and task number', () => {
    expect(buildCsvRows([entry()], projects)).toEqual([
      ['2026-10-05', 'Contoso Website', 'Design', '1.50', '"Said ""hi"""', 'Yes'],
    ]);
  });

  it('falls back to Unknown for unmatched project or task', () => {
    const rows = buildCsvRows(
      [entry({ projectId: 'PR99999' }), entry({ taskId: '9999', isBillable: false })],
      projects
    );
    expect(rows[0].slice(1, 3)).toEqual(['Unknown', 'Unknown']);
    expect(rows[1][1]).toBe('Contoso Website');
    expect(rows[1][2]).toBe('Unknown');
    expect(rows[1][5]).toBe('No');
  });
});

describe('buildCsvRows escaping', () => {
  it('quotes names containing commas or quotes and neutralises formulas', () => {
    const tricky: Project[] = [
      {
        ...projects[0],
        name: 'Contoso, "Web" Site',
        tasks: [{ ...projects[0].tasks[0], name: '=SUM(A1)' }],
      },
    ];
    const [row] = buildCsvRows([entry()], tricky);
    expect(row[1]).toBe('"Contoso, ""Web"" Site"');
    expect(row[2]).toBe(`"'=SUM(A1)"`);

    const spaced: Project[] = [
      { ...projects[0], tasks: [{ ...projects[0].tasks[0], name: '\t=SUM(A1)' }] },
    ];
    expect(buildCsvRows([entry()], spaced)[0][2]).toBe(`"'\t=SUM(A1)"`);
  });
});

describe('buildCsv', () => {
  it('keeps the existing columns', () => {
    expect(buildCsv([], projects)).toBe('Date,Project,Task,Hours,Notes,Billable');
  });
});
