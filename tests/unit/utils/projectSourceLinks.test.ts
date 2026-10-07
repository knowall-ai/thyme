import { describe, it, expect } from 'vitest';
import {
  bcErrorText,
  normaliseSourceLinkValue,
  sameSourceLink,
  sourceLinkCandidates,
  sourceLinkUrl,
} from '@/utils/projectSourceLinks';

// All values are made up (Contoso / Fabrikam / Tailspin)

describe('normaliseSourceLinkValue', () => {
  it('reduces GitHub URLs to owner/repo and keeps owner patterns', () => {
    expect(normaliseSourceLinkValue('GitHubRepo', 'https://github.com/Contoso/App.git').value).toBe(
      'contoso/app'
    );
    expect(
      normaliseSourceLinkValue('GitHubRepo', 'https://github.com/contoso/app/pull/12').value
    ).toBe('contoso/app');
    expect(normaliseSourceLinkValue('GitHubRepo', 'contoso/*').value).toBe('contoso/*');
    expect(normaliseSourceLinkValue('GitHubRepo', 'contoso/tailspin-*').value).toBe(
      'contoso/tailspin-*'
    );
  });

  it('rejects GitHub values that are not a repo', () => {
    expect(normaliseSourceLinkValue('GitHubRepo', 'contoso').error).toBeTruthy();
    expect(normaliseSourceLinkValue('GitHubRepo', 'contoso/app/extra').error).toBeTruthy();
    expect(normaliseSourceLinkValue('GitHubRepo', 'contoso/my app').error).toBeTruthy();
    expect(normaliseSourceLinkValue('GitHubRepo', 'https://gitlab.com/contoso/app').error).toMatch(
      /not a GitHub URL/
    );
    expect(
      normaliseSourceLinkValue('GitHubRepo', 'https://dev.azure.com/contoso/app/_git/x').error
    ).toBeTruthy();
    expect(normaliseSourceLinkValue('GitHubRepo', 'github.com/contoso/app').value).toBe(
      'contoso/app'
    );
    expect(normaliseSourceLinkValue('GitHubRepo', '  ').error).toBe('Enter a value.');
  });

  it('reduces DevOps URLs to organisation/project and organisation/project/repo', () => {
    expect(
      normaliseSourceLinkValue(
        'DevOpsProject',
        'https://dev.azure.com/contoso/Contoso%20App/_workitems'
      ).value
    ).toBe('contoso/Contoso App');
    expect(
      normaliseSourceLinkValue('DevOpsProject', 'https://contoso.visualstudio.com/Contoso App')
        .value
    ).toBe('contoso/Contoso App');
    expect(normaliseSourceLinkValue('DevOpsProject', 'Contoso App').value).toBe('Contoso App');
    expect(
      normaliseSourceLinkValue(
        'DevOpsProject',
        'https://dev.azure.com/contoso/Contoso App/_git/app-api'
      ).value
    ).toBe('contoso/Contoso App');
    expect(
      normaliseSourceLinkValue(
        'DevOpsRepo',
        'https://contoso.visualstudio.com/DefaultCollection/Contoso App/_git/app-api/pullrequest/4'
      ).value
    ).toBe('contoso/Contoso App/app-api');
    expect(normaliseSourceLinkValue('DevOpsRepo', 'contoso/Contoso App/app-api').value).toBe(
      'contoso/Contoso App/app-api'
    );
    expect(
      normaliseSourceLinkValue('DevOpsRepo', 'https://dev.azure.com/contoso/Contoso App').error
    ).toBeTruthy();
    expect(
      normaliseSourceLinkValue('DevOpsProject', 'contoso/Contoso App/extra').error
    ).toBeTruthy();
  });

  it('drops "Meeting: " from keywords and needs 3 characters', () => {
    expect(normaliseSourceLinkValue('MeetingKeyword', 'Meeting: Tailspin weekly').value).toBe(
      'Tailspin weekly'
    );
    expect(normaliseSourceLinkValue('MeetingKeyword', 'ab').error).toMatch(/3 characters/);
  });

  it('turns an attendee address into its domain', () => {
    expect(normaliseSourceLinkValue('AttendeeDomain', 'Someone@Fabrikam.com').value).toBe(
      'fabrikam.com'
    );
    expect(normaliseSourceLinkValue('AttendeeDomain', 'https://www.fabrikam.com/').value).toBe(
      'fabrikam.com'
    );
    expect(normaliseSourceLinkValue('AttendeeDomain', 'fabrikam').error).toBeTruthy();
  });

  it('enforces the 250-character limit', () => {
    expect(normaliseSourceLinkValue('MeetingKeyword', 'x'.repeat(251)).error).toMatch(/250/);
  });
});

