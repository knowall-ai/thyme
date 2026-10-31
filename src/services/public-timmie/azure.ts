import { authHeaders } from './auth';
import type { PublicAzureConfig } from './config';
import { publicTimmieInstructions } from './prompt';

/**
 * Ask Timmie's text chat, on Timmie's own Azure OpenAI resource (the Responses API on the
 * v1 surface). No tools are ever sent (`tools: []`, `tool_choice: 'none'`) and nothing is
 * stored (`store: false`). Voice is in live.ts.
 */
export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export class UpstreamError extends Error {
  constructor(
    readonly status: number,
    readonly code?: string
  ) {
    super(`Azure OpenAI ${status}${code ? ` ${code}` : ''}`);
  }
}

/** The body of one stateless text turn. Exported for tests. */
export function publicChatRequest(deployment: string, turns: ChatTurn[]) {
  return {
    model: deployment,
    instructions: publicTimmieInstructions('chat'),
    input: turns.map((t) => ({ role: t.role, content: t.content })),
    tools: [],
    tool_choice: 'none',
    store: false,
    reasoning: { effort: 'low' },
    max_output_tokens: 1200,
  };
}

/** One stateless text turn: `store: false`, no tools. */
export async function publicChat(config: PublicAzureConfig, turns: ChatTurn[]): Promise<string> {
  if (!config.chatDeployment) throw new UpstreamError(503, 'not_configured');
  const response = await fetch(`${config.endpoint}/openai/v1/responses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders(config.apiKey)) },
    body: JSON.stringify(publicChatRequest(config.chatDeployment, turns)),
    cache: 'no-store',
    signal: AbortSignal.timeout(45_000),
  });
  const body = (await response.json().catch(() => ({}))) as {
    output?: { type?: string; content?: { type: string; text?: string }[] }[];
    error?: { code?: string };
  };
  if (!response.ok || !body.output) throw new UpstreamError(response.status, body.error?.code);
  let text = '';
  for (const item of body.output) {
    if (item.type !== 'message') continue;
    for (const part of item.content ?? []) {
      if (part.type === 'output_text' && part.text) text += part.text;
    }
  }
  return text;
}
