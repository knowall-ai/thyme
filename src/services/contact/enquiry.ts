/**
 * The pricing page's enquiry form: what it sends to /api/contact, how the server checks
 * it, and the email that reaches hello@knowall.ai. Shared by the form and the route.
 */

export const ENQUIRY_OPTIONS = ['hosting', 'support', 'other'] as const;
export type EnquiryOption = (typeof ENQUIRY_OPTIONS)[number];

export const ENQUIRY_OPTION_LABELS: Record<EnquiryOption, string> = {
  hosting: 'Paid hosting',
  support: 'Support for self-hosting',
  other: 'Something else',
};

export interface EnquiryPayload {
  name: string;
  email: string;
  company?: string;
  option: EnquiryOption;
  /** Free text, e.g. "12" or "about 40" */
  users?: string;
  message: string;
  /** Honeypot: hidden from people, filled in by naive bots */
  website?: string;
}

const LIMITS = { name: 100, email: 200, company: 120, users: 20, message: 5000, website: 200 };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ONE_LINE = /^[^\r\n]*$/;

function text(value: unknown, max: number): string | undefined | null {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > max ? null : trimmed || undefined;
}

/** The checked payload, or null when anything is missing, too long or malformed */
export function parseEnquiry(input: unknown): EnquiryPayload | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;

  const name = text(raw.name, LIMITS.name);
  const email = text(raw.email, LIMITS.email);
  const company = text(raw.company, LIMITS.company);
  const users = text(raw.users, LIMITS.users);
  const message = text(raw.message, LIMITS.message);
  const website = text(raw.website, LIMITS.website);
  const option = raw.option;

  if (!name || name.length < 2 || !ONE_LINE.test(name)) return null;
  if (!email || !EMAIL.test(email)) return null;
  if (company === null || (company && !ONE_LINE.test(company))) return null;
  if (users === null || (users && !ONE_LINE.test(users))) return null;
  if (!message || message.length < 10) return null;
  if (website === null) return null;
  if (typeof option !== 'string' || !ENQUIRY_OPTIONS.includes(option as EnquiryOption)) {
    return null;
  }

  return {
    name,
    email,
    company,
    option: option as EnquiryOption,
    users,
    message,
    website,
  };
}

/** Subject and plain-text body of the email sent to hello@knowall.ai */
export function enquiryEmail(p: EnquiryPayload): { subject: string; text: string } {
  const subject = `Timmie enquiry (${ENQUIRY_OPTION_LABELS[p.option]}) from ${p.name}`;
  const lines = [
    `Name: ${p.name}`,
    `Email: ${p.email}`,
    `Company: ${p.company ?? '(not given)'}`,
    `Interested in: ${ENQUIRY_OPTION_LABELS[p.option]}`,
    `Users: ${p.users ?? '(not given)'}`,
    '',
    p.message,
    '',
    '--',
    'Sent from the enquiry form on the Timmie pricing page. Reply to answer the visitor.',
  ];
  return { subject, text: lines.join('\n') };
}
