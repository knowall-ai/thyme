'use client';

import { useCallback, useEffect, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { ChatBubbleLeftEllipsisIcon, PencilSquareIcon } from '@heroicons/react/24/outline';
import { Button, Modal } from '@/components/ui';
import { bcClient } from '@/services/bc';
import { useCompanyStore } from '@/hooks';
import { cn, explainBcError } from '@/utils';
import type { BCProjectNote } from '@/types';

// Notes are free text in Business Central; the API keeps up to this many characters
const MAX_NOTE_LENGTH = 2048;

const byline = (note: BCProjectNote) =>
  `${note.createdByName || note.createdBy} · ${format(parseISO(note.createdAt), 'd MMM yyyy, HH:mm')}`;

/**
 * The project's status: its latest Note in Business Central (the Notes factbox on the
 * Project card), with who wrote it and when, a way to post a new one, and the earlier
 * notes a click away. Nothing on Thyme BC Extensions before 1.25, which can't read notes.
 */
export function ProjectStatusNote({ jobNo }: { jobNo: string }) {
  const companyVersion = useCompanyStore((state) => state.companyVersion);
  // Undefined while loading, or when the extension can't read notes
  const [notes, setNotes] = useState<BCProjectNote[] | undefined>();
  const [loadError, setLoadError] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      setNotes(await bcClient.getProjectNotes(jobNo));
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, [jobNo]);

  useEffect(() => {
    let cancelled = false;
    setNotes(undefined);
    bcClient
      .getProjectNotes(jobNo)
      .then((loaded) => !cancelled && setNotes(loaded))
      .catch(() => !cancelled && setLoadError(true));
    return () => {
      cancelled = true;
    };
  }, [jobNo, companyVersion]);

  // An older extension, or still loading: show nothing rather than an empty box
  if (!notes) {
    return loadError ? (
      <p className="mt-3 text-sm text-gray-500">
        Couldn&apos;t load the project&apos;s status.{' '}
        <button type="button" onClick={() => void load()} className="text-thyme-400 underline">
          Retry
        </button>
      </p>
    ) : null;
  }

  const [latest, ...earlier] = notes;

  return (
    <div className="mt-3 max-w-3xl">
      {latest ? (
        <div className="border-thyme-500/60 bg-dark-800/60 rounded-r-lg border-l-2 py-2 pr-3 pl-3">
          <p className="text-sm whitespace-pre-line text-gray-200">{latest.note}</p>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
            <span>{byline(latest)}</span>
            <span className="flex items-center gap-3 print:hidden">
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="text-thyme-400 hover:text-thyme-300"
              >
                Update status
              </button>
              {earlier.length > 0 && (
                <button
                  type="button"
                  onClick={() => setIsHistoryOpen(true)}
                  className="hover:text-gray-300"
                >
                  Earlier notes ({earlier.length})
                </button>
              )}
            </span>
          </p>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setIsEditing(true)}
          className="hover:text-thyme-400 flex items-center gap-1.5 text-sm text-gray-500 print:hidden"
        >
          <PencilSquareIcon className="h-4 w-4" />
          Add a status note
        </button>
      )}

      <NewNoteModal
        isOpen={isEditing}
        jobNo={jobNo}
        onClose={() => setIsEditing(false)}
        onAdded={(note) => {
          setNotes((current) => [note, ...(current ?? [])]);
          setIsEditing(false);
        }}
      />

      <Modal
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        title="Project notes"
        size="lg"
      >
        <ol className="space-y-4">
          {notes.map((note, i) => (
            <li
              key={note.id}
              className={cn(
                'rounded-lg border p-3',
                i === 0 ? 'border-thyme-500/40 bg-thyme-500/5' : 'border-dark-600'
              )}
            >
              <p className="text-sm whitespace-pre-line text-gray-200">{note.note}</p>
              <p className="mt-1 text-xs text-gray-500">
                {byline(note)}
                {i === 0 && ' · current status'}
              </p>
            </li>
          ))}
        </ol>
        <div className="mt-4 flex items-center justify-between gap-4">
          <p className="text-xs text-gray-500">
            These are the project&apos;s Notes in Business Central, so they also show on the Project
            card there.
          </p>
          {/* One dialog at a time: the list closes and the new note opens */}
          <Button
            type="button"
            size="sm"
            onClick={() => {
              setIsHistoryOpen(false);
              setIsEditing(true);
            }}
            className="shrink-0"
          >
            <PencilSquareIcon className="h-4 w-4" />
            Update status
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function NewNoteModal({
  isOpen,
  jobNo,
  onClose,
  onAdded,
}: {
  isOpen: boolean;
  jobNo: string;
  onClose: () => void;
  onAdded: (note: BCProjectNote) => void;
}) {
  const [text, setText] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A fresh note each time it opens
  useEffect(() => {
    if (isOpen) {
      setText('');
      setError(null);
    }
  }, [isOpen]);

  const save = async () => {
    const note = text.trim();
    if (!note) return;
    setIsSaving(true);
    setError(null);
    try {
      onAdded(await bcClient.addProjectNote(jobNo, note));
    } catch (err) {
      setError(explainBcError(err).message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Update project status" size="md">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        className="space-y-3"
      >
        <label htmlFor="project-status-note" className="block text-sm text-gray-400">
          Where things stand, e.g. &ldquo;Blocked on the Azure database&rdquo;. It&apos;s added to
          the project&apos;s Notes in Business Central; earlier notes are kept.
        </label>
        <textarea
          id="project-status-note"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={MAX_NOTE_LENGTH}
          rows={4}
          autoFocus
          className="border-dark-600 bg-dark-700 focus:border-thyme-500 focus:ring-thyme-500 w-full rounded-lg border px-3 py-2 text-sm text-white placeholder-gray-500 focus:ring-1 focus:outline-none"
          placeholder="One line, or a short paragraph"
        />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-1 text-xs text-gray-500">
            <ChatBubbleLeftEllipsisIcon className="h-4 w-4" />
            Posted as you, with today&apos;s date
          </span>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={isSaving}>
              Cancel
            </Button>
            <Button type="submit" isLoading={isSaving} disabled={!text.trim()}>
              Post
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
