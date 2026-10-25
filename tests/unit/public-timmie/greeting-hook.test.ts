import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readMuted, shouldGreet } from '@/services/public-timmie/greetings';
import { TIMMIE_PERSONA } from '@/components/public-timmie/persona';
import { useGreeting } from '@/components/public-timmie/useGreeting';
import { useSpeaker } from '@/components/public-timmie/useSpeaker';

/** A real key-value store (the test setup replaces localStorage with no-op mocks). */
function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, String(v)),
  };
}

describe('useGreeting and the speaker', () => {
  let session: Storage;
  let local: Storage;
  const played: string[] = [];
  let paused = 0;
  let playResult: () => Promise<void>;
  // As if every greeting had been recorded.
  const persona = {
    ...TIMMIE_PERSONA,
    greetingAudioSrc: (g: { id: string }) => `/timmie/greetings/${g.id}.mp3`,
  };

  beforeEach(() => {
    vi.useFakeTimers();
    session = memoryStorage();
    local = memoryStorage();
    played.length = 0;
    paused = 0;
    playResult = () => Promise.resolve();
    vi.spyOn(window, 'sessionStorage', 'get').mockReturnValue(session);
    vi.spyOn(window, 'localStorage', 'get').mockReturnValue(local);
    vi.stubGlobal(
      'Audio',
      class {
        currentTime = 0;
        constructor(readonly src: string) {}
        addEventListener() {}
        play() {
          played.push(this.src);
          return playResult();
        }
        pause() {
          paused += 1;
        }
      }
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const greet = (muted = false, enabled = true) =>
    renderHook(() => useGreeting({ persona, enabled, muted }));

  it('without a recorded clip: shows the text, plays nothing, offers no "tap to hear"', async () => {
    const { result } = renderHook(() =>
      useGreeting({
        persona: { ...TIMMIE_PERSONA, greetingAudioSrc: () => undefined },
        enabled: true,
        muted: false,
      })
    );
    await act(() => vi.advanceTimersByTimeAsync(650));
    expect(result.current.open).toBe(true);
    expect(played).toEqual([]);
    expect(result.current.needsTap).toBe(false);
    expect(result.current.heard).toBe(false); // so a call greets live instead
  });

  it('opens and speaks the greeting about 600 ms after load, once per session', async () => {
    const first = greet();
    expect(first.result.current.open).toBe(false);
    await act(() => vi.advanceTimersByTimeAsync(650));
    expect(first.result.current.open).toBe(true);
    expect(played).toEqual([`/timmie/greetings/${first.result.current.greeting.id}.mp3`]);
    first.unmount();

    // The next page in the same session: no greeting.
    const second = greet();
    await act(() => vi.advanceTimersByTimeAsync(2000));
    expect(second.result.current.open).toBe(false);
    expect(played).toHaveLength(1);
  });

  it('stays quiet when muted, but still shows the bubble', async () => {
    const { result } = greet(true);
    await act(() => vi.advanceTimersByTimeAsync(650));
    expect(result.current.open).toBe(true);
    expect(played).toEqual([]);
    expect(result.current.needsTap).toBe(false);
  });

  it('a dismissal ends the greeting for the session, even during the first 600 ms', async () => {
    const { result } = greet();
    act(() => result.current.dismiss());
    expect(shouldGreet(session)).toBe(false);
    await act(() => vi.advanceTimersByTimeAsync(650));
    expect(result.current.open).toBe(false);
  });

  it('does not greet while the helper is unavailable', async () => {
    const { result } = greet(false, false);
    await act(() => vi.advanceTimersByTimeAsync(2000));
    expect(result.current.open).toBe(false);
    expect(shouldGreet(session)).toBe(true);
  });

  it('holds a blocked greeting and plays it on the first click or key (not Tab), without stopping it', async () => {
    playResult = () => Promise.reject(new DOMException('blocked', 'NotAllowedError'));
    const { result } = greet();
    await act(() => vi.advanceTimersByTimeAsync(650));
    expect(result.current.audioState).toBe('held');
    expect(result.current.needsTap).toBe(true);
    expect(result.current.heard).toBe(true); // a call won't greet a second time
    playResult = () => Promise.resolve();
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
    });
    expect(played).toHaveLength(1);
    // The tap that releases it may be "Talk" or "Chat": it plays, and nothing stops it.
    await act(async () => {
      document.dispatchEvent(new Event('pointerdown'));
    });
    expect(played).toHaveLength(2);
    expect(result.current.audioState).toBe('playing');
    expect(paused).toBe(0);
  });

  it('never fails silently: a clip that cannot play offers "Tap to hear"', async () => {
    playResult = () => Promise.reject(new Error('network'));
    const { result } = greet();
    await act(() => vi.advanceTimersByTimeAsync(650));
    expect(result.current.audioState).toBe('failed');
    expect(result.current.needsTap).toBe(true);
    expect(result.current.heard).toBe(false); // so a call greets live instead
    playResult = () => Promise.resolve();
    await act(async () => result.current.playNow());
    expect(result.current.audioState).toBe('playing');
  });

  it('whenFinished waits for a playing greeting', async () => {
    const { result } = greet();
    await act(() => vi.advanceTimersByTimeAsync(650));
    let finished = false;
    void result.current.whenFinished().then(() => (finished = true));
    await act(async () => undefined);
    expect(finished).toBe(false);
    act(() => result.current.dismiss());
    await act(async () => undefined);
    expect(finished).toBe(true);
  });

  it('the one speaker control is remembered, and muting ends the greeting for the session', () => {
    const first = renderHook(() => useSpeaker());
    expect(first.result.current.muted).toBe(false);
    act(() => first.result.current.setMuted(true));
    expect(readMuted(local)).toBe(true);
    expect(shouldGreet(session)).toBe(false);
    first.unmount();
    const again = renderHook(() => useSpeaker());
    expect(again.result.current.muted).toBe(true);
    act(() => again.result.current.setMuted(false));
    expect(readMuted(local)).toBe(false);
  });
});
