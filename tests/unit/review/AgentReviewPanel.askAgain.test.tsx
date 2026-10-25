import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { BCTimesheetReviewRequest } from '@/types';
import type { TimesheetReviewResult } from '@/hooks';

const presence = vi.fn();
vi.mock('@/hooks/useAgentPresence', () => ({
  useAgentPresence: (enabled: boolean) => presence(enabled),
}));
vi.mock('@/services/auth/reviewerIdentity', () => ({
  useReviewerPhoto: () => null,
}));

import { AgentReviewPanel } from '@/components/review/AgentReviewPanel';

const request = (
  status: BCTimesheetReviewRequest['status'],
  overrides: Partial<BCTimesheetReviewRequest> = {}
): BCTimesheetReviewRequest => ({
  id: '00000000-0000-0000-0000-00000000e005',
  entryNo: 1,
  timeSheetNo: 'TS0001',
  status,
  progress: '',
  errorMessage: '',
  ...overrides,
});

function result(overrides: Partial<TimesheetReviewResult> = {}): TimesheetReviewResult {
  return {
    status: 'outOfDate',
    review: {
      id: 'r1',
      entryNo: 1,
      timeSheetNo: 'TS0001',
      versionStamp: '2026-10-05T09:00:00Z',
      verdict: 'Check',
      summary: 'Worth a look',
      reviewer: 'Poppie',
      reviewedAt: '2026-10-05T09:10:00Z',
    },
    notes: [],
    notesByLine: new Map(),
    verdict: { label: 'Worth a check', tone: 'amber' },
    submitted: false,
    currentStamp: '2026-10-06T09:00:00Z',
    request: null,
    canRequestReview: true,
    requestReview: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

const button = () => screen.queryByRole('button', { name: 'Ask Timmie to look again' });

describe('AgentReviewPanel: Ask Timmie to look again', () => {
  beforeEach(() => {
    presence.mockReturnValue({ isAvailable: true, state: 'online', lastSeenAt: null });
  });

  it('offers the button on an out-of-date review, and says so in the banner', () => {
    render(<AgentReviewPanel result={result()} variant="submitter" />);
    expect(button()).toBeInTheDocument();
    expect(
      screen.getByText(
        'This timesheet changed after Timmie reviewed it. Ask it to look again, or it will once it’s resubmitted.'
      )
    ).toBeInTheDocument();
  });

  it('offers it on a current review too, as the plan does', () => {
    render(<AgentReviewPanel result={result({ status: 'current' })} variant="approver" />);
    expect(button()).toBeInTheDocument();
  });

  it('hides the button, and keeps the old banner, on an extension without requests', () => {
    render(<AgentReviewPanel result={result({ canRequestReview: false })} variant="submitter" />);
    expect(button()).not.toBeInTheDocument();
    expect(
      screen.getByText(
        'This timesheet changed after Timmie reviewed it. Timmie will take another look once it’s resubmitted.'
      )
    ).toBeInTheDocument();
  });

  it('asks when clicked', async () => {
    const value = result();
    render(<AgentReviewPanel result={value} variant="submitter" />);
    fireEvent.click(button()!);
    await waitFor(() => expect(value.requestReview).toHaveBeenCalledTimes(1));
  });

  it('shows the reason when asking fails', async () => {
    const value = result({
      requestReview: vi
        .fn()
        .mockRejectedValue(new Error("You can't ask Timmie to review this timesheet.")),
    });
    render(<AgentReviewPanel result={value} variant="submitter" />);
    fireEvent.click(button()!);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "You can't ask Timmie to review this timesheet."
    );
    expect(button()).toBeInTheDocument();
  });

  it('shows the queue while waiting, and checks whether Timmie is online', () => {
    render(
      <AgentReviewPanel result={result({ request: request('Requested') })} variant="submitter" />
    );
    expect(button()).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Queued: Timmie will look within 10 minutes.'
    );
    expect(presence).toHaveBeenCalledWith(true);
  });

  it('says when Timmie is offline', () => {
    presence.mockReturnValue({ isAvailable: true, state: 'offline', lastSeenAt: null });
    render(
      <AgentReviewPanel result={result({ request: request('Requested') })} variant="submitter" />
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      "Queued: Timmie will pick this up when it's back online."
    );
  });

  it("shows Timmie's progress while it works", () => {
    render(
      <AgentReviewPanel
        result={result({ request: request('Running', { progress: 'Checking the lines…' }) })}
        variant="approver"
      />
    );
    expect(screen.getByRole('status')).toHaveTextContent('Checking the lines…');
    expect(presence).toHaveBeenCalledWith(false);
  });

  it('says why a request failed and offers the button again', () => {
    render(
      <AgentReviewPanel
        result={result({ request: request('Failed', { errorMessage: 'No lines to review.' }) })}
        variant="submitter"
      />
    );
    expect(screen.getByText('No lines to review.')).toBeInTheDocument();
    expect(button()).toBeInTheDocument();
  });
});
