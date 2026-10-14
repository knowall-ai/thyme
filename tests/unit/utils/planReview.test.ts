import { describe, it, expect, vi } from 'vitest';
import type { BCJobPlanningLine, BCPlanReview, BCPlanReviewChange } from '@/types';
import {
  applyPlanReviewChanges,
  buildUOMConversionMap,
  canonicalPlanText,
  computePlanHash,
  EMPTY_PLAN_HASH,
  formatPlanHashHours,
  formatPlanReviewWeekLabel,
  getPlanReviewCheckLabel,
  getPlanReviewStatus,
  getPlanVerdictDisplay,
  planCellManualMessage,
  planCellManualReason,
  normalizePlanReview,
  normalizePlanReviewLine,
  pickLatestPlanReviews,
  planHashEntriesForSubjectWeek,
  planHashEntriesFromLines,
  planReviewKey,
  summarizePlanReviewWeek,
  type PlanCellWriter,
  type PlanReviewSubjectWeek,
} from '@/utils';

const line = (partial: Partial<BCJobPlanningLine>): BCJobPlanningLine => ({
  id: `line-${partial.lineNo ?? 1}`,
  jobNo: 'PR00090',
  jobTaskNo: '100',
  lineNo: 1,
  planningDate: '2026-10-21',
  lineType: 'Budget',
  type: 'Resource',
  number: 'R0010',
  description: '',
  quantity: 1,
  unitCost: 0,
  unitPrice: 0,
  totalCost: 0,
  totalPrice: 0,
  lastModifiedDateTime: '',
  ...partial,
});

// R0020 is DAY-based: its HOUR unit is 0.125 of a day, so 8h days
const uomMap = buildUOMConversionMap([
  { resourceNo: 'R0020', code: 'HOUR', qtyPerUnitOfMeasure: 0.125 },
  { resourceNo: 'R0020', code: 'DAY', qtyPerUnitOfMeasure: 1 },
] as never);

// The plan-review skill's reference vector (tests/checks.test.mjs)
const referenceLines = [
  line({ lineNo: 1, planningDate: '2026-10-21', quantity: 0.5 }),
  line({ lineNo: 2, planningDate: '2026-10-22', quantity: 7.1666667 }),
  line({
    lineNo: 3,
    jobNo: 'PR00012',
    jobTaskNo: '200',
    number: 'R0020',
    planningDate: '2026-10-20',
    quantity: 0.5,
  }),
  // Left out: an Item line and a quantity-0 line
  line({ lineNo: 4, type: 'Item', number: 'ITEM1', quantity: 3 }),
  line({ lineNo: 5, planningDate: '2026-10-23', quantity: 0 }),
];

