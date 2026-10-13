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
import { PencilSquareIcon, TrashIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { format } from 'date-fns';
import type { BCDayNote, BCDayNoteInput } from '@/types';
import {
  cn,
  computePopoverPosition,
  formatDayNotesTitle,
  getNoProjectWorkReason,
  getNotesForDate,
  DAY_NOTE_MAX_LENGTH,
  type DayNotesIndex,
} from '@/utils';
import { bcErrorText } from '@/utils/projectSourceLinks';

/**
 * Subtle hatching over a day with no project work: the whole column for a company-wide
 * note, one cell for a person's. A background image, so it sits over the weekend shade.
 */
export const NO_PROJECT_WORK_CLASS =
  'bg-[repeating-linear-gradient(135deg,transparent_0_5px,rgba(148,163,184,0.12)_5px_10px)]';

/** A person who can be picked for a note */
export interface DayNotePerson {
  number: string;
  name: string;
}

export interface DayNotesContextValue {
  index: DayNotesIndex;
  /** The signed-in user may add, change and delete notes (see canEditPlan) */
  canEdit: boolean;
  people: DayNotePerson[];
  onCreate: (input: BCDayNoteInput) => Promise<void>;
  onUpdate: (note: BCDayNote, input: BCDayNoteInput) => Promise<void>;
  onDelete: (note: BCDayNote) => Promise<void>;
}

/** Null when day notes are unavailable (the extension has no dayNotes API), which hides them */
const DayNotesContext = createContext<DayNotesContextValue | null>(null);

/** The one person a grid row is for, so its cells show that person's notes too */
const RowResourceContext = createContext<string | undefined>(undefined);

export function DayNotesProvider({
  value,
  children,
}: {
  value: DayNotesContextValue | null;
  children: ReactNode;
}) {
  return <DayNotesContext.Provider value={value}>{children}</DayNotesContext.Provider>;
}

/** Marks the rows inside as one person's (a Team view row and its project/task rows) */
export function DayNotesRowResource({
  resourceNumber,
  children,
}: {
  resourceNumber: string;
  children: ReactNode;
}) {
  return (
    <RowResourceContext.Provider value={resourceNumber}>{children}</RowResourceContext.Provider>
  );
}

/**
 * The hatching class for a row's day cell when that day has no project work - for everyone,
 * or for the row's person (from DayNotesRowResource or `resourceNumber`) - else undefined.
 */
export function useNoProjectWorkClass(resourceNumber?: string) {
  const context = useContext(DayNotesContext);
  const rowResource = useContext(RowResourceContext);
  const resource = resourceNumber ?? rowResource;
  const index = context?.index;
  return useCallback(
    (date: string) =>
      index && getNoProjectWorkReason(index, date, resource) ? NO_PROJECT_WORK_CLASS : undefined,
    [index, resource]
  );
}

const personName = (people: DayNotePerson[], resourceNo: string) =>
  people.find((p) => p.number === resourceNo)?.name ?? resourceNo;

/** A small marker on a person's day cell when they have a note that day, with it as the tooltip */
export function PersonDayNoteMarker({
  resourceNumber,
  date,
}: {
  resourceNumber: string;
  date: string;
}) {
  const context = useContext(DayNotesContext);
  const notes = context?.index.get(date)?.byResource.get(resourceNumber);
  if (!notes?.length) return null;
  const title = formatDayNotesTitle(notes);
  return (
    <span
      role="img"
      aria-label={`Note: ${title}`}
      title={title}
      data-testid="person-day-note"
      className="ring-dark-900 absolute top-0.5 right-0.5 z-[1] h-1.5 w-1.5 rounded-full bg-sky-400 ring-1"
    />
  );
}

/**
 * A day's column header. With day notes available, it's a button that opens the day's
 * notes, and shows its company-wide notes under the date (several: a count).
 */
export function DayHeaderNotes({
  day,
  children,
  className,
}: {
  day: Date;
  /** The weekday and date */
  children: ReactNode;
  className?: string;
}) {
  const context = useContext(DayNotesContext);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const popoverId = useId();

  if (!context) {
    return <div className={className}>{children}</div>;
  }

  const date = format(day, 'yyyy-MM-dd');
  const companyNotes = context.index.get(date)?.company ?? [];
  const allNotes = getNotesForDate(context.index, date);
  const companyTitle = companyNotes.length ? formatDayNotesTitle(companyNotes) : undefined;
  const dayLabel = format(day, 'EEEE d MMMM');
  const ariaLabel =
    allNotes.length === 0
      ? `${dayLabel}: no notes${context.canEdit ? ', add a note' : ''}`
      : `${dayLabel}: ${allNotes.length} ${allNotes.length === 1 ? 'note' : 'notes'}, show`;

  const close = () => {
    setIsOpen(false);
    buttonRef.current?.focus();
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={cn(
          className,
          'hover:bg-dark-700/60 focus-visible:ring-knowall-green min-w-0 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-inset'
        )}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls={isOpen ? popoverId : undefined}
        title={companyTitle}
        onClick={() => setIsOpen((open) => !open)}
      >
        {children}
        {companyNotes.length > 0 && (
          <span
            data-testid="day-note-marker"
            className="mt-0.5 block w-full max-w-full truncate px-0.5 text-[9px] leading-tight text-sky-300"
          >
            {companyNotes.length === 1 ? companyNotes[0].note : `${companyNotes.length} notes`}
          </span>
        )}
      </button>
      {isOpen && (
        <DayNotesPopover
          id={popoverId}
          day={day}
          date={date}
          notes={allNotes}
          context={context}
          anchorRef={buttonRef}
          onClose={close}
        />
      )}
    </>
  );
}

interface DayNotesPopoverProps {
  id: string;
  day: Date;
  date: string;
  notes: BCDayNote[];
  context: DayNotesContextValue;
  anchorRef: RefObject<HTMLElement | null>;
  onClose: () => void;
}

/** 'new' = adding a note; else the id of the note being edited */
type Editing = 'new' | string | null;

function DayNotesPopover({
  id,
  day,
  date,
  notes,
  context,
  anchorRef,
  onClose,
}: DayNotesPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const [editing, setEditing] = useState<Editing>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const titleId = useId();
  const { canEdit, people } = context;

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

  // Measure before paint, and follow the header on scroll and resize (and the form opening)
  useLayoutEffect(() => {
    reposition();
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [reposition, editing, notes.length]);

  // Focus the popover's first control when it opens
  useEffect(() => {
    const popover = popoverRef.current;
    const first = popover?.querySelector<HTMLElement>('button, input, select, textarea');
    (first ?? popover)?.focus();
  }, []);

  // Escape closes just the popover (captured first, so it doesn't also exit fullscreen or
  // close a dialog the Plan is in); a click outside it, or on its header, closes it too
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

  const run = async (action: () => Promise<void>, success: string) => {
    setIsBusy(true);
    try {
      await action();
      toast.success(success);
      setEditing(null);
      setConfirmingDelete(null);
    } catch (error) {
      toast.error(bcErrorText(error, 'The note could not be saved. Please try again.'));
    } finally {
      setIsBusy(false);
    }
  };

  return createPortal(
    <div
      ref={popoverRef}
      id={id}
      role="dialog"
      aria-labelledby={titleId}
      tabIndex={-1}
      className="bg-dark-800 border-dark-600 fixed z-[60] w-80 max-w-[calc(100vw-16px)] rounded-lg border p-3 text-left shadow-xl focus:outline-none"
      style={{
        top: position?.top ?? 0,
        left: position?.left ?? 0,
        visibility: position ? 'visible' : 'hidden',
      }}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 id={titleId} className="text-sm font-semibold text-white">
          Notes for {format(day, 'EEE d MMM')}
        </h3>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close notes"
          className="text-dark-400 hover:text-dark-100 focus-visible:ring-knowall-green rounded p-0.5 focus:outline-none focus-visible:ring-2"
        >
          <XMarkIcon className="h-4 w-4" />
        </button>
      </div>

      {notes.length === 0 && editing !== 'new' && (
        <p className="text-dark-500 text-xs italic">No notes for this day.</p>
      )}

      <ul className="space-y-2">
        {notes.map((note) =>
          editing === note.id ? (
            <li key={note.id}>
              <DayNoteForm
                date={date}
                people={people}
                initial={note}
                isBusy={isBusy}
                onCancel={() => setEditing(null)}
                onSubmit={(input) => run(() => context.onUpdate(note, input), 'Note saved')}
              />
            </li>
          ) : (
            <li key={note.id} className="bg-dark-900/60 rounded-md px-2 py-1.5">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-dark-400 text-[11px]">
                    {note.resourceNo ? personName(people, note.resourceNo) : 'Everyone'}
                  </p>
                  <p className="text-dark-100 text-xs break-words">{note.note}</p>
                  {note.noProjectWork && (
                    <span className="bg-dark-600 text-dark-200 mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium">
                      No project work
                    </span>
                  )}
                </div>
                {canEdit && editing === null && (
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmingDelete(null);
                        setEditing(note.id);
                      }}
                      aria-label={`Edit note "${note.note}"`}
                      className="text-dark-400 hover:text-knowall-green focus-visible:ring-knowall-green rounded p-0.5 focus:outline-none focus-visible:ring-2"
                    >
                      <PencilSquareIcon className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmingDelete(note.id)}
                      aria-label={`Delete note "${note.note}"`}
                      className="text-dark-400 focus-visible:ring-knowall-green rounded p-0.5 hover:text-red-400 focus:outline-none focus-visible:ring-2"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
              {confirmingDelete === note.id && (
                <div className="mt-1.5 flex items-center justify-end gap-2 text-xs">
                  <span className="text-dark-300">Delete this note?</span>
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => run(() => context.onDelete(note), 'Note deleted')}
                    className="rounded bg-red-500/20 px-2 py-0.5 font-medium text-red-300 hover:bg-red-500/30 disabled:opacity-50"
                  >
                    Delete
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingDelete(null)}
                    className="text-dark-300 hover:text-dark-100 px-1"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </li>
          )
        )}
      </ul>

      {canEdit &&
        (editing === 'new' ? (
          <div className={cn(notes.length > 0 && 'mt-2')}>
            <DayNoteForm
              date={date}
              people={people}
              isBusy={isBusy}
              onCancel={() => setEditing(null)}
              onSubmit={(input) => run(() => context.onCreate(input), 'Note added')}
            />
          </div>
        ) : (
          editing === null && (
            <button
              type="button"
              onClick={() => {
                setConfirmingDelete(null);
                setEditing('new');
              }}
              className="text-knowall-green focus-visible:ring-knowall-green mt-2 rounded text-xs font-medium hover:underline focus:outline-none focus-visible:ring-2"
            >
              + Add note
            </button>
          )
        ))}
    </div>,
    document.body
  );
}

interface DayNoteFormProps {
  date: string;
  people: DayNotePerson[];
  initial?: BCDayNote;
  isBusy: boolean;
  onCancel: () => void;
  onSubmit: (input: BCDayNoteInput) => void;
}

function DayNoteForm({ date, people, initial, isBusy, onCancel, onSubmit }: DayNoteFormProps) {
  const [note, setNote] = useState(initial?.note ?? '');
  const [resourceNo, setResourceNo] = useState(initial?.resourceNo ?? '');
  const [noProjectWork, setNoProjectWork] = useState(initial?.noProjectWork ?? false);
  const noteId = useId();
  const whoId = useId();
  const noteRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    noteRef.current?.focus();
  }, []);

  // A note's person may not be in the loaded team (e.g. since blocked): keep them pickable
  const options =
    resourceNo && !people.some((p) => p.number === resourceNo)
      ? [...people, { number: resourceNo, name: resourceNo }]
      : people;
  const canSave = note.trim().length > 0 && !isBusy;

  return (
    <form
      className="border-dark-600 space-y-2 rounded-md border p-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSave) return;
        onSubmit({ noteDate: date, resourceNo, note: note.trim(), noProjectWork });
      }}
    >
      <div>
        <div className="flex items-baseline justify-between">
          <label htmlFor={noteId} className="text-dark-300 text-[11px]">
            Note
          </label>
          <span className="text-dark-500 text-[10px]" aria-hidden="true">
            {note.length}/{DAY_NOTE_MAX_LENGTH}
          </span>
        </div>
        <input
          ref={noteRef}
          id={noteId}
          type="text"
          value={note}
          maxLength={DAY_NOTE_MAX_LENGTH}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. Company Off-Site"
          className="border-dark-600 bg-dark-900 text-dark-100 placeholder:text-dark-500 focus:border-knowall-green w-full rounded border px-2 py-1 text-xs focus:ring-1 focus:outline-none"
        />
      </div>
      <div>
        <label htmlFor={whoId} className="text-dark-300 text-[11px]">
          For
        </label>
        <select
          id={whoId}
          value={resourceNo}
          onChange={(e) => setResourceNo(e.target.value)}
          className="border-dark-600 bg-dark-900 text-dark-100 focus:border-knowall-green w-full rounded border px-2 py-1 text-xs focus:ring-1 focus:outline-none"
        >
          <option value="">Everyone</option>
          {options.map((person) => (
            <option key={person.number} value={person.number}>
              {person.name}
            </option>
          ))}
        </select>
      </div>
      <label className="text-dark-200 flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={noProjectWork}
          onChange={(e) => setNoProjectWork(e.target.checked)}
          className="accent-knowall-green"
        />
        No project work
      </label>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="text-dark-300 hover:text-dark-100 px-2 py-1 text-xs"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!canSave}
          className="bg-knowall-green text-dark-950 rounded px-2.5 py-1 text-xs font-semibold disabled:opacity-50"
        >
          {isBusy ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  );
}
