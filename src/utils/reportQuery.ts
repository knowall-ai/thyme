/**
 * The Reports view in the URL, so a refresh keeps it and a link opens the same report:
 *
 *   /reports?view=entries&from=2026-04-01&to=2026-10-15&project=INT002&task=1415&stage=approved
 *
 * Lists are comma separated. A parameter that's missing means everything (or, for the
 * period, this week); anything that can't be read is ignored rather than failing.
 */

import { differenceInCalendarDays, format, isValid, parseISO } from 'date-fns';
import { customPeriod, getPresetPeriod, periodOf, type ReportPeriod } from './reportPeriod';
import {
  NO_REPORT_FILTER,
  REPORT_STAGES,
  type ReportFilter,
  type ReportStage,
} from './reportFilters';

export type ReportView = 'summary' | 'entries';

export interface ReportQuery {
  view: ReportView;
  period: ReportPeriod;
  filter: ReportFilter;
  /** Resource numbers; none for everyone */
  resourceNos: readonly string[];
}

const PARAMS = {
  view: 'view',
  from: 'from',
  to: 'to',
  unit: 'unit',
  client: 'client',
  project: 'project',
  task: 'task',
  resource: 'resource',
  stage: 'stage',
} as const;

/** The parameters this page owns: anything else in the URL is left alone */
export const REPORT_QUERY_PARAMS: readonly string[] = Object.values(PARAMS);

const CALENDAR_UNITS = ['week', 'month', 'quarter', 'year'] as const;
const STAGE_IDS = new Set<string>(REPORT_STAGES.map((s) => s.id));
// BC codes (project, task and resource numbers) are Code[20]; a customer's is too
const MAX_VALUES = 50;
const MAX_VALUE_LENGTH = 40;
/**
 * The longest period a link can ask for: ten years, which covers any project's life
 * (the project page links to a project's time from its first day to its last), but
 * stops a URL from making Reports load decades of every timesheet
 */
export const MAX_REPORT_PERIOD_DAYS = 3653;

const dateParam = (date: Date) => format(date, 'yyyy-MM-dd');

function parseDate(value: string | null): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = parseISO(value);
  return isValid(date) ? date : null;
}

function parseList(value: string | null): string[] {
  if (!value) return [];
  const values = value
    .split(',')
    .map((v) => v.trim())
    .filter((v) => v && v.length <= MAX_VALUE_LENGTH);
  return [...new Set(values)].slice(0, MAX_VALUES);
}

/**
 * The period from `from`, `to` and `unit`: a whole week, month, quarter or year when the
 * dates are exactly one (so the arrows step by it), otherwise a custom range. This week
 * when there are no dates.
 */
function parsePeriod(params: URLSearchParams, today: Date): ReportPeriod {
  const from = parseDate(params.get(PARAMS.from));
  const to = parseDate(params.get(PARAMS.to)) ?? from;
  if (!from || !to) return getPresetPeriod('thisWeek', today);
  if (Math.abs(differenceInCalendarDays(to, from)) >= MAX_REPORT_PERIOD_DAYS) {
    return getPresetPeriod('thisWeek', today);
  }

  const unit = params.get(PARAMS.unit);
  if (unit === 'yearToDate') {
    const ytd = getPresetPeriod('yearToDate', to);
    if (dateParam(ytd.from) === dateParam(from)) return ytd;
  }
  const calendarUnit = CALENDAR_UNITS.find((u) => u === unit);
  if (calendarUnit) {
    const period = periodOf(calendarUnit, from);
    if (dateParam(period.from) === dateParam(from) && dateParam(period.to) === dateParam(to)) {
      return period;
    }
  }
  return customPeriod(from, to);
}

/** The Reports view a URL's query describes */
export function parseReportQuery(search: string, today: Date = new Date()): ReportQuery {
  const params = new URLSearchParams(search);
  return {
    view: params.get(PARAMS.view) === 'entries' ? 'entries' : 'summary',
    period: parsePeriod(params, today),
    filter: {
      clientIds: parseList(params.get(PARAMS.client)),
      // Project, task and resource numbers are BC codes: upper case, as BC stores them
      projectNos: parseList(params.get(PARAMS.project)).map((v) => v.toUpperCase()),
      taskNos: parseList(params.get(PARAMS.task)).map((v) => v.toUpperCase()),
      stages: parseList(params.get(PARAMS.stage))
        .map((v) => v.toLowerCase())
        .filter((v): v is ReportStage => STAGE_IDS.has(v)),
    },
    resourceNos: parseList(params.get(PARAMS.resource)).map((v) => v.toUpperCase()),
  };
}

/** The query for a Reports view, without the `?`; parameters for everything are left out */
export function buildReportQuery(query: Partial<ReportQuery>): string {
  const params = new URLSearchParams();
  const filter = query.filter ?? NO_REPORT_FILTER;
  if (query.view === 'entries') params.set(PARAMS.view, 'entries');
  if (query.period) {
    params.set(PARAMS.from, dateParam(query.period.from));
    params.set(PARAMS.to, dateParam(query.period.to));
    if (query.period.unit !== 'custom') params.set(PARAMS.unit, query.period.unit);
  }
  const lists: [string, readonly string[]][] = [
    [PARAMS.client, filter.clientIds],
    [PARAMS.project, filter.projectNos],
    [PARAMS.task, filter.taskNos],
    [PARAMS.resource, query.resourceNos ?? []],
    [PARAMS.stage, filter.stages],
  ];
  for (const [name, values] of lists) {
    if (values.length > 0) params.set(name, values.join(','));
  }
  // Commas and colons read better unescaped, and are safe in a query value
  return params.toString().replace(/%2C/gi, ',').replace(/%3A/gi, ':');
}

/**
 * `search` with this page's parameters replaced by the query's, keeping any others
 * (e.g. a tracking parameter) as they were. Returns `?…`, or '' when there's nothing.
 */
export function withReportQuery(search: string, query: Partial<ReportQuery>): string {
  const params = new URLSearchParams(search);
  for (const name of REPORT_QUERY_PARAMS) params.delete(name);
  const others = params.toString();
  const own = buildReportQuery(query);
  const text = [own, others].filter(Boolean).join('&');
  return text ? `?${text}` : '';
}