describe('plan hash', () => {
  it('reproduces the skill reference vector byte for byte', async () => {
    const entries = planHashEntriesFromLines(referenceLines, uomMap);
    expect(canonicalPlanText(entries)).toBe(
      [
        'PR00012|200|R0020|2026-10-20|4.00',
        'PR00090|100|R0010|2026-10-21|0.50',
        'PR00090|100|R0010|2026-10-22|7.17',
      ].join('\n')
    );
    await expect(computePlanHash(entries)).resolves.toBe(
      '4d78074da187636ecb1eaee46a3a143d4acb430e404c95a5b61a75f24e808d70'
    );
  });

  it('hashes an empty week as the empty string', async () => {
    await expect(computePlanHash([])).resolves.toBe(EMPTY_PLAN_HASH);
    expect(EMPTY_PLAN_HASH).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    );
  });

  it('formats hours with exactly two decimals', () => {
    expect(formatPlanHashHours(7.25)).toBe('7.25');
    expect(formatPlanHashHours(0.5)).toBe('0.50');
    expect(formatPlanHashHours(4)).toBe('4.00');
    expect(formatPlanHashHours(7.1666667)).toBe('7.17');
    expect(formatPlanHashHours(7.125)).toBe('7.13');
  });

  it('sorts in code-unit order and keeps duplicate lines', () => {
    const entry = { jobTaskNo: '1', resourceNo: 'R1', planningDate: '2026-10-19', hours: 1 };
    const text = canonicalPlanText([
      { ...entry, jobNo: 'a' },
      { ...entry, jobNo: 'B' },
      { ...entry, jobNo: 'B' },
    ]);
    expect(text.split('\n')).toEqual([
      'B|1|R1|2026-10-19|1.00',
      'B|1|R1|2026-10-19|1.00',
      'a|1|R1|2026-10-19|1.00',
    ]);
  });

  it("builds a subject-week's entries from the Plan store's unrounded hours", async () => {
    const allocations = referenceLines
      .filter((l) => l.type === 'Resource' && l.quantity > 0)
      .map((l) => ({
        projectNumber: l.jobNo,
        taskNumber: l.jobTaskNo,
        resourceNumber: l.number,
        startDate: l.planningDate,
        rawHours: l.number === 'R0020' ? l.quantity * 8 : l.quantity,
      }));
    // Next week's line is outside the subject-week
    allocations.push({ ...allocations[0], startDate: '2026-10-26', rawHours: 2 });

    const resourceWeek = planHashEntriesForSubjectWeek(
      allocations,
      'Resource',
      'R0010',
      '2026-10-19'
    );
    expect(canonicalPlanText(resourceWeek)).toBe(
      'PR00090|100|R0010|2026-10-21|0.50\nPR00090|100|R0010|2026-10-22|7.17'
    );

    const projectWeek = planHashEntriesForSubjectWeek(
      allocations,
      'Project',
      'PR00012',
      '2026-10-19'
    );
    expect(canonicalPlanText(projectWeek)).toBe('PR00012|200|R0020|2026-10-20|4.00');

    const everyone = [
      ...planHashEntriesForSubjectWeek(allocations, 'Resource', 'R0010', '2026-10-19'),
      ...planHashEntriesForSubjectWeek(allocations, 'Resource', 'R0020', '2026-10-19'),
    ];
    await expect(computePlanHash(everyone)).resolves.toBe(
      '4d78074da187636ecb1eaee46a3a143d4acb430e404c95a5b61a75f24e808d70'
    );
  });
});

const review = (partial: Partial<BCPlanReview> = {}): BCPlanReview => ({
  id: `rev-${partial.entryNo ?? 1}`,
  entryNo: 1,
  subjectType: 'Resource',
  subjectNo: 'R0010',
  weekStart: '2026-10-19',
  planHash: 'abc',
  verdict: 'Check',
  summary: '',
  reviewer: 'Poppie',
  reviewedAt: '2026-10-15T10:00:00Z',
  ...partial,
});

describe('plan review records', () => {
  it('reads labels for verdicts and checks', () => {
    expect(getPlanVerdictDisplay('Approve')).toEqual({ label: 'Looks good', tone: 'green' });
    expect(getPlanVerdictDisplay('Check')).toEqual({ label: 'Worth a check', tone: 'amber' });
    expect(getPlanVerdictDisplay('Query')).toEqual({ label: 'Needs changes', tone: 'red' });
    expect(getPlanVerdictDisplay('Something new').label).toBe('Worth a check');
    expect(getPlanReviewCheckLabel('OUTSIDE_PROJECT_DATES')).toBe('Outside project dates');
    expect(getPlanReviewCheckLabel('NEW_CHECK')).toBe('Other');
  });

  it("normalises BC's blank dates and the PENDING hash", () => {
    expect(normalizePlanReviewLine({ planningDate: '0001-01-01', severity: 'Warning' })).toEqual(
      expect.objectContaining({ planningDate: '', check: 'OTHER', severity: 'Warning' })
    );
    expect(normalizePlanReview({ id: 'x', planHash: 'pending' }).planHash).toBe('PENDING');
    expect(normalizePlanReview({ id: 'x', planHash: ' ABC ' }).planHash).toBe('abc');
  });

  it('picks the newest review per subject-week, ignoring headers still being written', () => {
    const latest = pickLatestPlanReviews([
      review({ entryNo: 1, reviewedAt: '2026-10-15T10:00:00Z' }),
      review({ entryNo: 2, reviewedAt: '2026-10-16T10:00:00Z' }),
      review({ entryNo: 3, reviewedAt: '2026-10-17T10:00:00Z', planHash: 'PENDING' }),
      review({ entryNo: 4, subjectNo: 'R0020' }),
    ]);
    expect(latest[planReviewKey('Resource', 'R0010', '2026-10-19')].entryNo).toBe(2);
    expect(latest[planReviewKey('Resource', 'R0020', '2026-10-19')].entryNo).toBe(4);
  });

  it('works out the status from the hash and any open request', () => {
    expect(getPlanReviewStatus({ review: null, currentHash: 'abc' })).toBe('none');
    expect(getPlanReviewStatus({ review: review(), currentHash: 'abc' })).toBe('current');
    expect(getPlanReviewStatus({ review: review(), currentHash: 'def' })).toBe('outOfDate');
    // Not worked out yet: don't flash "out of date"
    expect(getPlanReviewStatus({ review: review(), currentHash: undefined })).toBe('current');
    expect(
      getPlanReviewStatus({ review: review(), currentHash: 'def', request: { status: 'Running' } })
    ).toBe('awaiting');
    expect(
      getPlanReviewStatus({ review: null, currentHash: 'def', request: { status: 'Failed' } })
    ).toBe('none');
  });
});

