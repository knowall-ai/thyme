/**
 * The pricing page's enquiry form. Emails each enquiry to hello@knowall.ai from a KnowAll
 * mailbox through Microsoft Graph, with Reply-To set to the visitor.
 *
 * 200 sent (or a bot filled the honeypot), 400 invalid, 403 not posted from Timmie,
 * 413 too large, 429 rate limited, 502 Graph refused it, 503 mail isn't configured.
 */

import { enquiryEmail, parseEnquiry } from '@/services/contact/enquiry';
import { mailConfig, sendMail } from '@/services/contact/graphMail';
import { clientIp, consumeEnquiry, isSameOrigin } from '@/services/contact/requestGuards';

/** Largest request we'll read: the form's field limits fit well inside this */
const MAX_BODY_BYTES = 16 * 1024;

const FALLBACK = 'Please email hello@knowall.ai instead.';

function reply(body: object, status = 200, extra: Record<string, string> = {}): Response {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store', ...extra } });
}

/** The body as text, or null once it passes `limit` bytes, so it's never buffered in full */
async function readBody(req: Request, limit: number): Promise<string | null> {
  const declared = Number(req.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > limit) return null;
  if (!req.body) return '';
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

export async function POST(req: Request): Promise<Response> {
  if (!isSameOrigin(req)) return reply({ error: 'Forbidden' }, 403);

  const limit = consumeEnquiry(clientIp(req));
  if (!limit.ok) {
    return reply({ error: `Too many messages right now. ${FALLBACK}` }, 429, {
      'retry-after': String(limit.retryAfter),
    });
  }

  const raw = await readBody(req, MAX_BODY_BYTES);
  if (raw === null) return reply({ error: 'Message too long.' }, 413);

  let json: unknown = null;
  try {
    json = JSON.parse(raw);
  } catch {
    // Falls through to the validation error below
  }
  const enquiry = parseEnquiry(json);
  if (!enquiry) return reply({ error: 'Please check the form and try again.' }, 400);

  // Bots that fill the hidden field get a quiet "success" and no email
  if (enquiry.website) return reply({ ok: true });

  const config = mailConfig();
  if (!config) {
    console.error('Enquiry form: CONTACT_MAIL_* settings are missing; enquiry not sent.');
    return reply({ error: `The enquiry form is unavailable right now. ${FALLBACK}` }, 503);
  }

  const { subject, text } = enquiryEmail(enquiry);
  try {
    await sendMail(config, {
      subject,
      text,
      replyTo: { name: enquiry.name, address: enquiry.email },
    });
  } catch (err) {
    console.error('Enquiry form: send failed', err);
    return reply({ error: `Could not send your message. ${FALLBACK}` }, 502);
  }
  return reply({ ok: true });
}

export const dynamic = 'force-dynamic';
