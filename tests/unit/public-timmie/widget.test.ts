import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { micNote } from '@/components/public-timmie/PublicTimmieLauncher';
import { TIMMIE_PERSONA } from '@/components/public-timmie/persona';
import { createJsonChatTransport } from '@/components/public-timmie/transport';
import { useMicPermission } from '@/components/public-timmie/useMicPermission';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('persona', () => {
  it('is Timmie, in KnowAll lime, with greetings (clips only once they are recorded)', () => {
    expect(TIMMIE_PERSONA.name).toBe('Timmie');
    expect(TIMMIE_PERSONA.accent).toBe('#9dff0a');
    expect(TIMMIE_PERSONA.avatar.large).toBe('/timmie/avatar-192.png');
    expect(TIMMIE_PERSONA.greetings.length).toBeGreaterThanOrEqual(5);
    for (const g of TIMMIE_PERSONA.greetings) {
      const src = TIMMIE_PERSONA.greetingAudioSrc(g);
      expect(src === undefined || /^\/timmie\/greetings\/[a-z-]+\.mp3$/.test(src)).toBe(true);
    }
    expect(TIMMIE_PERSONA.chips.length).toBeGreaterThan(0);
  });
});

describe('JSON chat transport', () => {
  it('sends the pass and the history, and retries once with a new pass on 401', async () => {
    let calls = 0;
    const fetchMock = vi.fn(async () => {
      calls += 1;
      return calls === 1
        ? Response.json({ error: 'Please verify' }, { status: 401 })
        : Response.json({ reply: 'Hello', sig: 's' });
    });
    vi.stubGlobal('fetch', fetchMock);
    const passes = ['old', 'new'];
    const clearPass = vi.fn();
    const transport = createJsonChatTransport({
      url: '/api/public/chat',
      passHeader: 'x-timmie-pass',
      getPass: async () => passes.shift()!,
      clearPass,
      fallbackError: 'failed',
    });
    const result = await transport.send([{ role: 'user', content: 'Hi' }]);
    expect(result).toEqual({ reply: 'Hello', sig: 's' });
    expect(clearPass).toHaveBeenCalledOnce();
    const init = (fetchMock.mock.calls[1] as unknown as [string, RequestInit])[1];
    expect((init.headers as Record<string, string>)['x-timmie-pass']).toBe('new');
    expect(JSON.parse(String(init.body))).toEqual({
      messages: [{ role: 'user', content: 'Hi' }],
    });
  });

  it('sends the conversation id back, and forgets it on reset', async () => {
    const bodies: unknown[] = [];
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)));
      return Response.json({ reply: 'Hello', sig: 's', exp: 1, conversationId: 'conv-123456789' });
    });
    const transport = createJsonChatTransport({
      url: '/x',
      passHeader: 'h',
      getPass: async () => 'p',
      clearPass: () => undefined,
      fallbackError: 'failed',
    });
    await transport.send([{ role: 'user', content: 'Hi' }]);
    await transport.send([
      { role: 'user', content: 'Hi' },
      { role: 'assistant', content: 'Hello', sig: 's', exp: 1 },
      { role: 'user', content: 'More' },
    ]);
    transport.reset();
    await transport.send([{ role: 'user', content: 'New' }]);
    expect(bodies.map((b) => (b as { conversationId?: string }).conversationId)).toEqual([
      undefined,
      'conv-123456789',
      undefined,
    ]);
  });

  it('surfaces the server error', async () => {
    vi.stubGlobal('fetch', async () => Response.json({ error: 'Too busy' }, { status: 503 }));
    const transport = createJsonChatTransport({
      url: '/x',
      passHeader: 'h',
      getPass: async () => 'p',
      clearPass: () => undefined,
      fallbackError: 'failed',
    });
    await expect(transport.send([{ role: 'user', content: 'Hi' }])).rejects.toThrow('Too busy');
  });
});

describe('microphone permission', () => {
  it('reads the state up front and follows changes', async () => {
    let listener: (() => void) | undefined;
    const status = {
      state: 'prompt',
      addEventListener: (_: string, fn: () => void) => (listener = fn),
      removeEventListener: () => undefined,
    };
    vi.stubGlobal('navigator', { ...navigator, permissions: { query: async () => status } });
    const { result } = renderHook(() => useMicPermission());
    await waitFor(() => expect(result.current).toBe('prompt'));
    status.state = 'denied';
    act(() => listener?.());
    expect(result.current).toBe('denied');
  });

  it("falls back to 'unknown' where the browser can't say (Safari)", async () => {
    vi.stubGlobal('navigator', {
      ...navigator,
      permissions: { query: async () => Promise.reject(new TypeError('microphone')) },
    });
    const { result } = renderHook(() => useMicPermission());
    await act(async () => undefined);
    expect(result.current).toBe('unknown');
    vi.stubGlobal('navigator', { ...navigator, permissions: undefined });
    expect(renderHook(() => useMicPermission()).result.current).toBe('unknown');
  });

  it('tells the visitor before asking', () => {
    expect(micNote('denied')).toMatch(/blocking the microphone/);
    expect(micNote('prompt')).toMatch(/will ask/);
    expect(micNote('granted')).toMatch(/5 minutes/);
  });
});