const subject = (partial: Partial<PlanReviewSubjectWeek>): PlanReviewSubjectWeek => ({
  subjectType: 'Resource',
  subjectNo: 'R0010',
  name: 'Alex Contoso',
  weekStart: '2026-10-19',
  review: null,
  status: 'none',
  request: null,
  hasPlan: true,
  ...partial,
});

describe('week summary', () => {
  it('counts the worst verdict across the subjects in view', () => {
    const summary = summarizePlanReviewWeek([
      subject({ review: review({ verdict: 'Approve' }), status: 'current' }),
      subject({ review: review({ verdict: 'Check' }), status: 'outOfDate' }),
      subject({ review: review({ verdict: 'Check' }), status: 'current' }),
      subject({}),
    ]);
    expect(summary).toEqual(
      expect.objectContaining({
        worstVerdict: 'Check',
        worstCount: 2,
        reviewed: 3,
        outOfDate: 1,
        awaiting: 0,
      })
    );
    expect(formatPlanReviewWeekLabel(summary)).toBe('2 to check');
  });

  it('labels single verdicts by name, and several changes as a count', () => {
    const label = (verdicts: BCPlanReview['verdict'][]) =>
      formatPlanReviewWeekLabel(
        summarizePlanReviewWeek(verdicts.map((verdict) => subject({ review: review({ verdict }) })))
      );
    expect(label([])).toBeNull();
    expect(label(['Approve', 'Approve'])).toBe('Looks good');
    expect(label(['Approve', 'Check'])).toBe('Worth a check');
    expect(label(['Check', 'Query'])).toBe('Needs changes');
    expect(label(['Query', 'Query', 'Query'])).toBe('3 need changes');
  });

  it('reports open requests, Running first', () => {
    const summary = summarizePlanReviewWeek([
      subject({ request: { status: 'Requested' } as never, status: 'awaiting' }),
      subject({ request: { status: 'Running' } as never, status: 'awaiting' }),
      subject({ request: { status: 'Failed' } as never }),
    ]);
    expect(summary.awaiting).toBe(2);
    expect(summary.requestStatus).toBe('Running');
    expect(summary.worstVerdict).toBeNull();
  });
});

const change = (partial: Partial<BCPlanReviewChange> = {}): BCPlanReviewChange => ({
  reviewEntryNo: 1,
  reviewLineNo: 10000,
  changeNo: 10000,
  jobNo: 'PR00090',
  jobTaskNo: '100',
  resourceNo: 'R0010',
  planningDate: '2026-10-22',
  currentHours: 7.17,
  proposedHours: 7.25,
  ...partial,
});

type Cells = Record<string, BCJobPlanningLine[]>;
const cellKey = (cell: { jobNo: string; resourceNo: string; planningDate: string }) =>
  `${cell.jobNo}|${cell.resourceNo}|${cell.planningDate}`;

