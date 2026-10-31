import { addDays, format, parseISO } from 'date-fns';
import type {
  BCJobPlanningLine,
  BCPlanReview,
  BCPlanReviewLine,
  BCPlanReviewRequest,
  BCResourceUnitOfMeasure,
  BCSuggestionRequest,
  BCTimeSheet,
  BCTimeSheetDetail,
  BCTimeSheetLine,
  BCTimesheetReviewLine,
  BCTimesheetReviewRequest,
} from '@/types';
import { computePlanHash, planHashEntriesFromLines } from '@/utils/planReview';
import { buildUOMConversionMap, convertToHours } from '@/utils/unitConversion';
import { DEMO_COMPANY_ID, DEMO_ENVIRONMENT, DEMO_STORAGE_PREFIX } from './demoMode';
import {
  createDemoData,
  DEMO_DATA_VERSION,
  demoEtag,
  demoGuid,
  demoPerson,
  type DemoData,
  type DemoTables,
} from './demoFixtures';
import { ODataQueryError, queryRows, type Row } from './odataQuery';

/**
 * The demo's Business Central: answers the requests bcClient makes (standard API v2.0
 * and the Timmie extension's API) from the sample data in memory, so in the demo nothing
 * is sent over the network. It behaves enough like BC for every page to work: OData
 * filters, timesheet status flow (submit, approve, reject, reopen), hours by date,
 * planning lines with costs and prices, and Poppie's requests, which she "runs" a few
 * seconds after they're made.
 *
 * Changes are kept in this tab's sessionStorage, so they survive a reload and are gone
 * when the demo is exited or the tab is closed.
 */

/** sessionStorage key of the tab's demo data (cleared with the rest of the demo) */
export const DEMO_DATA_STORAGE_KEY = `${DEMO_STORAGE_PREFIX}_data`;

/** How long Poppie takes to pick up a request, and to finish it */
export const DEMO_AGENT_START_MS = 1_500;
export const DEMO_AGENT_FINISH_MS = 4_000;

const NOT_FOUND_ENDPOINT = 'No HTTP resource was found that matches the request URI.';
const AGENT_NAME = 'POPPIE';

type TableName = keyof DemoTables;

/** Entity sets the demo answers, and the ones that are always empty */
const TABLES: readonly TableName[] = [
  'customers',
  'employees',
  'resources',
  'resourceUnitsOfMeasure',
  'thymeSetup',
  'projects',
  'jobTasks',
  'jobPlanningLines',
  'timeEntries',
  'timeSheets',
  'timeSheetLines',
  'timeSheetDetails',
  'timeSuggestions',
  'suggestionRequests',
  'agentHeartbeats',
  'projectSourceLinks',
  'projectNotes',
  'dayNotes',
  'timesheetReviews',
  'timesheetReviewLines',
  'timesheetReviewRequests',
  'planReviews',
  'planReviewLines',
  'planReviewChanges',
  'planReviewRequests',
];
const EMPTY_SETS = new Set(['jobs', 'jobJournalLines', 'items', 'vendors']);
const READ_ONLY_FIELDS = new Set(['id', 'number', 'lineNo', 'entryNo', '@odata.etag']);

class DemoHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code = 'BadRequest'
  ) {
    super(message);
  }
}

const ymd = (date: Date) => format(date, 'yyyy-MM-dd');

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function noContent(): Response {
  return new Response(null, { status: 204 });
}

interface DemoBcServerOptions {
  /** Where the tab's demo data is kept; null keeps it in memory only */
  storage?: Storage | null;
  /** The clock (tests) */
  now?: () => Date;
}

export class DemoBcServer {
  private data: DemoData;
  private readonly storage: Storage | null;
  private readonly now: () => Date;
  private ready: Promise<void> | null = null;
  // Poppie works through requests one pass at a time, so concurrent calls can't finish
  // the same request twice
  private agentPass: Promise<void> = Promise.resolve();

  constructor({ storage = null, now = () => new Date() }: DemoBcServerOptions = {}) {
    this.storage = storage;
    this.now = now;
    this.data = this.load() ?? createDemoData(this.now());
  }

  /** The sample data as it stands (tests) */
  get snapshot(): DemoData {
    return this.data;
  }

