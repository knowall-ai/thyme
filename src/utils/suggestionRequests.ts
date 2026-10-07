import type { BCSuggestionRequest } from '@/types';
import { formatDate, getWeekEnd } from './dateUtils';

// Fewer suggestions than this in the current week and the Request button is offered there too
export const FEW_SUGGESTIONS = 3;
// Queued for longer than this and Poppie is probably offline (she polls every minute)
export const QUEUED_SLOW_AFTER_MS = 3 * 60 * 1000;

export type WeekTiming = 'past' | 'current' | 'future';

/** Whether the week starting weekStart is over, under way, or still to come (local dates). */
export function weekTiming(weekStart: Date, now: Date = new Date()): WeekTiming {
  const today = formatDate(now);
  if (formatDate(weekStart) > today) return 'future';
  if (formatDate(getWeekEnd(weekStart)) < today) return 'past';
  return 'current';
}

/** Requested or Running: Poppie hasn't finished it yet. */
export function isOpenRequest(request: Pick<BCSuggestionRequest, 'status'>): boolean {
  return request.status === 'Requested' || request.status === 'Running';
}

/**
 * Whether to offer "Request suggestions": never for a future week or while a request is
 * open; always for a past week; for the current week only when it has few suggestions
 * (Poppie's midday and evening runs normally cover it).
 */
export function shouldOfferRequest(params: {
  canRequest: boolean;
  timing: WeekTiming;
  request: Pick<BCSuggestionRequest, 'status'> | null;
  suggestionCount: number;
}): boolean {
  const { canRequest, timing, request, suggestionCount } = params;
  if (!canRequest || timing === 'future') return false;
  if (request && isOpenRequest(request)) return false;
  return timing === 'past' || suggestionCount < FEW_SUGGESTIONS;
}

/** The line shown next to the spinner while a request is open. */
export function requestProgressText(
  request: Pick<BCSuggestionRequest, 'status' | 'progress' | 'requestedAt'>,
  now: number = Date.now()
): string {
  if (request.status === 'Running') return request.progress || 'Starting…';
  const requestedAt = request.requestedAt ? Date.parse(request.requestedAt) : NaN;
  if (Number.isFinite(requestedAt) && now - requestedAt > QUEUED_SLOW_AFTER_MS) {
    return "Still queued: Poppie seems to be offline. She'll start as soon as she's back.";
  }
  return 'Queued: Poppie will start within a minute.';
}

/**
 * What to say when a request is Done. Poppie's own summary first; when the suggestions
 * aren't visible here (an approver asking for someone else), say where they went.
 */
export function requestDoneText(
  request: Pick<BCSuggestionRequest, 'progress' | 'createdCount' | 'updatedCount'>,
  options: { visibleCount: number; personName?: string | null }
): string {
  const summary =
    request.progress ||
    (request.createdCount || request.updatedCount
      ? `${request.createdCount} new, ${request.updatedCount} updated.`
      : 'Nothing new to suggest for this week.');
  if (options.personName && request.createdCount > 0 && options.visibleCount === 0) {
    return `${summary} ${options.personName} will see them on their timesheet.`;
  }
  return summary;
}
