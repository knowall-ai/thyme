/**
 * Send mail through Microsoft Graph as one KnowAll mailbox, with an app-only token.
 * The Entra app should hold Mail.Send restricted to that one mailbox (Exchange RBAC for
 * Applications), so a leaked secret can't send as anyone else. Same setup as the
 * knowall.ai contact form; see "Enquiry form" in docs/DEPLOYMENT.adoc.
 */

export interface MailConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  /** Mailbox the message is sent from */
  from: string;
  /** Where enquiries land */
  to: string;
}

/** Reads the CONTACT_MAIL_* settings; null when any required one is missing */
export function mailConfig(env: NodeJS.ProcessEnv = process.env): MailConfig | null {
  const { CONTACT_MAIL_TENANT_ID, CONTACT_MAIL_CLIENT_ID, CONTACT_MAIL_CLIENT_SECRET } = env;
  if (!CONTACT_MAIL_TENANT_ID || !CONTACT_MAIL_CLIENT_ID || !CONTACT_MAIL_CLIENT_SECRET) {
    return null;
  }
  return {
    tenantId: CONTACT_MAIL_TENANT_ID,
    clientId: CONTACT_MAIL_CLIENT_ID,
    clientSecret: CONTACT_MAIL_CLIENT_SECRET,
    from: env.CONTACT_MAIL_FROM || 'sallie@knowall.ai',
    to: env.CONTACT_MAIL_TO || 'hello@knowall.ai',
  };
}

let cached: { token: string; expires: number; key: string } | null = null;

async function accessToken(c: MailConfig): Promise<string> {
  const key = `${c.tenantId}:${c.clientId}`;
  if (cached && cached.key === key && cached.expires > Date.now() + 60_000) return cached.token;

  const res = await fetch(`https://login.microsoftonline.com/${c.tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: c.clientId,
      client_secret: c.clientSecret,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    }),
  });
  if (!res.ok) throw new Error(`Graph token request failed (${res.status})`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cached = { token: json.access_token, expires: Date.now() + json.expires_in * 1000, key };
  return json.access_token;
}

export interface OutgoingMail {
  subject: string;
  /** Plain text body */
  text: string;
  /** The visitor, so replying goes straight to them */
  replyTo?: { name: string; address: string };
}

export async function sendMail(c: MailConfig, mail: OutgoingMail): Promise<void> {
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(c.from)}/sendMail`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${await accessToken(c)}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          subject: mail.subject,
          body: { contentType: 'Text', content: mail.text },
          toRecipients: [{ emailAddress: { address: c.to } }],
          replyTo: mail.replyTo
            ? [{ emailAddress: { name: mail.replyTo.name, address: mail.replyTo.address } }]
            : undefined,
        },
        saveToSentItems: true,
      }),
    }
  );
  if (!res.ok) throw new Error(`Graph sendMail failed (${res.status})`);
}

/** Test hook: forget the cached token */
export function resetMailTokenCache() {
  cached = null;
}
