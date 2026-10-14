import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BCDayNote } from '@/types';

vi.mock('@/services/bc', () => ({
  bcClient: {
    getDayNotes: vi.fn(),
    createDayNote: vi.fn(),
    updateDayNote: vi.fn(),
    deleteDayNote: vi.fn(),
  },
}));

import { bcClient } from '@/services/bc';
import { useDayNotesStore } from '@/hooks/useDayNotesStore';

const FROM = '2026-10-12';
const TO = '2026-11-01';

const note = (partial: Partial<BCDayNote>): BCDayNote => ({
  id: 'n1',
  entryNo: 1,
  noteDate: '2026-10-14',
  resourceNo: '',
  note: 'Company Off-Site',
  noProjectWork: true,
  '@odata.etag': 'W/"1"',
  ...partial,
});

/** A promise resolved by hand, to control the order responses arrive in */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const input = {
  noteDate: '2026-10-14',
  resourceNo: '',
  note: 'Company Off-Site',
  noProjectWork: true,
};

describe('useDayNotesStore', () => {
  beforeEach(() => {
    vi.mocked(bcClient.getDayNotes).mockReset();
    vi.mocked(bcClient.createDayNote).mockReset();
    vi.mocked(bcClient.updateDayNote).mockReset();
    vi.mocked(bcClient.deleteDayNote).mockReset();
    useDayNotesStore.getState().reset();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('hides the feature when the endpoint is missing', async () => {
    vi.mocked(bcClient.getDayNotes).mockResolvedValue(undefined);
    await useDayNotesStore.getState().load(FROM, TO);
    expect(useDayNotesStore.getState().available).toBe(false);
  });

  it('drops an older read for the same range that finishes after a newer one', async () => {
    const older = deferred<BCDayNote[] | undefined>();
    const newer = deferred<BCDayNote[] | undefined>();
    vi.mocked(bcClient.getDayNotes)
      .mockReturnValueOnce(older.promise)
      .mockReturnValueOnce(newer.promise);

    const first = useDayNotesStore.getState().load(FROM, TO);
    const second = useDayNotesStore.getState().load(FROM, TO, { force: true });
    newer.resolve([note({ note: 'Newer' })]);
    await second;
    older.resolve([note({ note: 'Older' })]);
    await first;

    expect(useDayNotesStore.getState().notes.map((n) => n.note)).toEqual(['Newer']);
  });

  it("doesn't let a read started before an edit overwrite it", async () => {
    vi.mocked(bcClient.getDayNotes).mockResolvedValueOnce([]);
    await useDayNotesStore.getState().load(FROM, TO);

    // A read starts, then a note is added before it answers (without the new note)
    const inFlight = deferred<BCDayNote[] | undefined>();
    vi.mocked(bcClient.getDayNotes).mockReturnValueOnce(inFlight.promise);
    const read = useDayNotesStore.getState().load(FROM, TO, { force: true });

    const created = note({ id: 'n2', '@odata.etag': 'W/"9"' });
    vi.mocked(bcClient.createDayNote).mockResolvedValue(created);
    vi.mocked(bcClient.getDayNotes).mockResolvedValueOnce([created]);
    await useDayNotesStore.getState().createNote(input);

    inFlight.resolve([]);
    await read;
    expect(useDayNotesStore.getState().notes).toEqual([created]);
  });

  it('shows a created note at once, with its ETag, before the re-read answers', async () => {
    vi.mocked(bcClient.getDayNotes).mockResolvedValueOnce([]);
    await useDayNotesStore.getState().load(FROM, TO);

    const created = note({ id: 'n2', '@odata.etag': 'W/"5"' });
    vi.mocked(bcClient.createDayNote).mockResolvedValue(created);
    const reread = deferred<BCDayNote[] | undefined>();
    vi.mocked(bcClient.getDayNotes).mockReturnValueOnce(reread.promise);

    const pending = useDayNotesStore.getState().createNote(input);
    await vi.waitFor(() => expect(useDayNotesStore.getState().notes).toEqual([created]));
    reread.resolve([created]);
    await expect(pending).resolves.toEqual({ revalidated: true });
  });

  it("replaces an updated note with BC's record, so the next save sends its new ETag", async () => {
    const original = note({});
    vi.mocked(bcClient.getDayNotes).mockResolvedValueOnce([original]);
    await useDayNotesStore.getState().load(FROM, TO);

    const updated = note({ note: 'Off-Site (London)', '@odata.etag': 'W/"2"' });
    vi.mocked(bcClient.updateDayNote).mockResolvedValue(updated);
    vi.mocked(bcClient.getDayNotes).mockRejectedValueOnce(new Error('offline'));

    const result = await useDayNotesStore.getState().updateNote(original, {
      ...input,
      note: 'Off-Site (London)',
    });

    // Saved, but the re-read failed: say so, and keep BC's response (new ETag) on screen
    expect(result).toEqual({ revalidated: false });
    expect(useDayNotesStore.getState().notes).toEqual([updated]);
    expect(bcClient.updateDayNote).toHaveBeenCalledWith('n1', expect.anything(), 'W/"1"');
  });

  it('removes a note moved out of the visible dates', async () => {
    const original = note({});
    vi.mocked(bcClient.getDayNotes).mockResolvedValueOnce([original]);
    await useDayNotesStore.getState().load(FROM, TO);

    vi.mocked(bcClient.updateDayNote).mockResolvedValue(note({ noteDate: '2026-12-01' }));
    vi.mocked(bcClient.getDayNotes).mockResolvedValueOnce([]);
    await useDayNotesStore.getState().updateNote(original, { ...input, noteDate: '2026-12-01' });
    expect(useDayNotesStore.getState().notes).toEqual([]);
  });

  it('removes a deleted note at once', async () => {
    const original = note({});
    vi.mocked(bcClient.getDayNotes).mockResolvedValueOnce([original]);
    await useDayNotesStore.getState().load(FROM, TO);

    vi.mocked(bcClient.deleteDayNote).mockResolvedValue(undefined);
    const reread = deferred<BCDayNote[] | undefined>();
    vi.mocked(bcClient.getDayNotes).mockReturnValueOnce(reread.promise);
    const pending = useDayNotesStore.getState().deleteNote(original);
    await vi.waitFor(() => expect(useDayNotesStore.getState().notes).toEqual([]));
    reread.resolve([]);
    await expect(pending).resolves.toEqual({ revalidated: true });
  });

  it('leaves the notes alone and throws when BC rejects the change', async () => {
    const original = note({});
    vi.mocked(bcClient.getDayNotes).mockResolvedValueOnce([original]);
    await useDayNotesStore.getState().load(FROM, TO);

    vi.mocked(bcClient.deleteDayNote).mockRejectedValue(new Error('BC API Error (403): denied'));
    await expect(useDayNotesStore.getState().deleteNote(original)).rejects.toThrow('403');
    expect(useDayNotesStore.getState().notes).toEqual([original]);
  });

  it("doesn't apply a save from the previous company after a company switch", async () => {
    // Company A's notes, and a save sent while A is selected
    const original = note({});
    vi.mocked(bcClient.getDayNotes).mockResolvedValueOnce([original]);
    await useDayNotesStore.getState().load(FROM, TO);
    const save = deferred<BCDayNote>();
    vi.mocked(bcClient.updateDayNote).mockReturnValue(save.promise);
    const pending = useDayNotesStore.getState().updateNote(original, input);

    // Switch to company B, whose read is still in flight when A's save answers
    useDayNotesStore.getState().reset();
    const companyBNotes = [note({ id: 'b1', note: 'Contoso Day' })];
    const readB = deferred<BCDayNote[] | undefined>();
    vi.mocked(bcClient.getDayNotes).mockReturnValueOnce(readB.promise);
    const loadB = useDayNotesStore.getState().load(FROM, TO);

    save.resolve(note({ note: 'Changed in A', '@odata.etag': 'W/"2"' }));
    // The save still reports its own success
    await expect(pending).resolves.toEqual({ revalidated: true });
    // ...without touching B's notes or re-reading for A
    expect(useDayNotesStore.getState().notes).toEqual([]);
    expect(bcClient.getDayNotes).toHaveBeenCalledTimes(2);

    // B's pending read isn't superseded by A's save
    readB.resolve(companyBNotes);
    await loadB;
    expect(useDayNotesStore.getState().notes).toEqual(companyBNotes);
  });

  it('still reports a failed save from the previous company', async () => {
    const original = note({});
    vi.mocked(bcClient.getDayNotes).mockResolvedValueOnce([original]);
    await useDayNotesStore.getState().load(FROM, TO);
    const save = deferred<void>();
    vi.mocked(bcClient.deleteDayNote).mockReturnValue(save.promise);
    const pending = useDayNotesStore.getState().deleteNote(original);

    useDayNotesStore.getState().reset();
    save.reject(new Error('BC API Error (409): changed'));
    await expect(pending).rejects.toThrow('409');
  });

  it("doesn't cache dates whose re-read failed, so the next load asks BC again", async () => {
    const original = note({});
    vi.mocked(bcClient.getDayNotes).mockResolvedValueOnce([original]);
    await useDayNotesStore.getState().load(FROM, TO);

    const updated = note({ note: 'Changed', '@odata.etag': 'W/"2"' });
    vi.mocked(bcClient.updateDayNote).mockResolvedValue(updated);
    vi.mocked(bcClient.getDayNotes).mockRejectedValueOnce(new Error('offline'));
    await expect(useDayNotesStore.getState().updateNote(original, input)).resolves.toEqual({
      revalidated: false,
    });

    const latest = [note({ note: 'Changed again', '@odata.etag': 'W/"3"' })];
    vi.mocked(bcClient.getDayNotes).mockResolvedValueOnce(latest);
    await useDayNotesStore.getState().load(FROM, TO);
    expect(bcClient.getDayNotes).toHaveBeenCalledTimes(3);
    expect(useDayNotesStore.getState().notes).toEqual(latest);
  });

  it('serves a range from the cache once it has been read successfully', async () => {
    vi.mocked(bcClient.getDayNotes).mockResolvedValueOnce([note({})]);
    await useDayNotesStore.getState().load(FROM, TO);
    await useDayNotesStore.getState().load(FROM, TO);
    expect(bcClient.getDayNotes).toHaveBeenCalledTimes(1);
  });
});
