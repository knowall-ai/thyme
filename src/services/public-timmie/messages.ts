import type { ChainTurn } from './pass';
import { PUBLIC_LIMITS } from './shared';

// Control characters other than tab and newline.
const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f]/g;

export interface ChatRequest {
  /** Absent on the first message: the server starts a conversation. */
  conversationId?: string;
  messages: ChainTurn[];
}

/** The request, if it is well formed: only user and assistant turns, within the limits. */
export function parseChat(body: unknown): ChatRequest | undefined {
  const b = body as { messages?: unknown; conversationId?: unknown } | undefined;
  const messages = b?.messages;
  if (!Array.isArray(messages) || messages.length < 1) return undefined;
  if (messages.length > PUBLIC_LIMITS.maxMessages) return undefined;
  const conversationId = b?.conversationId;
  if (
    conversationId !== undefined &&
    (typeof conversationId !== 'string' || !/^[\w-]{8,40}$/.test(conversationId))
  ) {
    return undefined;
  }
  const out: ChainTurn[] = [];
  for (const m of messages as Record<string, unknown>[]) {
    if (!m || typeof m !== 'object') return undefined;
    if (m.role !== 'user' && m.role !== 'assistant') return undefined;
    if (typeof m.content !== 'string' || !m.content || m.content.length > 4000) return undefined;
    if (m.sig !== undefined && (typeof m.sig !== 'string' || m.sig.length > 64)) return undefined;
    if (m.exp !== undefined && (typeof m.exp !== 'number' || !Number.isFinite(m.exp))) {
      return undefined;
    }
    out.push({
      role: m.role,
      content: m.content,
      sig: m.sig as string | undefined,
      exp: m.exp as number | undefined,
    });
  }
  return { conversationId, messages: out };
}

/** The turns sent to the model, with control characters removed. */
export function modelTurns(messages: ChainTurn[]) {
  return messages.map((m) => ({ role: m.role, content: m.content.replace(CONTROL, '') }));
}
