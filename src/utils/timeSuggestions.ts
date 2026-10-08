import type { BCTimeSuggestion, BCTimeSuggestionUpdate, TimeEntry } from '@/types';

// BC Time Sheet Line Description field has a 100-character limit
const MAX_DESCRIPTION_LENGTH = 100;

/**
 * Round hours up to the next quarter hour (minimum 15 minutes), matching the
 * 15-minute steps the time entry form allows. Any part of a quarter counts, so
 * 31 minutes becomes 45; exact quarters stay as they are. Calendar evidence is
 * often to the minute, which the form would otherwise reject.
 */
export function roundToQuarterHour(hours: number): number {
  // Round to 6 places first so float noise (e.g. 0.5000000001) doesn't push an exact quarter up
  const quarters = Math.ceil(Number((hours * 4).toFixed(6)));
  return Math.max(0.25, quarters / 4);
}

/**
 * Whether two durations are close enough to be the same piece of work: within
 * 15 minutes, or 15% of the longer one for longer blocks.
 */
export function isSimilarHours(a: number, b: number): boolean {
  const tolerance = Math.max(0.25, 0.15 * Math.max(a, b));
  return Math.abs(a - b) <= tolerance + 1e-9;
}

const normalise = (text: string | undefined) => (text || '').trim().toLowerCase();

/**
 * A suggestion duplicates an entry already in the week when it's on the same date
 * with similar hours, and either targets the same project (and task, if Poppie
 * named one) or carries the same description as the entry's notes. Accepted
 * suggestions whose status write-back failed are caught by this too.
 */
export function isDuplicateOfEntry(suggestion: BCTimeSuggestion, entry: TimeEntry): boolean {
  if (entry.date !== suggestion.date) return false;
  if (!isSimilarHours(entry.hours, suggestion.quantity)) return false;

  if (suggestion.jobNo) {
    const sameProject = entry.projectId === suggestion.jobNo;
    const sameTask = !suggestion.jobTaskNo || entry.taskId === suggestion.jobTaskNo;
    if (sameProject && sameTask) return true;
  }

  const description = normalise(suggestion.description);
  return description !== '' && description === normalise(entry.notes);
}

/** Drop suggestions that duplicate an entry already in the week. */
export function hideDuplicateSuggestions(
  suggestions: BCTimeSuggestion[],
  entries: TimeEntry[]
): BCTimeSuggestion[] {
  return suggestions.filter((s) => !entries.some((e) => isDuplicateOfEntry(s, e)));
}

/** Group suggestions by date, most recent day first (today at the top), keeping each day's order stable. */
export function groupSuggestionsByDay(
  suggestions: BCTimeSuggestion[]
): Array<{ date: string; suggestions: BCTimeSuggestion[] }> {
  const byDate = new Map<string, BCTimeSuggestion[]>();
  for (const suggestion of suggestions) {
    const day = byDate.get(suggestion.date);
    if (day) day.push(suggestion);
    else byDate.set(suggestion.date, [suggestion]);
  }
  return Array.from(byDate.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, items]) => ({ date, suggestions: items }));
}

/**
 * Whether a suggestion can be added in one click: it needs a project and task,
 * and a description when the company requires timesheet comments. Anything else
 * goes through the entry modal so the person can fill the gaps.
 */
export function canQuickAdd(suggestion: BCTimeSuggestion, requireComments: boolean): boolean {
  if (!suggestion.jobNo || !suggestion.jobTaskNo) return false;
  if (requireComments && !suggestion.description?.trim()) return false;
  return true;
}

/**
 * Whether Poppie guessed the suggestion's project (from a customer's domain or a name match)
 * rather than taking it from a rule; her evidence says "Guessed project ..." in that case.
 * A guess should be checked by the person, so it never saves in one click.
 */
export function isGuessedProject(suggestion: BCTimeSuggestion): boolean {
  return /\bguessed project\b/i.test(suggestion.evidence ?? '');
}

/** Notes for the time entry a suggestion becomes, trimmed to BC's field length. */
export function suggestionNotes(suggestion: BCTimeSuggestion): string {
  return (suggestion.description || '').trim().slice(0, MAX_DESCRIPTION_LENGTH);
}

/** The write-back that marks a suggestion accepted and records the line it became. */
export function buildAcceptUpdate(
  timeSheetNo: string,
  timeSheetLineNo: number | null,
  now: Date = new Date()
): BCTimeSuggestionUpdate {
  return {
    status: 'Accepted',
    timeSheetNo,
    ...(timeSheetLineNo !== null && { timeSheetLineNo }),
    actionedAt: now.toISOString(),
  };
}

/** The write-back that marks a suggestion dismissed. */
export function buildDismissUpdate(now: Date = new Date()): BCTimeSuggestionUpdate {
  return { status: 'Dismissed', actionedAt: now.toISOString() };
}
