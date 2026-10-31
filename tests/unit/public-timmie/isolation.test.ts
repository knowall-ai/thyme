import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Static proof that Ask Timmie cannot reach Business Central, sign-in or anything in the
 * signed-in app: walk the import graph from every public-helper file and check it only
 * ever touches its own modules (plus Timmie's pure client-IP helper) and a short list of
 * packages. The ESLint rule catches direct imports; this catches indirect ones.
 */
const SRC = path.resolve(__dirname, '../../../src');
const ROOTS = ['app/api/public', 'services/public-timmie', 'components/public-timmie'];

const ALLOWED_LOCAL = [
  'app/api/public/',
  'services/public-timmie/',
  'components/public-timmie/',
  // Pure, import-free client IP and same-site checks, shared with the enquiry form.
  'services/contact/requestGuards.ts',
];
const ALLOWED_PACKAGES = [
  'react',
  'next/dynamic',
  'next/image',
  'next/link',
  '@heroicons/react/24/outline',
  'node:crypto',
  // The server's sideband WebSocket client. It sends auth headers, which the standard
  // WebSocket constructor cannot.
  'ws',
];
const FORBIDDEN = [
  'services/auth',
  'services/bc',
  'services/health',
  'services/contact/graphMail',
  'services/contact/enquiry',
  'hooks/',
  'config/',
  'components/layout',
  'components/settings',
  'components/access',
];

function filesUnder(dir: string): string[] {
  const abs = path.join(SRC, dir);
  if (!existsSync(abs)) return [];
  return readdirSync(abs, { recursive: true })
    .map((f) => path.join(abs, String(f)))
    .filter((f) => statSync(f).isFile() && /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f));
}

function importsOf(source: string): string[] {
  const specs = new Set<string>();
  const patterns = [
    /\bimport\s+(?:type\s+)?[^'"]*?\sfrom\s+['"]([^'"]+)['"]/g,
    /\bexport\s+[^'"]*?\sfrom\s+['"]([^'"]+)['"]/g,
    /\bimport\s+['"]([^'"]+)['"]/g,
    /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const re of patterns) for (const m of source.matchAll(re)) specs.add(m[1]);
  return [...specs];
}

function resolveLocal(spec: string, from: string): string | undefined {
  const base = spec.startsWith('@/')
    ? path.join(SRC, spec.slice(2))
    : spec.startsWith('.')
      ? path.resolve(path.dirname(from), spec)
      : undefined;
  if (!base) return undefined;
  for (const candidate of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}/index.ts`,
    `${base}/index.tsx`,
  ]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return `${base}.ts`; // Unresolvable: report it as-is so the check fails loudly.
}

function walk(entries: string[]) {
  const seen = new Set<string>();
  const packages = new Set<string>();
  const queue = [...entries];
  while (queue.length) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    if (!existsSync(file)) continue;
    for (const spec of importsOf(readFileSync(file, 'utf8'))) {
      const local = resolveLocal(spec, file);
      if (local) queue.push(local);
      else packages.add(spec);
    }
  }
  return { files: [...seen].map((f) => path.relative(SRC, f)), packages: [...packages] };
}

const entries = ROOTS.flatMap(filesUnder);
const graph = walk(entries);

describe('Ask Timmie import isolation', () => {
  it('finds the public helper files', () => {
    expect(entries.length).toBeGreaterThanOrEqual(15);
    expect(graph.files).toContain('services/public-timmie/prompt.ts');
    expect(graph.files).toContain('app/api/public/chat/route.ts');
    expect(graph.files).toContain('components/public-timmie/PublicTimmiePanel.tsx');
  });

  it('reaches only its own modules', () => {
    const outside = graph.files.filter((f) => !ALLOWED_LOCAL.some((a) => f.startsWith(a)));
    expect(outside).toEqual([]);
  });

  it('never reaches sign-in, Business Central, Graph or the signed-in app', () => {
    const bad = graph.files.filter((f) => FORBIDDEN.some((x) => f.includes(x)));
    expect(bad).toEqual([]);
  });

  it('the one shared helper imports nothing', () => {
    const guards = readFileSync(path.join(SRC, 'services/contact/requestGuards.ts'), 'utf8');
    expect(importsOf(guards)).toEqual([]);
  });

  it('uses only allow-listed packages', () => {
    const extra = graph.packages.filter((p) => !ALLOWED_PACKAGES.includes(p));
    expect(extra).toEqual([]);
  });

  it('the scanner itself catches indirect and dynamic imports', () => {
    expect(
      importsOf(
        "import { x } from '@/services/bc/bcClient';\nexport * from '../auth/tokenService';\nconst m = await import('@/hooks/useCompany');"
      )
    ).toEqual(['@/services/bc/bcClient', '../auth/tokenService', '@/hooks/useCompany']);
  });

  it('server code reads only the PUBLIC_* environment variables', () => {
    // NODE_ENV; App Service's managed identity endpoint (set by the platform, holds no
    // secret of ours); and the Front Door id shared with other KnowAll apps.
    const allowed = new Set(['NODE_ENV', 'IDENTITY_ENDPOINT', 'IDENTITY_HEADER', 'FRONT_DOOR_ID']);
    const problems: string[] = [];
    for (const file of entries) {
      const rel = path.relative(SRC, file);
      const source = readFileSync(file, 'utf8');
      const names = [
        ...source.matchAll(/process\.env\.([A-Z0-9_]+)|process\.env\[['"]([A-Z0-9_]+)['"]\]/g),
        // config.ts reads through a small env('NAME') helper
        ...source.matchAll(/\benv\(\s*['"]([A-Z0-9_]+)['"]/g),
      ].map((m) => m[1] ?? m[2]);
      for (const name of names) {
        if (name.startsWith('PUBLIC_') || allowed.has(name)) continue;
        problems.push(`${rel}: ${name}`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('never borrows another Azure OpenAI setting', () => {
    const config = readFileSync(path.join(SRC, 'services/public-timmie/config.ts'), 'utf8');
    expect(config).not.toMatch(/(?<!PUBLIC_)AZURE_OPENAI_/);
    expect(config).not.toMatch(/process\.env\.AZURE_/);
  });

  it('the ESLint rule covers the public helper folders', () => {
    const eslint = readFileSync(path.resolve(SRC, '../eslint.config.mjs'), 'utf8');
    for (const glob of [
      'src/app/api/public/**',
      'src/services/public-timmie/**',
      'src/components/public-timmie/**',
    ]) {
      expect(eslint).toContain(`'${glob}'`);
    }
    for (const forbidden of [
      '@/services/auth/**',
      '@/services/bc/**',
      '@/hooks/**',
      '@azure/msal-react',
    ]) {
      expect(eslint).toContain(`'${forbidden}'`);
    }
  });

  it('the signed-in check lives outside the helper', () => {
    const host = readFileSync(path.join(SRC, 'components/landing/AskTimmie.tsx'), 'utf8');
    expect(host).toMatch(/isAuthenticated \|\| isLoading\) return null/);
    for (const page of [
      'components/landing/LandingPage.tsx',
      'components/docs/PublicPageLayout.tsx',
    ]) {
      expect(readFileSync(path.join(SRC, page), 'utf8')).toContain('<AskTimmie />');
    }
  });
});