  /** Answer one Business Central request */
  async handle(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
    try {
      await this.ensureReady();
      const url = new URL(
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      );
      const method = (init.method ?? 'GET').toUpperCase();
      const body = typeof init.body === 'string' && init.body ? JSON.parse(init.body) : {};
      await this.runAgent();
      const response = this.route(url, method, body as Row);
      if (method !== 'GET') this.save();
      return response;
    } catch (error) {
      if (error instanceof DemoHttpError) {
        return json(error.status, { error: { code: error.code, message: error.message } });
      }
      if (error instanceof ODataQueryError || error instanceof SyntaxError) {
        return json(400, { error: { code: 'BadRequest', message: error.message } });
      }
      throw error;
    }
  }

  // ============================================
  // Storage
  // ============================================

  private load(): DemoData | null {
    try {
      const raw = this.storage?.getItem(DEMO_DATA_STORAGE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw) as DemoData;
      // Regenerate when the shape changed, or on a new day so dates stay current
      if (data.version !== DEMO_DATA_VERSION || data.generatedOn !== ymd(this.now())) return null;
      return data;
    } catch {
      return null;
    }
  }

  private save(): void {
    try {
      this.storage?.setItem(DEMO_DATA_STORAGE_KEY, JSON.stringify(this.data));
    } catch {
      // Full or blocked: the demo carries on in memory
    }
  }

  /** Fill in the fixture plan reviews' hashes, so they match the plan as it starts */
  private ensureReady(): Promise<void> {
    this.ready ??= (async () => {
      let changed = false;
      for (const review of this.data.tables.planReviews) {
        if (review.planHash) continue;
        review.planHash = await this.planHash(
          review.subjectType,
          review.subjectNo,
          review.weekStart
        );
        changed = true;
      }
      if (changed) this.save();
    })();
    return this.ready;
  }

  // ============================================
  // Routing
  // ============================================

  private route(url: URL, method: string, body: Row): Response {
    const path = decodeURIComponent(url.pathname);
    const match = /\/companies(?:\(([^)]*)\))?(\/.*)?$/.exec(path);
    if (!match) throw new DemoHttpError(404, NOT_FOUND_ENDPOINT);
    const [, companyKey, rest = ''] = match;

    // The environment's company list: only the demo company, in the demo environment
    if (companyKey === undefined) {
      if (method !== 'GET') throw new DemoHttpError(405, 'Method not allowed');
      const inDemoEnvironment = path.includes(`/${DEMO_ENVIRONMENT}/api/`);
      return json(200, { value: inDemoEnvironment ? [this.data.company] : [] });
    }
    if (companyKey.toLowerCase() !== DEMO_COMPANY_ID) {
      throw new DemoHttpError(
        404,
        `Company ${companyKey} does not exist.`,
        'Internal_CompanyNotFound'
      );
    }
    if (rest === '' || rest === '/') return json(200, this.data.company);

