import { guard, jsonError } from '@/services/public-timmie/guard';
import type { CallUpdate } from '@/services/public-timmie/live';
import { findCall } from '@/services/public-timmie/live-calls';

export const dynamic = 'force-dynamic';

/**
 * Live captions for a call, as server-sent events: what Timmie is saying, whether he is
 * speaking, and when the call ends. Only for the call key and IP that started it. The
 * visitor's own words are never sent here (or anywhere).
 */
export function GET(request: Request) {
  const checked = guard(request);
  if (!checked.ok) return checked.response;
  const call = findCall(new URL(request.url).searchParams.get('call'), checked.ip);
  if (!call) return jsonError(404, 'No such call.');

  const encoder = new TextEncoder();
  let cleanup = () => undefined as void;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let open = true;
      const send = (update: CallUpdate) => {
        if (!open) return;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(update)}\n\n`));
        if (update.type === 'ended') close();
      };
      const keepAlive = setInterval(
        () => open && controller.enqueue(encoder.encode(': \n\n')),
        15_000
      );
      const close = () => {
        if (!open) return;
        open = false;
        clearInterval(keepAlive);
        call.listeners.delete(send);
        try {
          controller.close();
        } catch {
          // Already closed.
        }
      };
      cleanup = close;
      for (const update of call.backlog) send(update);
      if (call.ended) return close();
      call.listeners.add(send);
      request.signal.addEventListener('abort', close);
    },
    cancel() {
      cleanup();
    },
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}
