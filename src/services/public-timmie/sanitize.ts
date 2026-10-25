import { isAllowedLink } from './links';
import { PUBLIC_RULES } from './prompt';

/**
 * Output checks on Ask Timmie's text replies, applied on the server before anything
 * reaches the browser:
 *  - images are removed, and links to anywhere but our own public pages, knowall.ai and
 *    the open-source repositories are reduced to their text (no exfiltration via a
 *    crafted markdown link or image URL);
 *  - raw HTML is stripped;
 *  - a reply that quotes a run of the private rules is replaced by a decline (leaksPrompt).
 */
export function sanitizeReply(text: string): string {
  return (
    text
      // Images: drop entirely, keep only the alt text.
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
      // Markdown links: keep allowed ones, else just the label.
      .replace(/\[([^\]]*)\]\(([^)\s]*)[^)]*\)/g, (_m, label: string, href: string) =>
        isAllowedLink(href) ? `[${label}](${href})` : label
      )
      // Raw HTML tags.
      .replace(/<\/?[a-z][^>]*>/gi, '')
      // Bare URLs that aren't ours (markdown link targets were checked above).
      .replace(/(?<!\]\()\bhttps?:\/\/[^\s)\]]+/gi, (url) => {
        const trimmed = url.replace(/[.,;:!?]+$/, '');
        return isAllowedLink(trimmed) ? url : '[link removed]';
      })
      .trim()
  );
}

const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

const SHINGLE = 9;
const ruleShingles = (() => {
  const w = words(PUBLIC_RULES);
  const set = new Set<string>();
  for (let i = 0; i + SHINGLE <= w.length; i++) set.add(w.slice(i, i + SHINGLE).join(' '));
  return set;
})();

/** True when the reply reproduces nine or more consecutive words of the rules, three times over. */
export function leaksPrompt(reply: string): boolean {
  const w = words(reply);
  let matches = 0;
  for (let i = 0; i + SHINGLE <= w.length; i++) {
    if (ruleShingles.has(w.slice(i, i + SHINGLE).join(' '))) {
      matches += 1;
      if (matches >= 3) return true;
      i += SHINGLE - 1;
    }
  }
  return false;
}