/** A fake BC that really holds the cells, so writes and rollbacks can be checked */
function fakeWriter(cells: Cells, failOn?: { create?: boolean; update?: number; undo?: boolean }) {
  let nextId = 100;
  let updates = 0;
  const find = (id: string) => {
    for (const lines of Object.values(cells)) {
      const index = lines.findIndex((l) => l.id === id);
      if (index >= 0) return { lines, index };
    }
    return null;
  };
  const writer = {
    getCellLines: vi.fn(
      async (cell: { jobNo: string; resourceNo: string; planningDate: string }) => [
        ...(cells[cellKey(cell)] ?? []),
      ]
    ),
    createLine: vi.fn(
      async (params: {
        jobNo: string;
        jobTaskNo: string;
        resourceNo: string;
        planningDate: string;
        quantity: number;
      }) => {
        if (failOn?.create) throw new Error('BC API Error (500)');
        const created = line({
          id: `new-${nextId++}`,
          jobNo: params.jobNo,
          jobTaskNo: params.jobTaskNo,
          number: params.resourceNo,
          planningDate: params.planningDate,
          quantity: params.quantity,
        });
        (cells[cellKey(params)] ??= []).push(created);
        return created;
      }
    ),
    updateLine: vi.fn(async (id: string, quantity: number, _etag?: string) => {
      updates += 1;
      if (failOn?.update === updates || (failOn?.undo && updates > 1)) {
        throw new Error('BC API Error (500)');
      }
      const found = find(id)!;
      found.lines[found.index] = {
        ...found.lines[found.index],
        quantity,
        '@odata.etag': `W/"${updates}"`,
      };
      return found.lines[found.index];
    }),
    deleteLine: vi.fn(async (id: string, _etag?: string) => {
      const found = find(id);
      if (found) found.lines.splice(found.index, 1);
    }),
  } satisfies PlanCellWriter;
  return writer;
}

const writes = (writer: ReturnType<typeof fakeWriter>) =>
  writer.createLine.mock.calls.length +
  writer.updateLine.mock.calls.length +
  writer.deleteLine.mock.calls.length;

const quantities = (cells: Cells, key: string) => (cells[key] ?? []).map((l) => l.quantity);

