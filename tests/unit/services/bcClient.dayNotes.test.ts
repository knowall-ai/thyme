import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/services/auth', () => ({
  getBCAccessToken: vi.fn().mockResolvedValue('token'),
}));

import { bcClient } from '@/services/bc/bcClient';

const NOTE_ID = '00000000-0000-0000-0000-00000000d001';

function stubFetch(status: number, body: unknown) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => text,
  }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('bcClient day notes', () => {
  beforeEach(() => {
    bcClient.setCompany('00000000-0000-0000-0000-0000000000c3', 'sandbox');
    vi.spyOn(bcClient, 'isExtensionInstalled').mockResolvedValue(true);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.mocked(bcClient.isExtensionInstalled).mockRestore();
  });

  it('loads notes for a date range and fills in blanks', async () => {
    const fetchMock = stubFetch(200, {
      value: [
        {
          id: NOTE_ID,
          entryNo: 3,
          noteDate: '2026-10-14',
          resourceNo: '',
          note: 'Company Off-Site',
          noProjectWork: true,
          '@odata.etag': 'W/"1"',
        },
        { id: 'n2', entryNo: 4, noteDate: '2026-10-15', resourceNo: 'R001', note: 'Workshop' },
      ],
    });

    const notes = await bcClient.getDayNotes('2026-10-12', '2026-11-01');

    const url = decodeURIComponent(fetchMock.mock.calls[0][0]);
    expect(url).toContain('/dayNotes?$filter=noteDate ge 2026-10-12 and noteDate le 2026-11-01');
    expect(notes).toEqual([
      expect.objectContaining({
        id: NOTE_ID,
        resourceNo: '',
        note: 'Company Off-Site',
        noProjectWork: true,
        '@odata.etag': 'W/"1"',
      }),
      expect.objectContaining({ id: 'n2', resourceNo: 'R001', noProjectWork: false }),
    ]);
  });

  it('returns undefined when the extension has no dayNotes API yet (404)', async () => {
    stubFetch(404, 'No HTTP resource was found');
    await expect(bcClient.getDayNotes('2026-10-12', '2026-10-18')).resolves.toBeUndefined();
  });

  it('returns undefined when the extension is not installed', async () => {
    vi.mocked(bcClient.isExtensionInstalled).mockResolvedValue(false);
    const fetchMock = stubFetch(200, { value: [] });
    await expect(bcClient.getDayNotes('2026-10-12', '2026-10-18')).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('still fails on other errors', async () => {
    stubFetch(500, 'Server error');
    await expect(bcClient.getDayNotes('2026-10-12', '2026-10-18')).rejects.toThrow(
      'BC API Error (500)'
    );
  });

  it('rejects a malformed date rather than building a filter from it', async () => {
    await expect(bcClient.getDayNotes("2026-10-12' or 1 eq 1", '2026-10-18')).rejects.toThrow(
      'Invalid date format'
    );
  });

  it('creates a note with a trimmed body', async () => {
    const fetchMock = stubFetch(201, {
      id: NOTE_ID,
      entryNo: 5,
      noteDate: '2026-10-14',
      resourceNo: '',
      note: 'Company Off-Site',
      noProjectWork: true,
    });

    const note = await bcClient.createDayNote({
      noteDate: '2026-10-14',
      resourceNo: '',
      note: '  Company Off-Site ',
      noProjectWork: true,
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/dayNotes$/);
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({
      noteDate: '2026-10-14',
      resourceNo: '',
      note: 'Company Off-Site',
      noProjectWork: true,
    });
    expect(note.entryNo).toBe(5);
  });

  it('refuses a note over 100 characters without calling BC', async () => {
    const fetchMock = stubFetch(201, {});
    await expect(
      bcClient.createDayNote({
        noteDate: '2026-10-14',
        resourceNo: '',
        note: 'x'.repeat(101),
        noProjectWork: false,
      })
    ).rejects.toThrow('at most 100');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('updates a note with its ETag', async () => {
    const fetchMock = stubFetch(200, { id: NOTE_ID, note: 'Off-Site (moved)' });
    await bcClient.updateDayNote(
      NOTE_ID,
      {
        noteDate: '2026-10-15',
        resourceNo: 'R001',
        note: 'Off-Site (moved)',
        noProjectWork: false,
      },
      'W/"7"'
    );
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(new RegExp(`/dayNotes\\(${NOTE_ID}\\)$`));
    expect(init?.method).toBe('PATCH');
    expect((init?.headers as Record<string, string>)['If-Match']).toBe('W/"7"');
  });

  it("won't update or delete without an ETag, or with a bad id", async () => {
    const fetchMock = stubFetch(200, {});
    const input = { noteDate: '2026-10-15', resourceNo: '', note: 'x', noProjectWork: false };
    await expect(bcClient.updateDayNote(NOTE_ID, input, undefined)).rejects.toThrow('no ETag');
    await expect(bcClient.deleteDayNote('../projects', 'W/"1"')).rejects.toThrow('invalid');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('deletes a note with its ETag', async () => {
    const fetchMock = stubFetch(204, '');
    await bcClient.deleteDayNote(NOTE_ID, 'W/"2"');
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.method).toBe('DELETE');
    expect((init?.headers as Record<string, string>)['If-Match']).toBe('W/"2"');
  });

  it('keeps canEditPlan from the projects and resources APIs', async () => {
    stubFetch(200, {
      value: [
        { id: 'r1', number: 'R001', name: 'Alex Contoso', type: 'Person', canEditPlan: true },
      ],
    });
    const [resource] = await bcClient.getResources();
    expect(resource.canEditPlan).toBe(true);

    vi.spyOn(
      bcClient as unknown as { getCompanyNames: () => Promise<string[]> },
      'getCompanyNames'
    ).mockResolvedValue([]);
    stubFetch(200, {
      value: [{ id: 'p1', number: 'PR001', displayName: 'Contoso Website', canEditPlan: false }],
    });
    const [project] = await bcClient.getProjects();
    expect(project.canEditPlan).toBe(false);
  });
});