describe('sameSourceLink', () => {
  it('compares type and value case-insensitively', () => {
    expect(
      sameSourceLink(
        { type: 'MeetingKeyword', value: 'Tailspin' },
        { type: 'MeetingKeyword', value: 'tailspin' }
      )
    ).toBe(true);
    expect(
      sameSourceLink({ type: 'MeetingKeyword', value: 'x' }, { type: 'AttendeeDomain', value: 'x' })
    ).toBe(false);
  });
});

describe('sourceLinkUrl', () => {
  it('links GitHub repos (patterns to the owner) and DevOps projects and repos', () => {
    expect(sourceLinkUrl('GitHubRepo', 'contoso/app')).toBe('https://github.com/contoso/app');
    expect(sourceLinkUrl('GitHubRepo', 'contoso/*')).toBe('https://github.com/contoso');
    expect(sourceLinkUrl('DevOpsProject', 'contoso/Contoso App')).toBe(
      'https://dev.azure.com/contoso/Contoso%20App'
    );
    expect(sourceLinkUrl('DevOpsRepo', 'contoso/Contoso App/app-api')).toBe(
      'https://dev.azure.com/contoso/Contoso%20App/_git/app-api'
    );
    expect(sourceLinkUrl('DevOpsProject', 'Contoso App')).toBeNull();
    expect(sourceLinkUrl('MeetingKeyword', 'Tailspin')).toBeNull();
  });
});

describe('sourceLinkCandidates', () => {
  it('offers a GitHub suggestion its repo', () => {
    expect(
      sourceLinkCandidates({ source: 'GitHub', sourceRef: 'github:Contoso/App@2026-10-06' })
    ).toEqual([{ type: 'GitHubRepo', value: 'contoso/app', label: 'GitHub repo contoso/app' }]);
    expect(
      sourceLinkCandidates({ source: 'GitHub', sourceRef: 'github:contoso/app#pr12' })[0].value
    ).toBe('contoso/app');
  });

  it('offers a DevOps PR its repo, then its project; a work item only its project', () => {
    expect(
      sourceLinkCandidates({
        source: 'DevOps',
        sourceRef: 'devops:contoso/Tailspin/billing-api/pr/7',
      }).map((c) => c.value)
    ).toEqual(['contoso/Tailspin/billing-api', 'contoso/Tailspin']);
    expect(
      sourceLinkCandidates({
        source: 'DevOps',
        sourceRef: 'devops:contoso/Tailspin/billing-api@2026-10-06',
      }).map((c) => c.type)
    ).toEqual(['DevOpsRepo', 'DevOpsProject']);
    expect(
      sourceLinkCandidates({ source: 'DevOps', sourceRef: 'devops:contoso/Tailspin/wi/42' })
    ).toEqual([
      {
        type: 'DevOpsProject',
        value: 'contoso/Tailspin',
        label: 'DevOps project contoso/Tailspin',
      },
    ]);
    expect(
      sourceLinkCandidates({ source: 'DevOps', sourceRef: 'devops:contoso/Tailspin/wi@2026-10-06' })
    ).toHaveLength(1);
  });

  it('offers a meeting its subject, then its external attendee domains', () => {
    const c = sourceLinkCandidates({
      source: 'Calendar',
      description: 'Meeting: Tailspin weekly',
      evidence: 'attended 10:00–10:30; external attendees: fabrikam.com, Northwind.example',
    });
    expect(c.map((x) => [x.type, x.value])).toEqual([
      ['MeetingKeyword', 'Tailspin weekly'],
      ['AttendeeDomain', 'fabrikam.com'],
      ['AttendeeDomain', 'northwind.example'],
    ]);
  });

  it('offers nothing it cannot read', () => {
    expect(sourceLinkCandidates({ source: 'Other', sourceRef: 'x' })).toEqual([]);
    expect(sourceLinkCandidates({ source: 'Calendar', description: 'Lunch' })).toEqual([]);
  });
});

describe('bcErrorText', () => {
  it("returns BC's message without the correlation id", () => {
    const err = new Error(
      'BC API Error (400): {"error":{"code":"Internal_Error","message":"The GitHub Repo \\"contoso/app\\" is already linked to project PR00010.  CorrelationId:  abc"}}'
    );
    expect(bcErrorText(err)).toBe(
      'The GitHub Repo "contoso/app" is already linked to project PR00010.'
    );
  });

  it('falls back for other errors', () => {
    expect(bcErrorText(new Error('BC API Error (403): Forbidden'))).toMatch(/permission/);
    expect(bcErrorText('nope', 'fallback')).toBe('fallback');
  });
});
