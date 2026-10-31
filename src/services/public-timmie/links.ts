/**
 * Links Ask Timmie may show: our own public pages, knowall.ai and the two open-source
 * repositories. Shared by the server (sanitising replies) and the widget (rendering
 * them), so no other URL is ever clickable.
 */
const ALLOWED_HOSTS = new Set(['gettimm.ie', 'timmie.knowall.ai', 'knowall.ai', 'www.knowall.ai']);
const SITE_PATHS = /^\/(pricing|help|eula|privacy|terms)?(#[\w-]+)?$/;
const REPOS = /^\/knowall-ai\/(timmie|timmie-bc-extension)\/?$/;

export function isAllowedLink(href: string): boolean {
  if (SITE_PATHS.test(href)) return true;
  try {
    const url = new URL(href);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return false;
    if (url.search) return false;
    if (url.hostname === 'github.com') return REPOS.test(url.pathname);
    if (!ALLOWED_HOSTS.has(url.hostname)) return false;
    // On our own hosts, only the public pages (never /api or app routes).
    if (url.hostname === 'gettimm.ie' || url.hostname === 'timmie.knowall.ai') {
      return SITE_PATHS.test(`${url.pathname === '/' ? '/' : url.pathname}${url.hash}`);
    }
    return true;
  } catch {
    return false;
  }
}
