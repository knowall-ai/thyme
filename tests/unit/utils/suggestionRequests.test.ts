import { describe, it, expect } from 'vitest';
import {
  FEW_SUGGESTIONS,
  QUEUED_SLOW_AFTER_MS,
  isOpenRequest,
  requestDoneText,
  requestProgressText,
  shouldOfferRequest,
  weekTiming,
} from '@/utils/suggestionRequests';

// Local dates, so the result doesn't depend on the test machine's time zone
const thu8Oct = new Date(2026, 9, 8, 15, 0);
const weekOf28Sep = new Date(2026, 8, 28);
const weekOf5Oct = new Date(2026, 9, 5);
const weekOf12Oct = new Date(2026, 9, 12);

describe('weekTiming', () => {
  it('tells past, current and future weeks apart', () => {
    expect(weekTiming(weekOf28Sep, thu8Oct)).toBe('past');
    expect(weekTiming(weekOf5Oct, thu8Oct)).toBe('current');
    expect(weekTiming(weekOf12Oct, thu8Oct)).toBe('future');
  });

  it('counts Sunday as part of the current week', () => {
    expect(weekTiming(weekOf5Oct, new Date(2026, 9, 11, 23, 0))).toBe('current');
  });
});

describe('shouldOfferRequest', () => {
  const base = { canRequest: true, request: null, suggestionCount: 0 };

  it('always offers it for a past week, even with suggestions', () => {
    expect(shouldOfferRequest({ ...base, timing: 'past', suggestionCount: 20 })).toBe(true);
  });

  it('offers it for the current week only when it has few suggestions', () => {
    expect(
      shouldOfferRequest({ ...base, timing: 'current', suggestionCount: FEW_SUGGESTIONS - 1 })
    ).toBe(true);
    expect(
      shouldOfferRequest({ ...base, timing: 'current', suggestionCount: FEW_SUGGESTIONS })
    ).toBe(false);
  });

  it('never offers it for a future week, without permission, or while a request is open', () => {
    expect(shouldOfferRequest({ ...base, timing: 'future' })).toBe(false);
    expect(shouldOfferRequest({ ...base, timing: 'past', canRequest: false })).toBe(false);
    expect(shouldOfferRequest({ ...base, timing: 'past', request: { status: 'Requested' } })).toBe(
      false
    );
    expect(shouldOfferRequest({ ...base, timing: 'past', request: { status: 'Running' } })).toBe(
      false
    );
  });

  it('offers it again once the last request has finished', () => {
    expect(shouldOfferRequest({ ...base, timing: 'past', request: { status: 'Failed' } })).toBe(
      true
    );
    expect(shouldOfferRequest({ ...base, timing: 'past', request: { status: 'Done' } })).toBe(true);
  });
});

describe('isOpenRequest', () => {
  it('is open until Done or Failed', () => {
    expect(isOpenRequest({ status: 'Requested' })).toBe(true);
    expect(isOpenRequest({ status: 'Running' })).toBe(true);
    expect(isOpenRequest({ status: 'Done' })).toBe(false);
    expect(isOpenRequest({ status: 'Failed' })).toBe(false);
  });
});

describe('requestProgressText', () => {
  const now = Date.parse('2026-10-08T14:00:00Z');

  it('shows what Poppie is checking while she runs', () => {
    expect(
      requestProgressText({ status: 'Running', progress: 'Checking calendar for Tue 6 Oct' }, now)
    ).toBe('Checking calendar for Tue 6 Oct');
    expect(requestProgressText({ status: 'Running', progress: '' }, now)).toBe('Starting…');
  });

  it('says she will start within a minute, or that she seems offline after a while', () => {
    const justNow = new Date(now - 10_000).toISOString();
    const longAgo = new Date(now - QUEUED_SLOW_AFTER_MS - 1).toISOString();
    expect(
      requestProgressText({ status: 'Requested', progress: '', requestedAt: justNow }, now)
    ).toBe('Queued: Poppie will start within a minute.');
    expect(
      requestProgressText({ status: 'Requested', progress: '', requestedAt: longAgo }, now)
    ).toMatch(/offline/);
  });
});

describe('requestDoneText', () => {
  it("uses Poppie's summary", () => {
    expect(
      requestDoneText(
        { progress: '3 new suggestions and 1 updated.', createdCount: 3, updatedCount: 1 },
        { visibleCount: 4 }
      )
    ).toBe('3 new suggestions and 1 updated.');
  });

  it('tells an approver where the suggestions went when they cannot see them', () => {
    expect(
      requestDoneText(
        { progress: '2 new suggestions.', createdCount: 2, updatedCount: 0 },
        { visibleCount: 0, personName: 'Alex Example' }
      )
    ).toBe('2 new suggestions. Alex Example will see them on their timesheet.');
  });

  it('falls back to the counts without a summary', () => {
    expect(
      requestDoneText({ progress: '', createdCount: 0, updatedCount: 0 }, { visibleCount: 0 })
    ).toBe('Nothing new to suggest for this week.');
  });
});
