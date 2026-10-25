import { describe, expect, it } from 'vitest';
import { addDays, format, startOfWeek } from 'date-fns';
import {
  DEMO_AGENT_FINISH_MS,
  DEMO_DATA_STORAGE_KEY,
  DemoBcServer,
} from '@/services/demo/demoBcServer';
import { createDemoData, DEMO_PEOPLE, DEMO_USER_RESOURCE_NO } from '@/services/demo/demoFixtures';
import { DEMO_COMPANY_ID } from '@/services/demo/demoMode';
import { computePlanHash, planHashEntriesFromLines } from '@/utils/planReview';
import { buildUOMConversionMap } from '@/utils/unitConversion';
import { getTimesheetDisplayStatus } from '@/utils/timesheetStatus';
import type { BCJobPlanningLine, BCTimeSheet, BCTimeSheetLine } from '@/types';

const TODAY = new Date('2026-10-22T10:00:00Z'); // a Thursday
const WEEK = format(startOfWeek(TODAY, { weekStartsOn: 1 }), 'yyyy-MM-dd');
const API = `https://api.businesscentral.dynamics.com/v2.0/tenant/sandbox/api/knowall/thyme/v1.0/companies(${DEMO_COMPANY_ID})`;

/** A server on a clock the test moves */
function serverAt(start = TODAY, storage: Storage | null = null) {
  let now = start.getTime();
  const server = new DemoBcServer({ storage, now: () => new Date(now) });
  return {
    server,
    advance: (ms: number) => (now += ms),
    async get<T>(path: string): Promise<T> {
      const response = await server.handle(`${API}${path}`);
      expect(response.status).toBe(200);
      return response.json() as Promise<T>;
    },
    send(path: string, method: string, body?: unknown) {
      return server.handle(`${API}${path}`, {
        method,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    },
  };
}

function memoryStorage(): Storage {
  const items = new Map<string, string>();
  return {
    get length() {
      return items.size;
    },
    key: (i) => [...items.keys()][i] ?? null,
    getItem: (k) => items.get(k) ?? null,
    setItem: (k, v) => void items.set(k, v),
    removeItem: (k) => void items.delete(k),
    clear: () => items.clear(),
  };
}

const filter = (f: string) => `?$filter=${encodeURIComponent(f)}`;

describe('demo sample data', () => {
  it('is dated from today: timesheets up to this week, a plan into the coming weeks', () => {
    const { tables } = createDemoData(TODAY);
    const starts = tables.timeSheets.map((s) => s.startingDate).sort();
    expect(starts.at(-1)).toBe(WEEK);
    expect(tables.timeSheetDetails.every((d) => d.date < '2026-10-22')).toBe(true);
    const nextWeek = format(addDays(new Date(WEEK), 7), 'yyyy-MM-dd');
    expect(tables.jobPlanningLines.some((l) => l.planningDate >= nextWeek)).toBe(true);
    expect(tables.timeSuggestions.every((s) => s.date >= WEEK && s.status === 'Pending')).toBe(
      true
    );
  });

  it('only uses fictional people and companies', () => {
    const data = createDemoData(TODAY);
    expect(data.company.displayName).toBe('Contoso Ltd');
    const text = JSON.stringify(data);
    for (const real of ['KnowAll', 'CRONUS', 'knowall.ai']) expect(text).not.toContain(real);
    expect(DEMO_PEOPLE.map((p) => p.name)).toContain('Alex Morgan');
  });

  it('gives every SystemId the GUID shape bcClient insists on', () => {
    const { tables } = createDemoData(TODAY);
    const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
    const ids = [...tables.timeSheets, ...tables.resources, ...tables.planReviewLines].map(
      (r) => r.id
    );
    expect(ids.every((id) => guid.test(id))).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('DemoBcServer', () => {
  it('lists only the demo company, and only in the sandbox environment', async () => {
    const { server } = serverAt();
    const sandbox = await server.handle(
      'https://api.businesscentral.dynamics.com/v2.0/t/sandbox/api/v2.0/companies'
    );
    const production = await server.handle(
      'https://api.businesscentral.dynamics.com/v2.0/t/production/api/v2.0/companies'
    );
    expect((await sandbox.json()).value.map((c: { id: string }) => c.id)).toEqual([
      DEMO_COMPANY_ID,
    ]);
    expect((await production.json()).value).toEqual([]);
  });

  it("answers 404 for any other company and for endpoints it doesn't have", async () => {
    const { server, send } = serverAt();
    const other = await server.handle(
      'https://api.businesscentral.dynamics.com/v2.0/t/sandbox/api/v2.0/companies(00000000-0000-0000-0000-000000000001)/projects'
    );
    expect(other.status).toBe(404);
    expect((await send('/notAnEntitySet', 'GET')).status).toBe(404);
  });

  it('filters like BC, including the fields BC works out', async () => {
    const { get } = serverAt();
    const pending = await get<{ value: BCTimeSheet[] }>(
      `/timeSheets${filter('submittedExists eq true and approvedExists eq false')}`
    );
    expect(pending.value.length).toBeGreaterThanOrEqual(2);
    expect(pending.value.every((s) => getTimesheetDisplayStatus(s) === 'Submitted')).toBe(true);
    // Details carry their line's type, so "all job time" queries work
    const details = await get<{ value: { type: string }[] }>(
      `/timeSheetDetails${filter("type eq 'Job'")}`
    );
    expect(details.value.length).toBeGreaterThan(100);
  });

  it('logs time, submits and approves a timesheet the way BC does', async () => {
    const { get, send } = serverAt();
    const [sheet] = (
      await get<{ value: BCTimeSheet[] }>(
        `/timeSheets${filter(`resourceNo eq '${DEMO_USER_RESOURCE_NO}' and startingDate eq ${WEEK}`)}`
      )
    ).value;
    expect(getTimesheetDisplayStatus(sheet)).toBe('Open');

    const created = await send('/timeSheetLines', 'POST', {
      timeSheetNo: sheet.number,
      type: 'Job',
      jobNo: 'J00010',
      jobTaskNo: '300',
      description: 'Demo entry',
    });
    expect(created.status).toBe(201);
    const line = (await created.json()) as BCTimeSheetLine;
    expect(line.status).toBe('Open');

    const set = await send(`/timeSheetLines(${line.id})/Microsoft.NAV.setHoursForDate`, 'POST', {
      entryDate: WEEK,
      hours: 2.5,
    });
    expect(set.status).toBe(204);
    const updated = await get<BCTimeSheetLine>(`/timeSheetLines(${line.id})`);
    expect(updated.totalQuantity).toBe(2.5);

    expect((await send(`/timeSheets(${sheet.id})/Microsoft.NAV.submit`, 'POST')).status).toBe(204);
    expect(getTimesheetDisplayStatus(await get<BCTimeSheet>(`/timeSheets(${sheet.id})`))).toBe(
      'Submitted'
    );
    // Submitted lines can't be changed
    const refused = await send(
      `/timeSheetLines(${line.id})/Microsoft.NAV.setHoursForDate`,
      'POST',
      { entryDate: WEEK, hours: 1 }
    );
    expect(refused.status).toBe(400);

    expect((await send(`/timeSheets(${sheet.id})/Microsoft.NAV.approve`, 'POST')).status).toBe(204);
    expect(getTimesheetDisplayStatus(await get<BCTimeSheet>(`/timeSheets(${sheet.id})`))).toBe(
      'Approved'
    );
  });

  it("stamps the fixture plan reviews with the plan's own hash, so they start current", async () => {
    const { get, server } = serverAt();
    const reviews = await get<{ value: { subjectNo: string; planHash: string }[] }>(
      `/planReviews${filter(`subjectType eq 'Resource' and weekStart eq ${WEEK}`)}`
    );
    const jamie = reviews.value.find((r) => r.subjectNo === 'R0020')!;
    const { tables } = server.snapshot;
    const weekEnd = format(addDays(new Date(WEEK), 6), 'yyyy-MM-dd');
    const lines = tables.jobPlanningLines.filter(
      (l: BCJobPlanningLine) =>
        l.number === 'R0020' && l.planningDate >= WEEK && l.planningDate <= weekEnd
    );
    const hash = await computePlanHash(
      planHashEntriesFromLines(lines, buildUOMConversionMap(tables.resourceUnitsOfMeasure))
    );
    expect(jamie.planHash).toBe(hash);
  });

  it("applies a plan review finding's proposed changes", async () => {
    const { get, send, server } = serverAt();
    await get('/planReviews'); // stamps the hashes
    const finding = server.snapshot.tables.planReviewLines.find(
      (l) => l.check === 'OVER_CAPACITY'
    )!;
    const change = server.snapshot.tables.planReviewChanges.find(
      (c) => c.reviewLineNo === finding.lineNo && c.reviewEntryNo === finding.reviewEntryNo
    )!;
    const response = await send(
      `/planReviewLines(${finding.id})/Microsoft.NAV.applyChanges`,
      'POST'
    );
    expect(response.status).toBe(204);
    const cell = server.snapshot.tables.jobPlanningLines.filter(
      (l) =>
        l.lineType === 'Budget' &&
        l.number === change.resourceNo &&
        l.jobNo === change.jobNo &&
        l.planningDate === change.planningDate
    );
    expect(cell.reduce((sum, l) => sum + l.quantity, 0)).toBe(change.proposedHours);
    expect(
      server.snapshot.tables.planReviewLines.find((l) => l.id === finding.id)!.appliedAt
    ).not.toBe('');
  });

  it('has Poppie pick up a request and finish it a few seconds later', async () => {
    const { get, send, advance } = serverAt();
    const before = countOf(await get(`/timeSuggestions`));
    const created = await send('/suggestionRequests', 'POST', {
      resourceNo: DEMO_USER_RESOURCE_NO,
      fromDate: WEEK,
      toDate: format(addDays(new Date(WEEK), 6), 'yyyy-MM-dd'),
    });
    const request = (await created.json()) as { id: string; status: string };
    expect(request.status).toBe('Requested');

    advance(DEMO_AGENT_FINISH_MS);
    const done = await get<{ status: string; createdCount: number }>(
      `/suggestionRequests(${request.id})`
    );
    expect(done.status).toBe('Done');
    expect(done.createdCount).toBe(1);
    expect(countOf(await get(`/timeSuggestions`))).toBe(before + 1);
  });

  it('writes a timesheet review when one is asked for', async () => {
    const { get, send, advance } = serverAt();
    const [sheet] = (
      await get<{ value: BCTimeSheet[] }>(
        `/timeSheets${filter(`resourceNo eq 'R0060' and startingDate eq ${WEEK}`)}`
      )
    ).value;
    const created = await send('/timesheetReviewRequests', 'POST', { timeSheetNo: sheet.number });
    const request = (await created.json()) as { id: string };
    advance(DEMO_AGENT_FINISH_MS);
    expect((await get<{ status: string }>(`/timesheetReviewRequests(${request.id})`)).status).toBe(
      'Done'
    );
    const reviews = await get<{ value: { verdict: string }[] }>(
      `/timesheetReviews${filter(`timeSheetNo eq '${sheet.number}'`)}`
    );
    expect(reviews.value).toHaveLength(1);
  });

  it("keeps changes in the tab's storage, and starts afresh on a new day", async () => {
    const storage = memoryStorage();
    const first = serverAt(TODAY, storage);
    await first.send('/dayNotes', 'POST', {
      noteDate: WEEK,
      resourceNo: '',
      note: 'Kept',
      noProjectWork: false,
    });
    expect(storage.getItem(DEMO_DATA_STORAGE_KEY)).toContain('Kept');

    const reloaded = serverAt(TODAY, storage);
    const notes = await reloaded.get<{ value: { note: string }[] }>('/dayNotes');
    expect(notes.value.map((n) => n.note)).toContain('Kept');

    const tomorrow = serverAt(new Date(TODAY.getTime() + 24 * 60 * 60 * 1000), storage);
    const fresh = await tomorrow.get<{ value: { note: string }[] }>('/dayNotes');
    expect(fresh.value.map((n) => n.note)).not.toContain('Kept');
  });
});

function countOf(body: unknown): number {
  return (body as { value: unknown[] }).value.length;
}
