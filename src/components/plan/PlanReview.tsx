'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';
import {
  ArrowPathIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { format, parseISO, startOfWeek } from 'date-fns';
import type {
  BCPlanReviewChange,
  BCPlanReviewLine,
  PlanReviewSubjectType,
  TimesheetReviewSeverity,
} from '@/types';
import type { PlanReviewChangesState } from '@/hooks/usePlanReviewStore';
import {
  PoppieAvatar,
  SeverityIcon,
  VERDICT_TONE_CLASSES,
} from '@/components/review/PoppieReviewBits';
import {
  changesForLine,
  cn,
  computePopoverPosition,
  formatHours,
  formatPlanReviewWeekLabel,
  getPlanReviewCheckLabel,
  getPlanVerdictDisplay,
  isOpenPlanReviewRequest,
  planCellManualMessage,
  planReviewRequestText,
  sortPlanReviewLines,
  summarizePlanReviewWeek,
  worstPlanReviewSeverity,
  type ApplyPlanChangesResult,
  type PlanReviewSubjectWeek,
} from '@/utils';
import { bcErrorText } from '@/utils/projectSourceLinks';

/** What the Plan grid gives its review chips, popovers and day markers */
export interface PlanReviewContextValue {
  subjectType: PlanReviewSubjectType;
  /** Per week (its Monday, YYYY-MM-DD): the subjects in view with a review, request or plan */
  weeks: Map<string, PlanReviewSubjectWeek[]>;
  lines: Record<number, BCPlanReviewLine[]>;
  changes: Record<number, PlanReviewChangesState>;
  loadChanges: (entryNos: number[]) => void;
  /** Whether the signed-in user may ask Poppie to review this subject */
  canRequest: (subjectNo: string) => boolean;
  /** Whether the signed-in user may write this change's planning lines */
  canApply: (change: BCPlanReviewChange) => boolean;
  /**
   * Why a change's cell must be edited by hand (see planCellManualReason), from the plan on
   * screen, or undefined. Apply checks BC again before writing.
   */
  manualReason?: (change: BCPlanReviewChange) => string | undefined;
  projectName: (jobNo: string) => string;
  resourceName: (resourceNo: string) => string;
  onRequest: (subjectNo: string, weekStart: string) => Promise<void>;
  /** Apply a finding's changes and refresh the grid */
  onApply: (changes: BCPlanReviewChange[]) => Promise<ApplyPlanChangesResult>;
}

/** Null when plan reviews are unavailable (the extension has no planReviews API) */
const PlanReviewContext = createContext<PlanReviewContextValue | null>(null);

export function PlanReviewProvider({
  value,
  children,
}: {
  value: PlanReviewContextValue | null;
  children: ReactNode;
}) {
  return <PlanReviewContext.Provider value={value}>{children}</PlanReviewContext.Provider>;
}

export const COMPANY_CHANGED_MESSAGE =
  "The company changed while Poppie's change was being applied, so Thyme stopped. Check that week's plan in the company you started in.";

export const STALE_CHANGE_MESSAGE = 'The plan changed since Poppie looked — ask her to re-review.';

const SEVERITY_DOT_CLASS: Record<TimesheetReviewSeverity, string> = {
  Issue: 'bg-red-400',
  Warning: 'bg-amber-400',
  Info: 'bg-blue-400',
};

const dayLabel = (date: string) => format(parseISO(date), 'EEE d');

/** Poppie's findings for a subject's day (worst first), from that week's review */
function findingsForDay(context: PlanReviewContextValue, subjectNo: string, date: string) {
  const weekStart = format(startOfWeek(parseISO(date), { weekStartsOn: 1 }), 'yyyy-MM-dd');
  const subject = context.weeks.get(weekStart)?.find((s) => s.subjectNo === subjectNo);
  if (!subject?.review) return null;
  const lines = (context.lines[subject.review.entryNo] ?? []).filter(
    (line) => line.planningDate === date
  );
  return lines.length > 0 ? { lines: sortPlanReviewLines(lines), subject } : null;
}

/**
 * A tiny dot in the top-left of a subject's day cell when Poppie's review has findings for
 * that day (the day-note marker sits top-right), coloured by the worst, with the notes as
 * its tooltip.
 */
export function PlanReviewDayMarker({ subjectNo, date }: { subjectNo: string; date: string }) {
  const context = useContext(PlanReviewContext);
  if (!context) return null;
  const found = findingsForDay(context, subjectNo, date);
  if (!found) return null;
  const severity = worstPlanReviewSeverity(found.lines) ?? 'Info';
  const outOfDate = found.subject.status === 'outOfDate';
  const notes = found.lines.map((line) => line.note || getPlanReviewCheckLabel(line.check));
  const title = `Poppie${outOfDate ? ' (out of date)' : ''}: ${notes.join('\n')}`;
  return (
    <span
      role="img"
      aria-label={title}
      title={title}
      data-testid="plan-review-day-marker"
      data-severity={severity}
      className={cn(
        'ring-dark-900 absolute top-0.5 left-0.5 z-[1] h-1.5 w-1.5 rounded-full ring-1',
        SEVERITY_DOT_CLASS[severity],
        outOfDate && 'opacity-50'
      )}
    />
  );
}

/**
 * Poppie's verdict for a week across the subjects in view, in the week-number header: the
 * worst verdict and how many have it, dashed when any is out of date. A button that opens the
 * week's reviews. Weeks without a review show nothing, or a quiet "Ask Poppie" for people who
 * may ask her to review.
 */
export function PlanReviewWeekChip({
  weekStart,
  weekNumber,
}: {
  weekStart: string;
  weekNumber: number;
}) {
  const context = useContext(PlanReviewContext);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const popoverId = useId();

  if (!context) return null;
  const subjects = context.weeks.get(weekStart) ?? [];
  const summary = summarizePlanReviewWeek(subjects);
  const label = formatPlanReviewWeekLabel(summary);
  const canAsk = subjects.some((s) => s.hasPlan && !s.review && context.canRequest(s.subjectNo));

  let content: ReactNode;
  let ariaLabel: string;
  let toneClass: string;
  if (label && summary.worstVerdict) {
    const tone = getPlanVerdictDisplay(summary.worstVerdict).tone;
    toneClass = VERDICT_TONE_CLASSES[tone];
    content = (
      <>
        <span className="truncate">{label}</span>
        {/* An icon rather than text, so the verdict fits the narrow week header */}
        {summary.outOfDate > 0 && (
          <span title="Out of date: the plan changed since Poppie looked" className="shrink-0">
            <ArrowPathIcon className="h-3 w-3 opacity-80" aria-hidden="true" />
          </span>
        )}
        {summary.awaiting > 0 && <Spinner />}
      </>
    );
    ariaLabel = `Week ${weekNumber}, Poppie's review: ${label}${
      summary.outOfDate > 0 ? `, ${summary.outOfDate} out of date` : ''
    }${summary.awaiting > 0 ? ', re-review requested' : ''}. Show details`;
  } else if (summary.awaiting > 0) {
    const text = summary.requestStatus === 'Running' ? 'Reviewing…' : 'Queued…';
    toneClass = 'bg-purple-500/15 text-purple-300';
    content = (
      <>
        <Spinner />
        <span className="truncate">{text}</span>
      </>
    );
    ariaLabel = `Week ${weekNumber}: Poppie's review ${text.replace('…', '').toLowerCase()}. Show details`;
  } else if (canAsk) {
    toneClass = 'text-dark-500 hover:text-dark-200';
    content = <span className="truncate">Ask Poppie</span>;
    ariaLabel = `Week ${weekNumber}: not reviewed by Poppie. Ask her to review`;
  } else {
    return null;
  }

  const close = () => {
    setIsOpen(false);
    buttonRef.current?.focus();
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        data-testid="plan-review-week-chip"
        className={cn(
          'focus-visible:ring-knowall-green inline-flex max-w-full min-w-0 cursor-pointer items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] leading-tight font-medium focus:outline-none focus-visible:ring-2',
          toneClass,
          summary.outOfDate > 0 && 'border border-dashed border-current opacity-75'
        )}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls={isOpen ? popoverId : undefined}
        title={ariaLabel.replace(/\. (Show details|Ask her to review)$/, '')}
        onClick={() => setIsOpen((open) => !open)}
      >
        {content}
      </button>
      {isOpen && (
        <PlanReviewPopover
          id={popoverId}
          weekStart={weekStart}
          weekNumber={weekNumber}
          subjects={subjects}
          context={context}
          anchorRef={buttonRef}
          onClose={close}
        />
      )}
    </>
  );
}

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="h-2.5 w-2.5 shrink-0 animate-spin rounded-full border border-current border-t-transparent"
    />
  );
}

