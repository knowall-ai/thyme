// Project source links (Thyme BC Extension 1.20+ projectSourceLinks): which GitHub repos,
// Azure DevOps projects and repos, meeting keywords and attendee domains belong to a project.
// Poppie reads them to map activity to projects when she suggests time. Pure helpers: value
// normalisation and validation (mirroring the extension, so errors show before saving),
// link-out URLs, and the links a suggestion could become ("Always map this").
import type { BCTimeSuggestion, ProjectSourceLinkType } from '@/types';

export const PROJECT_SOURCE_LINK_TYPES: readonly ProjectSourceLinkType[] = [
  'GitHubRepo',
  'DevOpsRepo',
  'DevOpsProject',
  'MeetingKeyword',
  'AttendeeDomain',
];

export const SOURCE_LINK_TYPE_LABELS: Record<ProjectSourceLinkType, string> = {
  GitHubRepo: 'GitHub repo',
  DevOpsProject: 'DevOps project',
  DevOpsRepo: 'DevOps repo',
  MeetingKeyword: 'Meeting keyword',
  AttendeeDomain: 'Attendee domain',
};

export const SOURCE_LINK_PLACEHOLDERS: Record<ProjectSourceLinkType, string> = {
  GitHubRepo: 'contoso/app, contoso/* or a GitHub URL',
  DevOpsProject: 'contoso/Contoso App or a DevOps URL',
  DevOpsRepo: 'contoso/Contoso App/app-api or a repo URL',
  MeetingKeyword: 'A word or phrase in the meeting subject',
  AttendeeDomain: 'contoso.com or someone@contoso.com',
};

// Matches the extension's Text[250] Value field
export const SOURCE_LINK_VALUE_MAX = 250;

const SLUG = /^[a-z0-9._-]+$/;
const DOMAIN = /^[a-z0-9.-]+$/;

export type NormalisedValue =
  | { value: string; error?: undefined }
  | { value?: undefined; error: string };

