import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/contact/route';
import { enquiryEmail, parseEnquiry } from '@/services/contact/enquiry';
import { resetMailTokenCache } from '@/services/contact/graphMail';
import {
  CONTACT_LIMITS,
  clientIp,
  consumeAttempt,
  isSameOrigin,
  reserveDailyMail,
  resetContactLimits,
} from '@/services/contact/requestGuards';

const valid = {
  name: 'Alex Morgan',
  email: 'alex@contoso.com',
  company: 'Contoso',
  option: 'hosting',
  users: '12',
  message: 'We would like Timmie hosted for our team.',
};

function request(body: unknown, headers: Record<string, string> = {}) {
  return new Request('https://gettimm.ie/api/contact', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://gettimm.ie',
      'x-forwarded-for': '203.0.113.7:51234',
      ...headers,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

const MAIL_ENV = {
  CONTACT_MAIL_TENANT_ID: 'tenant',
  CONTACT_MAIL_CLIENT_ID: 'client',
  CONTACT_MAIL_CLIENT_SECRET: 'secret',
};

describe('parseEnquiry', () => {
  it('accepts a complete enquiry and trims it', () => {
    expect(parseEnquiry({ ...valid, name: '  Alex Morgan ' })).toMatchObject({
      name: 'Alex Morgan',
      option: 'hosting',
    });
  });

  it('treats company and users as optional', () => {
    const { company: _c, users: _u, ...rest } = valid;
    expect(parseEnquiry(rest)).toMatchObject({ company: undefined, users: undefined });
  });

  it.each([
    ['a missing name', { name: '' }],
    ['a name with a line break', { name: 'Alex\nBcc: x@y.z' }],
    ['a bad email', { email: 'not-an-email' }],
    ['a short message', { message: 'hi' }],
    ['an unknown option', { option: 'enterprise' }],
    ['a non-string field', { company: 42 }],
    ['an over-long message', { message: 'x'.repeat(5001) }],
  ])('rejects %s', (_label, change) => {
    expect(parseEnquiry({ ...valid, ...change })).toBeNull();
  });

  it('rejects anything that is not an object', () => {
    expect(parseEnquiry(null)).toBeNull();
    expect(parseEnquiry('hello')).toBeNull();
  });
});

describe('enquiryEmail', () => {
  it('names the option and the visitor in the subject', () => {
    const { subject, text } = enquiryEmail(parseEnquiry(valid)!);
    expect(subject).toBe('Timmie enquiry (Paid hosting) from Alex Morgan');
    expect(text).toContain('Users: 12');
    expect(text).toContain(valid.message);
  });
});

describe('request guards', () => {
  beforeEach(() => resetContactLimits());

  it('uses the last x-forwarded-for entry, without its port', () => {
    const req = new Request('https://gettimm.ie', {
      headers: { 'x-forwarded-for': '1.2.3.4, 203.0.113.7:51234' },
    });
    expect(clientIp(req)).toBe('203.0.113.7');
  });

  it("prefers Front Door's socket IP over x-forwarded-for", () => {
    const req = new Request('https://gettimm.ie', {
      headers: { 'x-azure-socketip': '198.51.100.9', 'x-forwarded-for': '10.0.0.1:443' },
    });
    expect(clientIp(req)).toBe('198.51.100.9');
  });

  describe('with FRONT_DOOR_ID set', () => {
    beforeEach(() => {
      vi.stubEnv('FRONT_DOOR_ID', 'FB60DCA5-0000-4000-8000-000000000001');
    });
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it('trusts the socket IP from our Front Door (case-insensitive id)', () => {
      const req = new Request('https://gettimm.ie', {
        headers: {
          'x-azure-socketip': '198.51.100.9',
          'x-azure-fdid': 'fb60dca5-0000-4000-8000-000000000001',
          'x-forwarded-for': '10.0.0.1:443',
        },
      });
      expect(clientIp(req)).toBe('198.51.100.9');
    });

    it('ignores a socket IP from any other Front Door, or none', () => {
      for (const fdid of ['00000000-0000-4000-8000-000000000000', undefined]) {
        const headers: Record<string, string> = {
          'x-azure-socketip': '198.51.100.9',
          'x-forwarded-for': '1.2.3.4, 203.0.113.7:51234',
        };
        if (fdid) headers['x-azure-fdid'] = fdid;
        expect(clientIp(new Request('https://gettimm.ie', { headers }))).toBe('203.0.113.7');
      }
    });
  });

  it('caps the day and gives a slot back when it is released', () => {
    const now = Date.UTC(2026, 9, 25, 12);
    const reservations = [];
    for (let i = 0; i < CONTACT_LIMITS.perDay; i++) {
      const r = reserveDailyMail(now);
      expect(r.ok).toBe(true);
      reservations.push(r);
    }
    expect(reserveDailyMail(now).ok).toBe(false);
    const last = reservations.at(-1)!;
    if (last.ok) last.release();
    expect(reserveDailyMail(now).ok).toBe(true);
    expect(reserveDailyMail(now + 24 * 60 * 60 * 1000).ok).toBe(true);
  });

  it('allows Timmie origins and same-host loopback, nothing else', () => {
    const at = (origin: string, host = 'gettimm.ie') =>
      isSameOrigin(new Request('https://gettimm.ie', { headers: { origin, host } }));
    expect(at('https://gettimm.ie')).toBe(true);
    expect(at('https://timmie.knowall.ai')).toBe(true);
    expect(at('http://localhost:3101', 'localhost:3101')).toBe(true);
    expect(at('http://localhost:3101')).toBe(false);
    expect(at('https://evil.example')).toBe(false);
    expect(isSameOrigin(new Request('https://gettimm.ie'))).toBe(false);
  });

  it('limits each IP within the window', () => {
    const now = Date.UTC(2026, 9, 25, 12);
    for (let i = 0; i < CONTACT_LIMITS.perIp; i++) {
      expect(consumeAttempt('203.0.113.7', now).ok).toBe(true);
    }
    expect(consumeAttempt('203.0.113.7', now).ok).toBe(false);
    expect(consumeAttempt('198.51.100.1', now).ok).toBe(true);
    expect(consumeAttempt('203.0.113.7', now + CONTACT_LIMITS.windowMs).ok).toBe(true);
  });
});

describe('POST /api/contact', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    resetContactLimits();
    resetMailTokenCache();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    for (const [k, v] of Object.entries(MAIL_ENV)) vi.stubEnv(k, v);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  function mockGraph(sendStatus = 202) {
    fetchMock
      .mockResolvedValueOnce(Response.json({ access_token: 'token', expires_in: 3600 }))
      .mockResolvedValueOnce(new Response(null, { status: sendStatus }));
  }

  it('emails hello@knowall.ai with Reply-To set to the visitor', async () => {
    mockGraph();
    const res = await POST(request(valid));
    expect(res.status).toBe(200);

    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe('https://graph.microsoft.com/v1.0/users/sallie%40knowall.ai/sendMail');
    const { message } = JSON.parse(init.body);
    expect(message.toRecipients[0].emailAddress.address).toBe('hello@knowall.ai');
    expect(message.replyTo[0].emailAddress).toEqual({
      name: 'Alex Morgan',
      address: 'alex@contoso.com',
    });
  });

  it('refuses posts from other sites', async () => {
    const res = await POST(request(valid, { origin: 'https://evil.example' }));
    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects invalid enquiries and bad JSON', async () => {
    expect((await POST(request({ ...valid, email: 'nope' }))).status).toBe(400);
    expect((await POST(request('{not json'))).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects oversized bodies', async () => {
    const res = await POST(request({ ...valid, message: 'x'.repeat(20_000) }));
    expect(res.status).toBe(413);
  });

  it('quietly drops honeypot submissions', async () => {
    const res = await POST(request({ ...valid, website: 'http://spam.example' }));
    expect(res.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('says so when mail is not configured', async () => {
    vi.stubEnv('CONTACT_MAIL_CLIENT_SECRET', '');
    const res = await POST(request(valid));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toContain('hello@knowall.ai');
  });

  it('returns 502 when Graph refuses the message', async () => {
    mockGraph(403);
    const res = await POST(request(valid));
    expect(res.status).toBe(502);
  });

  it("doesn't let invalid posts use up the day's quota", async () => {
    for (let i = 0; i < CONTACT_LIMITS.perDay + 5; i++) {
      const res = await POST(
        request({ ...valid, email: 'nope' }, { 'x-azure-socketip': `10.0.${i >> 8}.${i & 255}` })
      );
      expect(res.status).toBe(400);
    }
    mockGraph();
    expect((await POST(request(valid))).status).toBe(200);
  });

  it('gives the daily slot back when Graph refuses the message', async () => {
    for (let i = 0; i < CONTACT_LIMITS.perDay; i++) {
      resetMailTokenCache();
      mockGraph(i === 0 ? 403 : 202);
      const res = await POST(request(valid, { 'x-azure-socketip': `10.1.${i >> 8}.${i & 255}` }));
      expect(res.status).toBe(i === 0 ? 502 : 200);
    }
    resetMailTokenCache();
    mockGraph();
    expect((await POST(request(valid))).status).toBe(200);
    expect((await POST(request(valid, { 'x-azure-socketip': '10.9.9.9' }))).status).toBe(429);
  });

  it('rate limits repeat senders', async () => {
    for (let i = 0; i < CONTACT_LIMITS.perIp; i++) {
      resetMailTokenCache();
      mockGraph();
      expect((await POST(request(valid))).status).toBe(200);
    }
    const res = await POST(request(valid));
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBeTruthy();
  });
});
