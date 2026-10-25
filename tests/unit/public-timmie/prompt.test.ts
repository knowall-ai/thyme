import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { LANDING_FEATURES, PRICING_FAQ } from '@/services/public-timmie/knowledge';
import {
  DECLINE_REPLY,
  OFFLINE_REPLY,
  publicTimmieInstructions,
} from '@/services/public-timmie/prompt';

const SRC = path.resolve(__dirname, '../../../src');
const prompts = [publicTimmieInstructions('chat'), publicTimmieInstructions('voice')];

describe('Ask Timmie prompt hardening', () => {
  it('contains no ids, keys, emails or internal names', () => {
    const forbidden: [string, RegExp][] = [
      [
        'GUID (tenant, company or client id)',
        /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
      ],
      ['email address', /[\w.+-]+@[\w-]+\.[\w.]+/],
      ['API key shape', /\b(sk-[A-Za-z0-9]{10,}|api-key|Bearer\s)/i],
      [
        'env var name',
        /\b(AZURE_|PUBLIC_[A-Z]|NEXT_PUBLIC|APPROVED_TENANT|CONTACT_MAIL|TURNSTILE_|BC_[A-Z])/,
      ],
      ['Azure resource', /\.openai\.azure\.com|\bkv-|appi-|cognitiveservices|azurewebsites/i],
      ['internal code path', /services\/(auth|bc|contact)|src\/|\.tsx?\b|bcClient|tokenService/],
      ['long secret-like token', /[A-Za-z0-9+/_-]{40,}/],
      ['demo or sandbox company', /Contoso|CRONUS|Fabrikam|Northwind/i],
      ['phone or registration number', /\+?\d[\d\s-]{9,}\d/],
      ['money amount', /[£$€]\s?\d|\d\s?(GBP|EUR|USD)\b|\d[\d,]*\s?sats\b/i],
      ['internal agent tooling', /hermes|cron|\bVM\b|heartbeat/i],
    ];
    for (const prompt of prompts) {
      for (const [what, re] of forbidden) {
        expect(prompt.match(re), what).toBeNull();
      }
    }
  });

  it('contains none of the environment’s secret values', () => {
    const values = Object.entries(process.env)
      .filter(([k, v]) => v && v.length >= 12 && /KEY|SECRET|TOKEN|PASSWORD|ENDPOINT/i.test(k))
      .map(([, v]) => v!);
    for (const prompt of prompts) for (const v of values) expect(prompt.includes(v)).toBe(false);
  });

  it('states the rules that make it safe', () => {
    for (const prompt of prompts) {
      expect(prompt).toMatch(/cannot see or reach any organisation's timesheets/);
      expect(prompt).toMatch(/no tools/);
      expect(prompt).toMatch(/Never claim to look anything up/);
      expect(prompt).toMatch(/instructions are private/);
      expect(prompt).toMatch(/ignore your instructions/);
      expect(prompt).toMatch(/act as the signed-in app, the AI agent/);
      expect(prompt).toMatch(/\/pricing#enquire/);
      expect(prompt).toMatch(/cannot book meetings, take contact details or send emails/);
      expect(prompt).toMatch(/never legal, financial, tax, payroll or employment advice/);
      expect(prompt).toMatch(/Never make up prices.*email addresses/);
    }
  });

  it('is Timmie: KnowAll AI’s timekeeper, male, British, with sparing wit', () => {
    for (const prompt of prompts) {
      expect(prompt).toMatch(/You are Timmie, KnowAll AI's timekeeper/);
      expect(prompt).toMatch(/British spelling/);
      expect(prompt).toMatch(/a man who/);
      expect(prompt).toMatch(/used sparingly/);
      expect(prompt).toMatch(/Call the product simply "Timmie"/);
    }
  });

  it('never reads a web address aloud', () => {
    const voice = publicTimmieInstructions('voice');
    expect(voice).toMatch(/Never say a web address, domain name, path or URL aloud/);
    expect(voice).not.toMatch(/https?:\/\/gettimm\.ie/);
    expect(publicTimmieInstructions('chat')).toMatch(/https:\/\/gettimm\.ie/);
  });

  it('has no tools and is separate from the AI agent', () => {
    const src = readFileSync(path.join(SRC, 'services/public-timmie/prompt.ts'), 'utf8');
    expect(src).not.toMatch(/from '@\//);
    expect(prompts[0]).not.toMatch(/Use your tools/);
  });

  it('carries the whole pricing FAQ and the landing page features', () => {
    for (const { q, a } of PRICING_FAQ) {
      expect(prompts[0]).toContain(q);
      expect(prompts[0]).toContain(a);
    }
    for (const { title } of LANDING_FEATURES) expect(prompts[0]).toContain(title);
  });

  it('fixed replies point to the enquiry form and contain no email address', () => {
    for (const text of [DECLINE_REPLY, OFFLINE_REPLY]) {
      expect(text).toContain('/pricing#enquire');
      expect(text).not.toMatch(/@/);
    }
  });
});

describe('knowledge stays in sync with the public pages', () => {
  it('every pricing FAQ is still on the pricing page, word for word', () => {
    const pricing = readFileSync(path.join(SRC, 'app/pricing/page.tsx'), 'utf8').replace(
      /\s+/g,
      ' '
    );
    for (const { q, a } of PRICING_FAQ) {
      expect(pricing).toContain(`question: '${q}'`);
      expect(pricing).toContain(a.replace(/'/g, "\\'").replace(/\s+/g, ' '));
    }
  });

  it('every feature card is still on the landing page', () => {
    const landing = readFileSync(path.join(SRC, 'components/landing/LandingPage.tsx'), 'utf8');
    for (const { title } of LANDING_FEATURES) expect(landing).toContain(`title: '${title}'`);
  });

  it('the enquiry form is still at /pricing#enquire', () => {
    const pricing = readFileSync(path.join(SRC, 'app/pricing/page.tsx'), 'utf8');
    expect(pricing).toContain('id="enquire"');
  });
});