describe('applyPlanReviewChanges', () => {
  it('writes nothing when a cell no longer holds what Poppie saw', async () => {
    const writer = fakeWriter({
      'PR00090|R0010|2026-10-22': [line({ id: 'a', planningDate: '2026-10-22', quantity: 7.5 })],
    });
    const result = await applyPlanReviewChanges(
      // The first cell is fine, but the second changed: neither is written
      [change({ planningDate: '2026-10-23', currentHours: 0, proposedHours: 1 }), change()],
      new Map(),
      writer
    );
    expect(result).toEqual(
      expect.objectContaining({ status: 'stale', actualHours: 7.5, attempted: false })
    );
    expect(writes(writer)).toBe(0);
  });

  it('updates a single Budget line, and adds a Budget line to an empty cell', async () => {
    const cells: Cells = {
      'PR00090|R0010|2026-10-22': [
        line({ id: 'a', planningDate: '2026-10-22', quantity: 7.1666667, '@odata.etag': 'W/"a"' }),
      ],
    };
    const writer = fakeWriter(cells);
    const result = await applyPlanReviewChanges(
      [
        change(),
        change({
          jobNo: 'PR00012',
          jobTaskNo: '200',
          resourceNo: 'R0020',
          planningDate: '2026-10-23',
          currentHours: 0,
          proposedHours: 2,
        }),
      ],
      uomMap,
      writer
    );
    expect(result).toEqual({ status: 'applied', written: 2, attempted: true });
    expect(writer.updateLine).toHaveBeenCalledWith('a', 7.25, 'W/"a"');
    // 2h for an 8h-day resource is a quarter of a day
    expect(quantities(cells, 'PR00012|R0020|2026-10-23')).toEqual([0.25]);
  });

  it("removes a cell's one Budget line when the proposal is 0", async () => {
    const cells: Cells = {
      'PR00090|R0010|2026-10-22': [line({ id: 'a', planningDate: '2026-10-22', quantity: 7.17 })],
    };
    const writer = fakeWriter(cells);
    const result = await applyPlanReviewChanges([change({ proposedHours: 0 })], new Map(), writer);
    expect(result).toEqual({ status: 'applied', written: 1, attempted: true });
    expect(cells['PR00090|R0010|2026-10-22']).toEqual([]);
  });

  it.each([
    [
      'Billable',
      [line({ id: 'a', planningDate: '2026-10-22', quantity: 7.17, lineType: 'Billable' })],
      /Billable/,
    ],
    [
      'Both Budget and Billable',
      [
        line({
          id: 'a',
          planningDate: '2026-10-22',
          quantity: 7.17,
          lineType: 'Both Budget and Billable',
        }),
      ],
      /Billable/,
    ],
    [
      'several lines',
      [
        line({ id: 'a', planningDate: '2026-10-22', quantity: 7 }),
        line({ id: 'b', planningDate: '2026-10-22', quantity: 0.17 }),
      ],
      /several planning lines/,
    ],
  ])(
    'never touches a cell with %s: the finding is left to edit by hand',
    async (_name, lines, reason) => {
      const writer = fakeWriter({
        'PR00090|R0010|2026-10-21': [line({ id: 'ok', planningDate: '2026-10-21', quantity: 1 })],
        'PR00090|R0010|2026-10-22': lines,
      });
      const result = await applyPlanReviewChanges(
        [change({ planningDate: '2026-10-21', currentHours: 1, proposedHours: 2 }), change()],
        new Map(),
        writer
      );
      expect(result.status).toBe('manual');
      expect(result.status === 'manual' && result.reason).toMatch(reason);
      expect(writes(writer)).toBe(0);
    }
  );

  it('says why a cell needs editing by hand', () => {
    expect(planCellManualReason([])).toBeUndefined();
    expect(planCellManualReason([{ lineType: 'Budget' }])).toBeUndefined();
    expect(
      planCellManualReason([{ lineType: 'Both_x0020_Budget_x0020_and_x0020_Billable' }])
    ).toMatch(/Billable/);
    expect(planCellManualMessage('it has several lines')).toBe(
      'Edit this cell by hand: it has several lines.'
    );
  });

  it('rolls back the cells already written when a later write fails', async () => {
    const cells: Cells = {
      'PR00090|R0010|2026-10-21': [line({ id: 'a', planningDate: '2026-10-21', quantity: 1 })],
      'PR00090|R0010|2026-10-22': [line({ id: 'b', planningDate: '2026-10-22', quantity: 7.17 })],
    };
    const writer = fakeWriter(cells, { update: 2 });
    const result = await applyPlanReviewChanges(
      [change({ planningDate: '2026-10-21', currentHours: 1, proposedHours: 2 }), change()],
      new Map(),
      writer
    );
    expect(result).toEqual(
      expect.objectContaining({ status: 'failed', rolledBack: true, attempted: true })
    );
    expect(quantities(cells, 'PR00090|R0010|2026-10-21')).toEqual([1]);
    expect(quantities(cells, 'PR00090|R0010|2026-10-22')).toEqual([7.17]);
  });

  it('rolls back an added line and a removed one', async () => {
    const cells: Cells = {
      'PR00090|R0010|2026-10-21': [line({ id: 'a', planningDate: '2026-10-21', quantity: 2 })],
    };
    const writer = fakeWriter(cells, { update: 1 });
    const result = await applyPlanReviewChanges(
      [
        change({ planningDate: '2026-10-23', currentHours: 0, proposedHours: 2 }),
        change({ planningDate: '2026-10-21', currentHours: 2, proposedHours: 0 }),
        change({ planningDate: '2026-10-22', currentHours: 0, proposedHours: 0 }),
        change({ planningDate: '2026-10-24', currentHours: 0, proposedHours: 1 }),
      ],
      new Map(),
      // The fourth cell's add fails
      {
        ...writer,
        createLine: vi.fn(async (p) =>
          writer.createLine.mock.calls.length >= 1 && p.planningDate === '2026-10-24'
            ? Promise.reject(new Error('boom'))
            : writer.createLine(p)
        ),
      }
    );
    expect(result).toEqual(expect.objectContaining({ status: 'failed', rolledBack: true }));
    expect(quantities(cells, 'PR00090|R0010|2026-10-23')).toEqual([]);
    expect(quantities(cells, 'PR00090|R0010|2026-10-21')).toEqual([2]);
  });

  it('says so when the rollback fails too', async () => {
    const cells: Cells = {
      'PR00090|R0010|2026-10-21': [line({ id: 'a', planningDate: '2026-10-21', quantity: 1 })],
    };
    const writer = fakeWriter(cells, { create: true, undo: true });
    const result = await applyPlanReviewChanges(
      [
        change({ planningDate: '2026-10-21', currentHours: 1, proposedHours: 2 }),
        change({ currentHours: 0, proposedHours: 1 }),
      ],
      new Map(),
      writer
    );
    expect(result).toEqual(expect.objectContaining({ status: 'failed', rolledBack: false }));
  });

  it('re-reads an empty cell just before adding to it, and backs out if someone planned it', async () => {
    const cells: Cells = {
      'PR00090|R0010|2026-10-21': [line({ id: 'a', planningDate: '2026-10-21', quantity: 1 })],
    };
    const writer = fakeWriter(cells);
    // Someone plans the 22nd after the pre-read
    let reads = 0;
    const racing = {
      ...writer,
      getCellLines: vi.fn(
        async (cell: {
          jobNo: string;
          jobTaskNo: string;
          resourceNo: string;
          planningDate: string;
        }) => {
          if (cell.planningDate === '2026-10-22' && ++reads === 2) {
            cells['PR00090|R0010|2026-10-22'] = [
              line({ id: 'x', planningDate: '2026-10-22', quantity: 3 }),
            ];
          }
          return writer.getCellLines(cell);
        }
      ),
    };
    const result = await applyPlanReviewChanges(
      [
        change({ planningDate: '2026-10-21', currentHours: 1, proposedHours: 2 }),
        change({ currentHours: 0, proposedHours: 1 }),
      ],
      new Map(),
      racing
    );
    expect(result).toEqual(
      expect.objectContaining({
        status: 'stale',
        attempted: true,
        rolledBack: true,
        actualHours: 3,
      })
    );
    expect(writer.createLine).not.toHaveBeenCalled();
    expect(quantities(cells, 'PR00090|R0010|2026-10-21')).toEqual([1]);
    expect(quantities(cells, 'PR00090|R0010|2026-10-22')).toEqual([3]);
  });

  it('stops before the next write when the company changes, without writing to the new one', async () => {
    const cells: Cells = {
      'PR00090|R0010|2026-10-21': [line({ id: 'a', planningDate: '2026-10-21', quantity: 1 })],
      'PR00090|R0010|2026-10-22': [line({ id: 'b', planningDate: '2026-10-22', quantity: 7.17 })],
    };
    const writer = fakeWriter(cells);
    let current = true;
    writer.updateLine.mockImplementationOnce(async (id, quantity) => {
      cells['PR00090|R0010|2026-10-21'][0] = { ...cells['PR00090|R0010|2026-10-21'][0], quantity };
      current = false; // switched while the first write was in flight
      return cells['PR00090|R0010|2026-10-21'][0];
    });
    const result = await applyPlanReviewChanges(
      [change({ planningDate: '2026-10-21', currentHours: 1, proposedHours: 2 }), change()],
      new Map(),
      writer,
      { isCurrent: () => current }
    );
    expect(result).toEqual({ status: 'companyChanged', attempted: true });
    expect(writer.updateLine).toHaveBeenCalledTimes(1);
  });

  it('refuses proposals that cannot be planned', async () => {
    const writer = fakeWriter({});
    await expect(
      applyPlanReviewChanges([change({ proposedHours: -1 })], new Map(), writer)
    ).rejects.toThrow();
    expect(writer.getCellLines).not.toHaveBeenCalled();
  });
});