function stripScheme(v: string): string {
  return v.replace(/^https?:\/\//i, '');
}

function normaliseGitHub(raw: string): NormalisedValue {
  let v = raw.toLowerCase();
  let isUrl = /^https?:\/\//.test(v);
  v = stripScheme(v).replace(/^www\./, '');
  if (v.startsWith('github.com/')) {
    v = v.slice('github.com/'.length);
    isUrl = true;
  }
  v = v.replace(/\/+$/, '');
  const parts = v.split('/');
  const error = `Enter owner/repo, owner/* for every repo of an owner, owner/prefix-* for repos starting with a prefix, or the repo's URL.`;
  if (parts.length < 2 || (parts.length > 2 && !isUrl)) return { error };
  const owner = parts[0];
  const repo = parts[1].replace(/\.git$/, '');
  if (!SLUG.test(owner)) return { error };
  const name = repo.endsWith('*') ? repo.slice(0, -1) : repo;
  if (repo !== '*' && !SLUG.test(name)) return { error };
  return { value: `${owner}/${repo}` };
}

function normaliseDevOps(raw: string, isRepo: boolean): NormalisedValue {
  let v = stripScheme(raw.replace(/%20/g, ' ')).replace(/\/+$/, '');
  if (/^dev\.azure\.com\//i.test(v)) v = v.slice('dev.azure.com/'.length);
  else {
    const m = /^([^/.]+)\.visualstudio\.com\/(?:defaultcollection\/)?(.*)$/i.exec(v);
    if (m) v = `${m[1]}/${m[2]}`;
  }
  const git = /^([^/]+\/[^/]+)\/_git\/([^/]+)/i.exec(v);
  if (git) v = `${git[1]}/${git[2]}`;
  const parts = v.split('/').map((p) => p.trim());
  if (isRepo) {
    if (
      parts.length < 3 ||
      (!git && parts.length !== 3) ||
      parts.slice(0, 3).some((p) => !p) ||
      parts[1].startsWith('_')
    ) {
      return {
        error:
          "Enter organisation/project/repo or the repo's URL (https://dev.azure.com/organisation/project/_git/repo).",
      };
    }
    return { value: parts.slice(0, 3).join('/') };
  }
  if (parts.length === 1) return { value: parts[0] };
  const bad =
    !parts[0] ||
    !parts[1] ||
    parts[1].startsWith('_') ||
    (parts.length > 2 && !git && !parts[2].startsWith('_'));
  if (bad)
    return {
      error:
        'Enter organisation/project, the project name, or its URL (https://dev.azure.com/organisation/project).',
    };
  return { value: `${parts[0]}/${parts[1]}` };
}

function normaliseKeyword(raw: string): NormalisedValue {
  const v = raw.replace(/^meeting:\s*/i, '').trim();
  if (v.length < 3) return { error: 'A meeting keyword must be at least 3 characters.' };
  return { value: v };
}

function normaliseDomain(raw: string): NormalisedValue {
  let v = stripScheme(raw.toLowerCase());
  if (v.includes('@')) v = v.slice(v.lastIndexOf('@') + 1);
  v = v.replace(/\/+$/, '').replace(/^www\./, '');
  if (!v.includes('.') || v.startsWith('.') || v.endsWith('.') || !DOMAIN.test(v)) {
    return { error: "Enter a domain such as contoso.com, or an attendee's e-mail address." };
  }
  return { value: v };
}

/**
 * The value as Business Central will store it, or why it can't be one. Mirrors the
 * extension's normalisation: a GitHub URL becomes owner/repo, a DevOps URL
 * organisation/project (or organisation/project/repo), an e-mail address its domain, and
 * "Meeting: " is dropped from a keyword. BC re-checks on save.
 */
export function normaliseSourceLinkValue(
  type: ProjectSourceLinkType,
  raw: string
): NormalisedValue {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return { error: 'Enter a value.' };
  let result: NormalisedValue;
  switch (type) {
    case 'GitHubRepo':
      result = normaliseGitHub(trimmed);
      break;
    case 'DevOpsProject':
      result = normaliseDevOps(trimmed, false);
      break;
    case 'DevOpsRepo':
      result = normaliseDevOps(trimmed, true);
      break;
    case 'MeetingKeyword':
      result = normaliseKeyword(trimmed);
      break;
    case 'AttendeeDomain':
      result = normaliseDomain(trimmed);
      break;
    default:
      return { error: 'Choose a type.' };
  }
  if (result.value !== undefined && result.value.length > SOURCE_LINK_VALUE_MAX) {
    return { error: `The value can be at most ${SOURCE_LINK_VALUE_MAX} characters.` };
  }
  return result;
}

/** Same type and value (case-insensitive), as BC's duplicate check sees it. */
export function sameSourceLink(
  a: { type: ProjectSourceLinkType; value: string },
  b: { type: ProjectSourceLinkType; value: string }
): boolean {
  return a.type === b.type && a.value.toLowerCase() === b.value.toLowerCase();
}

/**
 * Where a link's value points, for linking out: GitHub repos and DevOps projects/repos.
 * Patterns (owner/*) link to the owner; a bare DevOps project name (no organisation) can't.
 */
export function sourceLinkUrl(type: ProjectSourceLinkType, value: string): string | null {
  const enc = (s: string) => encodeURIComponent(s);
  if (type === 'GitHubRepo') {
    const [owner, repo = ''] = value.split('/');
    if (!owner) return null;
    return repo.includes('*')
      ? `https://github.com/${enc(owner)}`
      : `https://github.com/${enc(owner)}/${enc(repo)}`;
  }
  if (type === 'DevOpsProject') {
    const [org, project] = value.split('/');
    return org && project ? `https://dev.azure.com/${enc(org)}/${enc(project)}` : null;
  }
  if (type === 'DevOpsRepo') {
    const [org, project, repo] = value.split('/');
    return org && project && repo
      ? `https://dev.azure.com/${enc(org)}/${enc(project)}/_git/${enc(repo)}`
      : null;
  }
  return null;
}

/** The message BC put in an error ("BC API Error (400): {"error":{"message":"…"}}"), without its correlation id. */
export function bcErrorText(
  error: unknown,
  fallback = 'Something went wrong. Please try again.'
): string {
  if (!(error instanceof Error)) return fallback;
  const m = /BC API Error \((\d+)\): ([\s\S]*)$/.exec(error.message);
  if (!m) return error.message || fallback;
  try {
    const message: string | undefined = JSON.parse(m[2])?.error?.message;
    if (message) return message.replace(/\s*CorrelationId:[\s\S]*$/, '').trim();
  } catch {
    // not JSON
  }
  return m[1] === '403' ? "You don't have permission to do that in Business Central." : fallback;
}

export interface SourceLinkCandidate {
  type: ProjectSourceLinkType;
  value: string;
  label: string; // e.g. 'GitHub repo contoso/app'
}

const candidate = (type: ProjectSourceLinkType, value: string): SourceLinkCandidate => ({
  type,
  value,
  label: `${SOURCE_LINK_TYPE_LABELS[type]} ${value}`,
});

/**
 * The links a suggestion could become, most specific first, so "Always map this to the chosen
 * project" can create one: its GitHub repo; its DevOps repo, then project; or its meeting
 * subject, then the external attendee domains in its evidence. Read from the sourceRef
 * (github:owner/repo#pr1, github:owner/repo@date, devops:org/project/repo/pr/7,
 * devops:org/project/repo@date, devops:org/project/wi/42, devops:org/project/wi@date).
 */
export function sourceLinkCandidates(
  s: Pick<BCTimeSuggestion, 'source'> &
    Partial<Pick<BCTimeSuggestion, 'sourceRef' | 'description' | 'evidence'>>
): SourceLinkCandidate[] {
  const ref = (s.sourceRef || '').trim();
  const out: SourceLinkCandidate[] = [];
  if (s.source === 'GitHub') {
    const m = /^github:([^/#@\s]+\/[^/#@\s]+)/.exec(ref);
    if (m) out.push(candidate('GitHubRepo', m[1].toLowerCase()));
  } else if (s.source === 'DevOps') {
    const m = /^devops:(.+)$/.exec(ref);
    if (m) {
      const parts = m[1].replace(/@[^/]*$/, '').split('/');
      const [org, project, third] = parts;
      if (org && project) {
        if (third && third !== 'wi')
          out.push(candidate('DevOpsRepo', `${org}/${project}/${third}`));
        out.push(candidate('DevOpsProject', `${org}/${project}`));
      }
    }
  } else if (s.source === 'Calendar') {
    const m = /^Meeting:\s*(.+)$/.exec(s.description || '');
    const subject = m?.[1].trim();
    if (subject && subject.length >= 3 && subject.length <= SOURCE_LINK_VALUE_MAX) {
      out.push(candidate('MeetingKeyword', subject));
    }
    const d = /(?:^|; )external attendees: ([^;|]+)/i.exec(s.evidence || '');
    for (const domain of d ? d[1].split(',') : []) {
      const v = normaliseDomain(domain.trim());
      if (v.value) out.push(candidate('AttendeeDomain', v.value));
    }
  }
  return out;
}