// Reviewed subjects first, the most serious verdict first, then by name
const VERDICT_ORDER: Record<string, number> = { Query: 0, Check: 1, Approve: 2 };
function sortSubjects(subjects: PlanReviewSubjectWeek[]) {
  return [...subjects].sort((a, b) => {
    const rank = (s: PlanReviewSubjectWeek) =>
      s.review ? (VERDICT_ORDER[s.review.verdict] ?? 1) : 3;
    return rank(a) - rank(b) || a.name.localeCompare(b.name);
  });
}

interface PlanReviewPopoverProps {
  id: string;
  weekStart: string;
  weekNumber: number;
  subjects: PlanReviewSubjectWeek[];
  context: PlanReviewContextValue;
  anchorRef: RefObject<HTMLElement | null>;
  onClose: () => void;
}

function PlanReviewPopover({
  id,
  weekStart,
  weekNumber,
  subjects,
  context,
  anchorRef,
  onClose,
}: PlanReviewPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  // A single subject opens straight to its findings
  const [expanded, setExpanded] = useState<Set<string>>(() =>
    subjects.filter((s) => s.review).length === 1
      ? new Set(subjects.filter((s) => s.review).map((s) => s.subjectNo))
      : new Set()
  );
  const titleId = useId();

  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const reposition = useCallback(() => {
    const anchor = anchorRef.current;
    const popover = popoverRef.current;
    if (!anchor || !popover) return;
    const { top, left } = computePopoverPosition(
      anchor.getBoundingClientRect(),
      { width: popover.offsetWidth, height: popover.offsetHeight },
      { width: window.innerWidth, height: window.innerHeight }
    );
    setPosition({ top, left });
  }, [anchorRef]);

  // Measure before paint, and follow the header on scroll and resize (and findings opening)
  useLayoutEffect(() => {
    reposition();
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [reposition, expanded, subjects.length]);

  // Focus the popover's first control when it opens
  useEffect(() => {
    const popover = popoverRef.current;
    const first = popover?.querySelector<HTMLElement>('button');
    (first ?? popover)?.focus();
  }, []);

  // Escape closes just the popover (captured first, so it doesn't also exit fullscreen or
  // close a dialog the Plan is in); a click outside it, or on its chip, closes it too
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      event.preventDefault();
      onCloseRef.current();
    };
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (popoverRef.current?.contains(target) || anchorRef.current?.contains(target)) return;
      onCloseRef.current();
    };
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [anchorRef]);

  // Open subjects' changes are loaded on demand
  const { loadChanges } = context;
  useEffect(() => {
    const entryNos = subjects
      .filter((s) => s.review && expanded.has(s.subjectNo))
      .map((s) => s.review!.entryNo);
    if (entryNos.length > 0) loadChanges(entryNos);
  }, [expanded, subjects, loadChanges]);

  const toggle = (subjectNo: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(subjectNo)) next.delete(subjectNo);
      else next.add(subjectNo);
      return next;
    });

  const sorted = sortSubjects(subjects);
  const weekEnd = format(parseISO(weekStart), 'd MMM');

  return createPortal(
    <div
      ref={popoverRef}
      id={id}
      role="dialog"
      aria-labelledby={titleId}
      tabIndex={-1}
      className="bg-dark-800 border-dark-600 fixed z-[60] max-h-[70vh] w-96 max-w-[calc(100vw-16px)] overflow-y-auto rounded-lg border p-3 text-left shadow-xl focus:outline-none"
      style={{
        top: position?.top ?? 0,
        left: position?.left ?? 0,
        visibility: position ? 'visible' : 'hidden',
      }}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <PoppieAvatar
            reviewer={sorted.find((s) => s.review)?.review?.reviewer}
            className="h-6 w-6"
          />
          <h3 id={titleId} className="truncate text-sm font-semibold text-white">
            Poppie&apos;s review · Week {weekNumber}
            <span className="text-dark-400 ml-1 text-xs font-normal">from {weekEnd}</span>
          </h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close Poppie's review"
          className="text-dark-400 hover:text-dark-100 focus-visible:ring-knowall-green rounded p-0.5 focus:outline-none focus-visible:ring-2"
        >
          <XMarkIcon className="h-4 w-4" />
        </button>
      </div>

      {sorted.length === 0 && (
        <p className="text-dark-500 text-xs italic">Nothing planned to review this week.</p>
      )}

      <ul className="space-y-2">
        {sorted.map((subject) => (
          <SubjectReview
            key={subject.subjectNo}
            subject={subject}
            context={context}
            isExpanded={expanded.has(subject.subjectNo)}
            onToggle={() => toggle(subject.subjectNo)}
          />
        ))}
      </ul>
    </div>,
    document.body
  );
}