    const [entitySegment, action, ...extra] = rest.slice(1).split('/');
    if (extra.length > 0) throw new DemoHttpError(404, NOT_FOUND_ENDPOINT);
    const entity = /^([A-Za-z]+)(?:\(([^)]*)\))?$/.exec(entitySegment);
    if (!entity) throw new DemoHttpError(404, NOT_FOUND_ENDPOINT);
    const [, set, key] = entity;

    if (set === 'companyInformation') {
      return json(200, { value: [this.data.companyInformation] });
    }
    if (set === 'jobJournals' && action === 'Microsoft.NAV.post') return noContent();
    if (EMPTY_SETS.has(set) && key === undefined && method === 'GET') {
      return json(200, { value: [] });
    }
    if (!(TABLES as readonly string[]).includes(set)) {
      throw new DemoHttpError(404, NOT_FOUND_ENDPOINT);
    }
    const table = set as TableName;

    if (action) {
      if (method !== 'POST' || key === undefined) throw new DemoHttpError(404, NOT_FOUND_ENDPOINT);
      return this.action(table, key, action, body);
    }

    if (key === undefined) {
      if (method === 'GET') {
        const rows = this.rows(table).map((row) => this.view(table, row));
        return json(200, { value: queryRows(rows, url.searchParams) });
      }
      if (method === 'POST') return json(201, this.view(table, this.create(table, body)));
      throw new DemoHttpError(405, 'Method not allowed');
    }

    const row = this.find(table, key);
    switch (method) {
      case 'GET':
        return json(200, this.view(table, row));
      case 'PATCH':
        return json(200, this.view(table, this.update(table, row, body)));
      case 'DELETE':
        this.remove(table, row);
        return noContent();
      default:
        throw new DemoHttpError(405, 'Method not allowed');
    }
  }

  private rows(table: TableName): Row[] {
    return this.data.tables[table] as unknown as Row[];
  }

  private find(table: TableName, key: string): Row {
    const id = key.replace(/^'|'$/g, '').toLowerCase();
    const row = this.rows(table).find((r) => String(r.id).toLowerCase() === id);
    if (!row) {
      throw new DemoHttpError(
        404,
        `The ${table} record with id ${key} does not exist.`,
        'Internal_RecordNotFound'
      );
    }
    return row;
  }

  private nextSeq(): number {
    return ++this.data.seq;
  }

  private nowIso(): string {
    return this.now().toISOString();
  }

  /** A changed record's new ETag and modified time */
  private touch(row: Row): void {
    row['@odata.etag'] = demoEtag(this.nextSeq());
    row.lastModifiedDateTime = this.nowIso();
  }

  // ============================================
  // Reads: the fields BC works out
  // ============================================

  private linesOf(timeSheetNo: string): BCTimeSheetLine[] {
    return this.data.tables.timeSheetLines.filter((l) => l.timeSheetNo === timeSheetNo);
  }

  private detailsOf(line: Pick<BCTimeSheetLine, 'timeSheetNo' | 'lineNo'>): BCTimeSheetDetail[] {
    return this.data.tables.timeSheetDetails.filter(
      (d) => d.timeSheetNo === line.timeSheetNo && d.timeSheetLineNo === line.lineNo
    );
  }

  private lineTotal(line: BCTimeSheetLine): number {
    return this.detailsOf(line).reduce((sum, d) => sum + d.quantity, 0);
  }

  private view(table: TableName, row: Row): Row {
    switch (table) {
      case 'timeSheets': {
        const sheet = row as unknown as BCTimeSheet;
        const lines = this.linesOf(sheet.number);
        const has = (status: BCTimeSheetLine['status']) => lines.some((l) => l.status === status);
        return {
          ...row,
          openExists: has('Open'),
          submittedExists: has('Submitted'),
          rejectedExists: has('Rejected'),
          approvedExists: has('Approved'),
          totalQuantity: lines.reduce((sum, l) => sum + this.lineTotal(l), 0),
        };
      }
      case 'timeSheetLines': {
        const line = row as unknown as BCTimeSheetLine;
        const sheet = this.data.tables.timeSheets.find((s) => s.number === line.timeSheetNo);
        return {
          ...row,
          totalQuantity: this.lineTotal(line),
          timeSheetStartingDate: sheet?.startingDate,
        };
      }
      case 'timeSheetDetails': {
        const detail = row as unknown as BCTimeSheetDetail;
        const line = this.data.tables.timeSheetLines.find(
          (l) => l.timeSheetNo === detail.timeSheetNo && l.lineNo === detail.timeSheetLineNo
        );
        return {
          ...row,
          type: line?.type,
          jobNo: line?.jobNo,
          jobTaskNo: line?.jobTaskNo,
          status: line?.status,
        };
      }
      case 'agentHeartbeats':
        // Poppie is always about in the demo
        return { ...row, lastSeenAt: new Date(this.now().getTime() - 20_000).toISOString() };
      default:
        return row;
    }
  }

  // ============================================
  // Writes
  // ============================================

  private create(table: TableName, body: Row): Row {
    const n = this.nextSeq();
    const base: Row = {
      ...body,
      id: demoGuid(n),
      '@odata.etag': demoEtag(n),
      lastModifiedDateTime: this.nowIso(),
    };
    const tables = this.data.tables;
    let row: Row;

    switch (table) {
      case 'timeSheets': {
        const resourceNo = String(body.resourceNo ?? '');
        const startingDate = String(body.startingDate ?? '');
        const resource = tables.resources.find((r) => r.number === resourceNo);
        if (!resource) throw new DemoHttpError(400, `Resource ${resourceNo} does not exist.`);
        if (
          tables.timeSheets.some(
            (s) => s.resourceNo === resourceNo && s.startingDate === startingDate
          )
        ) {
          throw new DemoHttpError(
            400,
            `A time sheet for ${resourceNo} starting ${startingDate} already exists.`
          );
        }
        const highest = Math.max(
          1000,
          ...tables.timeSheets.map((s) => Number(s.number.replace(/\D/g, '')) || 0)
        );
        const sheet: BCTimeSheet = {
          id: base.id as string,
          number: `TS${String(highest + 1).padStart(5, '0')}`,
          resourceNo,
          resourceName: resource.name,
          startingDate,
          endingDate: ymd(addDays(parseISO(startingDate), 6)),
          approverUserId: resource.timeSheetApproverUserId,
          openExists: false,
          submittedExists: false,
          rejectedExists: false,
          approvedExists: false,
          totalQuantity: 0,
          '@odata.etag': base['@odata.etag'] as string,
        };
        row = sheet as unknown as Row;
        break;
      }
      case 'timeSheetLines': {
        const sheet = tables.timeSheets.find((s) => s.number === body.timeSheetNo);
        if (!sheet)
          throw new DemoHttpError(400, `Time sheet ${String(body.timeSheetNo)} does not exist.`);
        const lineNo = Math.max(0, ...this.linesOf(sheet.number).map((l) => l.lineNo)) + 10000;
        row = {
          type: 'Job',
          description: '',
          chargeable: true,
          ...base,
          lineNo,
          status: 'Open',
          totalQuantity: 0,
        };
        break;
      }
      case 'jobPlanningLines': {
        const jobNo = String(body.jobNo ?? '');
        if (!tables.projects.some((p) => p.number === jobNo)) {
          throw new DemoHttpError(400, `Project ${jobNo} does not exist.`);
        }
        const lineNo =
          Math.max(
            0,
            ...tables.jobPlanningLines.filter((l) => l.jobNo === jobNo).map((l) => l.lineNo)
          ) + 10000;
        row = {
          type: 'Resource',
          lineType: 'Budget',
          unitOfMeasureCode: 'HOUR',
          ...base,
          lineNo,
          description: tables.resources.find((r) => r.number === body.number)?.name ?? '',
          currencyCode: '',
        };
        this.pricePlanningLine(row);
        break;
      }
      case 'projects': {
        const displayName = String(body.displayName ?? '').trim();
        if (!displayName) throw new DemoHttpError(400, 'A project needs a name.');
        const highest = Math.max(
          0,
          ...tables.projects.map((p) => Number(p.number.replace(/\D/g, '')) || 0)
        );
        const number = `J${String(Math.ceil((highest + 1) / 10) * 10).padStart(5, '0')}`;
        const customerNo = String(body.billToCustomerNo ?? '');
        const customer = tables.customers.find((c) => c.number === customerNo);
        if (customerNo && !customer)
          throw new DemoHttpError(400, `Customer ${customerNo} does not exist.`);
        row = {
          ...base,
          number,
          displayName,
          sellToCustomerNo: customerNo,
          sellToCustomerName: customer?.displayName ?? '',
          billToCustomerNo: customerNo,
          billToCustomerName: customer?.displayName ?? '',
          status: 'Open',
          blocked: ' ',
          startingDate: body.startingDate ?? ymd(this.now()),
          endingDate: body.endingDate ?? '',
          currencyCode: '',
          canEditPlan: true,
          canEditSourceLinks: true,
        };
        // A task to log time against straight away
        tables.jobTasks.push({
          id: demoGuid(this.nextSeq()),
          jobNo: number,
          jobTaskNo: '100',
          description: 'General',
          jobTaskType: 'Posting',
        });
        break;
      }
      case 'projectNotes':
        row = {
          jobNo: body.jobNo,
          note: body.note,
          id: n,
          createdAt: this.nowIso(),
          createdBy: 'ALEX.MORGAN',
          createdByName: 'Alex Morgan',
        };
        break;
      case 'projectSourceLinks': {
        const lineNo =
          Math.max(
            0,
            ...tables.projectSourceLinks.filter((l) => l.jobNo === body.jobNo).map((l) => l.lineNo)
          ) + 10000;
        row = {
          ...base,
          lineNo,
          learned: false,
          createdBy: 'ALEX.MORGAN',
          createdAt: this.nowIso(),
        };
        break;
      }
      case 'dayNotes':
        row = { ...base, entryNo: n, createdBy: 'ALEX.MORGAN', createdAt: this.nowIso() };
        break;
      case 'suggestionRequests':
      case 'timesheetReviewRequests':
      case 'planReviewRequests':
        row = {
          ...base,
          entryNo: n,
          status: 'Requested',
          progress: 'Waiting for Poppie',
          errorMessage: '',
          requestedBy: 'ALEX.MORGAN',
          requestedAt: this.nowIso(),
          startedAt: '',
          finishedAt: '',
          ...(table === 'suggestionRequests' ? { createdCount: 0, updatedCount: 0 } : {}),
        };
        break;
      default:
        row = base;
    }

    this.rows(table).push(row);
    return row;
  }

  private update(table: TableName, row: Row, body: Row): Row {
    // Keys and the ETag can't be changed
    const changes = Object.entries(body).filter(([field]) => !READ_ONLY_FIELDS.has(field));
    Object.assign(row, Object.fromEntries(changes));
    if (table === 'jobPlanningLines') this.pricePlanningLine(row);
    this.touch(row);
    return row;
  }

  private remove(table: TableName, row: Row): void {
    const tables = this.data.tables;
    const list = this.rows(table);
    list.splice(list.indexOf(row), 1);
    if (table === 'timeSheets') {
      const number = String(row.number);
      tables.timeSheetLines = tables.timeSheetLines.filter((l) => l.timeSheetNo !== number);
      tables.timeSheetDetails = tables.timeSheetDetails.filter((d) => d.timeSheetNo !== number);
    }
    if (table === 'timeSheetLines') {
      tables.timeSheetDetails = tables.timeSheetDetails.filter(
        (d) => !(d.timeSheetNo === row.timeSheetNo && d.timeSheetLineNo === row.lineNo)
      );
    }
  }

  /** A planning line's costs and prices, from its resource's rates */
  private pricePlanningLine(row: Row): void {
    const resource = this.data.tables.resources.find((r) => r.number === row.number);
    const perUnit = this.unitHours(
      String(row.number ?? ''),
      String(row.unitOfMeasureCode ?? 'HOUR')
    );
    const unitCost = (resource?.unitCost ?? 0) * perUnit;
    const unitPrice = (resource?.unitPrice ?? 0) * perUnit;
    const quantity = Number(row.quantity) || 0;
    Object.assign(row, {
      quantity,
      unitCost,
      unitPrice,
      totalCost: quantity * unitCost,
      totalPrice: quantity * unitPrice,
      unitCostLCY: unitCost,
      unitPriceLCY: unitPrice,
      totalCostLCY: quantity * unitCost,
      totalPriceLCY: quantity * unitPrice,
    });
  }

  private unitHours(resourceNo: string, code: string): number {
    const uom = this.data.tables.resourceUnitsOfMeasure.find(
      (u: BCResourceUnitOfMeasure) => u.resourceNo === resourceNo && u.code === code
    );
    return uom?.qtyPerUnitOfMeasure ?? 1;
  }

  // ============================================
  // Bound actions
  // ============================================

  private action(table: TableName, key: string, action: string, body: Row): Response {
    const row = this.find(table, key);
    const name = action.replace(/^Microsoft\.NAV\./, '');

    if (table === 'timeSheets') {
      const sheet = row as unknown as BCTimeSheet;
      const transitions: Record<string, [BCTimeSheetLine['status'][], BCTimeSheetLine['status']]> =
        {
          submit: [['Open', 'Rejected'], 'Submitted'],
          reopen: [['Submitted', 'Rejected'], 'Open'],
          approve: [['Submitted'], 'Approved'],
          reject: [['Submitted'], 'Rejected'],
        };
      const transition = transitions[name];
      if (!transition) throw new DemoHttpError(404, NOT_FOUND_ENDPOINT);
      const [from, to] = transition;
      const lines = this.linesOf(sheet.number).filter((l) => from.includes(l.status));
      if (lines.length === 0) {
        throw new DemoHttpError(400, `There are no time sheet lines to ${name}.`);
      }
      lines.forEach((line) => this.setLineStatus(line, to));
      this.touch(row);
      return noContent();
    }

    if (table === 'timeSheetLines') {
      const line = row as unknown as BCTimeSheetLine;
      if (name === 'setHoursForDate') {
        if (line.status !== 'Open' && line.status !== 'Rejected') {
          throw new DemoHttpError(
            400,
            `Status must be Open on the time sheet line, not ${line.status}.`
          );
        }
        this.setHoursForDate(line, String(body.entryDate ?? ''), Number(body.hours) || 0);
        return noContent();
      }
      if (name === 'approve' || name === 'reject') {
        if (line.status !== 'Submitted') {
          throw new DemoHttpError(
            400,
            `Status must be Submitted on the time sheet line, not ${line.status}.`
          );
        }
        this.setLineStatus(line, name === 'approve' ? 'Approved' : 'Rejected');
        return noContent();
      }
    }

    if (table === 'resources' && name === 'setGitHubUsername') {
      row.githubUsername = String(body.githubUsername ?? '').trim();
      this.touch(row);
      return noContent();
    }

    if (table === 'planReviewLines' && name === 'applyChanges') {
      this.applyPlanReviewFinding(row as unknown as BCPlanReviewLine);
      return noContent();
    }

    throw new DemoHttpError(404, NOT_FOUND_ENDPOINT);
  }

  private setLineStatus(line: BCTimeSheetLine, status: BCTimeSheetLine['status']): void {
    line.status = status;
    this.touch(line as unknown as Row);
    for (const detail of this.detailsOf(line)) detail.status = status;
  }

  private setHoursForDate(line: BCTimeSheetLine, date: string, hours: number): void {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new DemoHttpError(400, 'Invalid date.');
    const sheet = this.data.tables.timeSheets.find((s) => s.number === line.timeSheetNo);
    if (sheet && (date < sheet.startingDate || date > sheet.endingDate)) {
      throw new DemoHttpError(400, `${date} is outside the time sheet's period.`);
    }
    const details = this.data.tables.timeSheetDetails;
    const existing = details.find(
      (d) =>
        d.timeSheetNo === line.timeSheetNo && d.timeSheetLineNo === line.lineNo && d.date === date
    );
    if (hours === 0) {
      if (existing) details.splice(details.indexOf(existing), 1);
    } else if (existing) {
      existing.quantity = hours;
      this.touch(existing as unknown as Row);
    } else {
      const n = this.nextSeq();
      details.push({
        id: demoGuid(n),
        timeSheetNo: line.timeSheetNo,
        timeSheetLineNo: line.lineNo,
        date,
        quantity: hours,
        postedQuantity: 0,
        status: line.status,
        jobNo: line.jobNo,
        lastModifiedDateTime: this.nowIso(),
        '@odata.etag': demoEtag(n),
      });
    }
    this.touch(line as unknown as Row);
  }

  private applyPlanReviewFinding(finding: BCPlanReviewLine): void {
    if (finding.appliedAt) throw new DemoHttpError(400, 'These changes have already been applied.');
    const tables = this.data.tables;
    const changes = tables.planReviewChanges.filter(
      (c) => c.reviewEntryNo === finding.reviewEntryNo && c.reviewLineNo === finding.lineNo
    );
    for (const change of changes) {
      const cellLines = tables.jobPlanningLines.filter(
        (l) =>
          l.jobNo === change.jobNo &&
          l.jobTaskNo === change.jobTaskNo &&
          l.number === change.resourceNo &&
          l.type === 'Resource' &&
          l.lineType === 'Budget' &&
          l.planningDate.slice(0, 10) === change.planningDate
      );
      const [first, ...others] = cellLines;
      tables.jobPlanningLines = tables.jobPlanningLines.filter((l) => !others.includes(l));
      if (change.proposedHours <= 0) {
        if (first) tables.jobPlanningLines.splice(tables.jobPlanningLines.indexOf(first), 1);
      } else if (first) {
        this.update('jobPlanningLines', first as unknown as Row, {
          quantity:
            change.proposedHours / this.unitHours(first.number, first.unitOfMeasureCode ?? 'HOUR'),
        });
      } else {
        this.create('jobPlanningLines', {
          jobNo: change.jobNo,
          jobTaskNo: change.jobTaskNo,
          number: change.resourceNo,
          planningDate: change.planningDate,
          quantity: change.proposedHours,
        });
      }
    }
    finding.appliedAt = this.nowIso();
    finding.appliedBy = 'ALEX.MORGAN';
  }

  // ============================================
  // Poppie, simulated
  // ============================================

  /** Move open requests along: picked up after a moment, done a few seconds later */
  private runAgent(): Promise<void> {
    this.agentPass = this.agentPass.then(() => this.agentStep());
    return this.agentPass;
  }

  private async agentStep(): Promise<void> {
    const now = this.now().getTime();
    const tables = this.data.tables;
    let changed = false;

    const step = async <T extends { status: string; requestedAt?: string }>(
      request: T,
      finish: (request: T) => Promise<void> | void
    ) => {
      if (request.status !== 'Requested' && request.status !== 'Running') return;
      const age = now - (Date.parse(request.requestedAt ?? '') || now);
      const row = request as unknown as Row;
      if (age >= DEMO_AGENT_FINISH_MS) {
        await finish(request);
        row.status = 'Done';
        row.finishedAt = this.nowIso();
        row.startedAt ||= this.nowIso();
        changed = true;
      } else if (age >= DEMO_AGENT_START_MS && request.status === 'Requested') {
        row.status = 'Running';
        row.startedAt = this.nowIso();
        row.progress = 'Poppie is working on it';
        changed = true;
      }
    };

    for (const request of tables.suggestionRequests) {
      await step(request, (r) => this.finishSuggestionRequest(r));
    }
    for (const request of tables.timesheetReviewRequests) {
      await step(request, (r) => this.finishTimesheetReview(r));
    }
    for (const request of tables.planReviewRequests) {
      await step(request, (r) => this.finishPlanReview(r));
    }
    if (changed) this.save();
  }

  private finishSuggestionRequest(request: BCSuggestionRequest): void {
    const tables = this.data.tables;
    const today = ymd(this.now());
    const lastDay = request.toDate < today ? request.toDate : today;
    // The person's latest entry that week, or their latest of all, tells Poppie the project
    const lines = tables.timeSheetLines.filter((l) => {
      const sheet = tables.timeSheets.find((s) => s.number === l.timeSheetNo);
      const project = tables.projects.find((p) => p.number === l.jobNo);
      return sheet?.resourceNo === request.resourceNo && !!project?.billToCustomerNo;
    });
    const line = lines.at(-1);
    const task = tables.jobTasks.find(
      (t) => t.jobNo === line?.jobNo && t.jobTaskNo === line?.jobTaskNo
    );
    const sheet = tables.timeSheets.find(
      (s) => s.resourceNo === request.resourceNo && s.startingDate === request.fromDate
    );
    if (!line || lastDay < request.fromDate) {
      Object.assign(request, {
        progress: 'Checked your calendar, GitHub and Azure DevOps: nothing new',
      });
      return;
    }
    const n = this.nextSeq();
    tables.timeSuggestions.push({
      id: demoGuid(n),
      entryNo: n,
      resourceNo: request.resourceNo,
      date: lastDay,
      quantity: 1,
      jobNo: line.jobNo ?? '',
      jobTaskNo: line.jobTaskNo ?? '',
      description: `Code review: ${task?.description ?? 'project work'}`,
      source: 'GitHub',
      sourceRef: 'Pull request review',
      evidence: 'Reviewed a pull request and left 6 comments',
      confidence: 'Medium',
      status: 'Pending',
      timeSheetNo: sheet?.number,
      createdBy: AGENT_NAME,
      createdAt: this.nowIso(),
      '@odata.etag': demoEtag(n),
    });
    Object.assign(request, {
      createdCount: 1,
      progress: 'Checked your calendar, GitHub and Azure DevOps: 1 new suggestion',
    });
  }

  private finishTimesheetReview(request: BCTimesheetReviewRequest): void {
    const tables = this.data.tables;
    const sheet = tables.timeSheets.find((s) => s.number === request.timeSheetNo);
    if (!sheet) {
      Object.assign(request, { progress: 'Time sheet not found' });
      return;
    }
    const lines = this.linesOf(sheet.number);
    const details = tables.timeSheetDetails.filter((d) => d.timeSheetNo === sheet.number);
    const person = demoPerson(sheet.resourceNo);
    const capacity = person ? (person.weeklyCapacity ?? person.workdays.length * 8) : 40;
    const total = details.reduce((sum, d) => sum + d.quantity, 0);
    const notes: Array<Pick<BCTimesheetReviewLine, 'timeSheetLineNo' | 'severity' | 'note'>> = [];
    if (total < capacity) {
      notes.push({
        timeSheetLineNo: 0,
        severity: 'Warning',
        note: `${total} hours logged against a ${capacity}-hour week. Is any time missing?`,
      });
    }
    for (const line of lines) {
      if (!line.description?.trim() && this.lineTotal(line) > 0) {
        notes.push({
          timeSheetLineNo: line.lineNo,
          severity: 'Info',
          note: 'No comment on this entry.',
        });
      }
    }
    const stamps = [...lines, ...details]
      .map((r) => r.lastModifiedDateTime ?? '')
      .filter(Boolean)
      .sort((a, b) => Date.parse(a) - Date.parse(b));
    const n = this.nextSeq();
    tables.timesheetReviews.push({
      id: demoGuid(n),
      entryNo: n,
      timeSheetNo: sheet.number,
      versionStamp: stamps.at(-1) ?? this.nowIso(),
      verdict: notes.length > 0 ? 'Check' : 'Approve',
      summary:
        notes.length > 0
          ? 'A couple of things to check before this is approved.'
          : 'Hours are complete and every entry has a comment.',
      reviewer: AGENT_NAME,
      reviewedAt: this.nowIso(),
      lastModifiedDateTime: this.nowIso(),
    });
    notes.forEach((note, index) =>
      tables.timesheetReviewLines.push({
        id: demoGuid(this.nextSeq()),
        reviewEntryNo: n,
        lineNo: (index + 1) * 10000,
        timeSheetNo: sheet.number,
        ...note,
      })
    );
    Object.assign(request, { progress: 'Review written' });
  }

  private async finishPlanReview(request: BCPlanReviewRequest): Promise<void> {
    const tables = this.data.tables;
    const lines = this.subjectWeekLines(request.subjectType, request.subjectNo, request.weekStart);
    const uoms = buildUOMConversionMap(tables.resourceUnitsOfMeasure);
    // Hours per person per day, to spot over-booked days
    const byDay = new Map<string, number>();
    for (const line of lines) {
      const key = `${line.number}|${line.planningDate.slice(0, 10)}`;
      byDay.set(key, (byDay.get(key) ?? 0) + convertToHours(line.number, line.quantity, uoms));
    }
    const overbooked = [...byDay.entries()].filter(([, hours]) => hours > 8);
    const n = this.nextSeq();
    const review: BCPlanReview = {
      id: demoGuid(n),
      entryNo: n,
      subjectType: request.subjectType,
      subjectNo: request.subjectNo,
      weekStart: request.weekStart,
      planHash: await this.planHash(request.subjectType, request.subjectNo, request.weekStart),
      verdict: overbooked.length > 0 ? 'Query' : 'Approve',
      summary:
        overbooked.length > 0
          ? `${overbooked.length} over-booked day${overbooked.length === 1 ? '' : 's'} this week.`
          : 'Planned within capacity every day.',
      reviewer: AGENT_NAME,
      reviewedAt: this.nowIso(),
    };
    tables.planReviews.push(review);
    overbooked.forEach(([key, hours], index) => {
      const [resourceNo, date] = key.split('|');
      tables.planReviewLines.push({
        id: demoGuid(this.nextSeq()),
        reviewEntryNo: n,
        lineNo: (index + 1) * 10000,
        severity: 'Issue',
        check: 'OVER_CAPACITY',
        planningDate: date,
        jobNo: '',
        resourceNo,
        note: `${hours}h planned against an 8-hour day.`,
        appliedAt: '',
        appliedBy: '',
      });
    });
    Object.assign(request, { progress: 'Review written' });
  }

  /** The Resource planning lines with hours in a subject-week, as the Plan shows them */
  private subjectWeekLines(
    subjectType: BCPlanReview['subjectType'],
    subjectNo: string,
    weekStart: string
  ): BCJobPlanningLine[] {
    const weekEnd = ymd(addDays(parseISO(weekStart), 6));
    return this.data.tables.jobPlanningLines.filter((line) => {
      const date = line.planningDate.slice(0, 10);
      const isSubject =
        subjectType === 'Resource' ? line.number === subjectNo : line.jobNo === subjectNo;
      return (
        isSubject &&
        line.type === 'Resource' &&
        line.quantity > 0 &&
        date >= weekStart &&
        date <= weekEnd
      );
    });
  }

  private planHash(
    subjectType: BCPlanReview['subjectType'],
    subjectNo: string,
    weekStart: string
  ): Promise<string> {
    const uoms = buildUOMConversionMap(this.data.tables.resourceUnitsOfMeasure);
    return computePlanHash(
      planHashEntriesFromLines(this.subjectWeekLines(subjectType, subjectNo, weekStart), uoms)
    );
  }
}

let server: DemoBcServer | null = null;

function tabStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

/** The tab's demo Business Central, created on first use */
export function getDemoBcServer(): DemoBcServer {
  server ??= new DemoBcServer({ storage: tabStorage() });
  return server;
}

/** Forget the demo Business Central (tests) */
export function resetDemoBcServer(): void {
  server = null;
}

/** fetch for Business Central in the demo: answered in the browser, never sent */
export function demoBcFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return getDemoBcServer().handle(input, init);
}