function SubjectReview({
  subject,
  context,
  isExpanded,
  onToggle,
}: {
  subject: PlanReviewSubjectWeek;
  context: PlanReviewContextValue;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const { review } = subject;
  const findingsId = useId();
  const lines = review ? sortPlanReviewLines(context.lines[review.entryNo] ?? []) : [];
  const verdict = review ? getPlanVerdictDisplay(review.verdict) : null;
  const outOfDate = subject.status === 'outOfDate';

  return (
    <li className="bg-dark-900/60 rounded-md px-2 py-1.5">
      {review && verdict ? (
        <>
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={isExpanded}
            aria-controls={isExpanded ? findingsId : undefined}
            aria-label={`${subject.name}: ${verdict.label}${outOfDate ? ', out of date' : ''}. ${
              isExpanded ? 'Hide' : 'Show'
            } findings`}
            className="focus-visible:ring-knowall-green flex w-full items-center gap-1.5 rounded text-left focus:outline-none focus-visible:ring-2"
          >
            {isExpanded ? (
              <ChevronDownIcon className="text-dark-400 h-3.5 w-3.5 shrink-0" />
            ) : (
              <ChevronRightIcon className="text-dark-400 h-3.5 w-3.5 shrink-0" />
            )}
            <span className="text-dark-100 min-w-0 flex-1 truncate text-xs font-medium">
              {subject.name}
            </span>
            <span
              className={cn(
                'shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                VERDICT_TONE_CLASSES[verdict.tone]
              )}
            >
              {verdict.label}
            </span>
            {outOfDate && (
              <span
                className="border-dark-500 text-dark-300 shrink-0 rounded-full border border-dashed px-1.5 py-0.5 text-[10px]"
                title="The plan changed after Poppie's review"
              >
                Out of date
              </span>
            )}
          </button>
          {review.summary && (
            <p className={cn('text-dark-300 mt-1 text-xs', !isExpanded && 'line-clamp-2')}>
              {review.summary}
            </p>
          )}
          {isExpanded && (
            <div id={findingsId} className="mt-1.5">
              {lines.length === 0 ? (
                <p className="text-dark-500 text-xs italic">No findings.</p>
              ) : (
                <ul className="space-y-1.5" aria-label={`Poppie's findings for ${subject.name}`}>
                  {lines.map((line) => (
                    <Finding
                      key={`${line.reviewEntryNo}-${line.lineNo}`}
                      line={line}
                      subject={subject}
                      context={context}
                    />
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      ) : (
        <div className="flex items-center gap-1.5">
          <span className="text-dark-100 min-w-0 flex-1 truncate text-xs font-medium">
            {subject.name}
          </span>
          <span className="text-dark-500 shrink-0 text-[10px] italic">Not reviewed yet</span>
        </div>
      )}
      <RequestReview subject={subject} context={context} />
    </li>
  );
}

function Finding({
  line,
  subject,
  context,
}: {
  line: BCPlanReviewLine;
  subject: PlanReviewSubjectWeek;
  context: PlanReviewContextValue;
}) {
  const [state, setState] = useState<{
    kind: 'idle' | 'applying' | 'applied' | 'stale' | 'manual' | 'failed';
    message?: string;
  }>({ kind: 'idle' });
  const changesState = subject.review ? context.changes[subject.review.entryNo] : undefined;
  const changes = Array.isArray(changesState) ? changesForLine(changesState, line) : [];
  const canApply = changes.length > 0 && changes.every(context.canApply);
  // Decided up front from the plan on screen; Apply checks BC again before writing anything
  const shownReason = canApply
    ? changes.map((change) => context.manualReason?.(change)).find(Boolean)
    : undefined;

  const apply = async () => {
    setState({ kind: 'applying' });
    let result: ApplyPlanChangesResult;
    try {
      result = await context.onApply(changes);
    } catch (error) {
      setState({ kind: 'idle' });
      toast.error(bcErrorText(error, "Couldn't apply the change. Please try again."));
      return;
    }
    switch (result.status) {
      case 'applied':
        setState({ kind: 'applied' });
        toast.success(changes.length === 1 ? 'Change applied' : 'Changes applied');
        return;
      case 'manual':
        setState({ kind: 'manual', message: planCellManualMessage(result.reason) });
        return;
      case 'stale':
        setState({
          kind: 'stale',
          message:
            result.attempted && !result.rolledBack
              ? `${STALE_CHANGE_MESSAGE} Part of the change was written and couldn't be undone, so check this week's plan.`
              : STALE_CHANGE_MESSAGE,
        });
        return;
      case 'companyChanged':
        setState({ kind: 'failed', message: COMPANY_CHANGED_MESSAGE });
        toast.error(COMPANY_CHANGED_MESSAGE);
        return;
      case 'failed': {
        const message = result.rolledBack
          ? `Couldn't apply the change, so nothing was changed: ${result.message}`
          : `Couldn't apply the change, and undoing the part already written failed too. Check this week's plan: ${result.message}`;
        setState({ kind: result.rolledBack ? 'idle' : 'failed', message });
        toast.error(message);
      }
    }
  };

  const describeChange = (change: BCPlanReviewChange) => {
    const who =
      context.subjectType === 'Resource'
        ? [change.jobNo, context.projectName(change.jobNo)]
        : [context.resourceName(change.resourceNo)];
    const proposed =
      change.proposedHours > 0 ? `${formatHours(change.proposedHours)}h` : '0h (remove)';
    return [
      change.planningDate ? dayLabel(change.planningDate) : null,
      ...who,
      `${formatHours(change.currentHours)}h → ${proposed}`,
    ]
      .filter(Boolean)
      .join(' · ');
  };

  return (
    <li className="text-xs">
      <div className="flex items-start gap-1.5">
        <SeverityIcon severity={line.severity} className="mt-px h-3.5 w-3.5" />
        <div className="min-w-0 flex-1">
          <p className="text-dark-400 text-[10px]">
            {getPlanReviewCheckLabel(line.check)}
            {line.planningDate && ` · ${dayLabel(line.planningDate)}`}
          </p>
          {line.note && <p className="text-dark-100 break-words">{line.note}</p>}
          {changesState === 'loading' && (
            <p className="text-dark-500 mt-0.5 text-[10px]">Loading changes…</p>
          )}
          {changesState === 'error' && (
            <p className="text-dark-500 mt-0.5 text-[10px]">Changes couldn&apos;t be loaded.</p>
          )}
          {changes.length > 0 && (
            <ul className="mt-1 space-y-0.5" aria-label="Proposed changes">
              {changes.map((change) => (
                <li key={change.changeNo} className="text-dark-300 font-mono text-[10px]">
                  {describeChange(change)}
                </li>
              ))}
            </ul>
          )}
          {shownReason && state.kind === 'idle' && (
            <p className="text-dark-300 mt-1 text-[11px]">{planCellManualMessage(shownReason)}</p>
          )}
          {canApply && !shownReason && (state.kind === 'idle' || state.kind === 'applying') && (
            <button
              type="button"
              disabled={state.kind === 'applying'}
              onClick={apply}
              className="bg-knowall-green/20 text-knowall-green hover:bg-knowall-green/30 focus-visible:ring-knowall-green mt-1 rounded px-2 py-0.5 text-[11px] font-medium focus:outline-none focus-visible:ring-2 disabled:opacity-50"
            >
              {state.kind === 'applying' ? 'Applying…' : 'Apply change'}
            </button>
          )}
          {state.kind === 'applied' && (
            <p className="text-thyme-400 mt-1 text-[11px]" role="status">
              Applied
            </p>
          )}
          {state.kind === 'manual' && (
            <p className="text-dark-300 mt-1 text-[11px]" role="alert">
              {state.message}
            </p>
          )}
          {state.kind !== 'manual' && state.message && (
            <p
              className={cn(
                'mt-1 text-[11px]',
                state.kind === 'stale' ? 'text-amber-300' : 'text-red-300'
              )}
              role="alert"
            >
              {state.message}
            </p>
          )}
        </div>
      </div>
    </li>
  );
}

function RequestReview({
  subject,
  context,
}: {
  subject: PlanReviewSubjectWeek;
  context: PlanReviewContextValue;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { request } = subject;
  const isOpen = !!request && isOpenPlanReviewRequest(request);

  if (isOpen) {
    return (
      <p className="mt-1 flex items-center gap-1.5 text-[11px] text-purple-300" role="status">
        <Spinner />
        {planReviewRequestText(request)}
      </p>
    );
  }

  const canAsk = context.canRequest(subject.subjectNo) && (subject.hasPlan || !!subject.review);
  const failed = request?.status === 'Failed';
  if (!canAsk && !failed) return null;

  const ask = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      await context.onRequest(subject.subjectNo, subject.weekStart);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't ask Poppie to review.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mt-1">
      {failed && (
        <p className="text-[11px] text-red-300">
          {request.errorMessage || "Poppie couldn't review this plan."}
        </p>
      )}
      {error && (
        <p className="text-[11px] text-red-300" role="alert">
          {error}
        </p>
      )}
      {canAsk && (
        <button
          type="button"
          disabled={isSubmitting}
          onClick={ask}
          className="text-knowall-green focus-visible:ring-knowall-green rounded text-[11px] font-medium hover:underline focus:outline-none focus-visible:ring-2 disabled:opacity-50"
        >
          {isSubmitting
            ? 'Asking…'
            : subject.review
              ? 'Ask Poppie to re-review'
              : 'Ask Poppie to review'}
        </button>
      )}
    </div>
  );
}
