// ─────────────────────────────────────────────────────────────────────────────
// Remediation Wave J — the community-scoping contract, pinned
//
// Wave J's Part 2 brief asked one question — "where product requirements require
// true community scoping, implement server-side filtering" — and forbade one
// answer: "do not silently claim that client-side filtering is equivalent to
// server-side filtering".
//
// The audit's finding was that **no domain can be scoped server-side**, and the
// further finding, which nobody had asked for and which mattered more, was that
// no certified list response carries the field the *client-side* projection
// reads either.
//
// These tests pin the three properties that follow from that, because each of
// them is one a well-meaning future change could quietly undo:
//
//   1. `isApproximate` never becomes true on the strength of a location country.
//   2. A page with no origin signal is returned **whole**, not emptied.
//   3. The pagination limitation is reported rather than absorbed.
//
// Deliberately unit tests over `narrowToScope` rather than integration tests
// over a mock: the mock is the thing that hid this defect for four waves, and a
// test that depends on it can only re-certify whatever the fixtures happen to
// say. Every input here is written out in the test.
// ─────────────────────────────────────────────────────────────────────────────

import {
  DOMAIN_SCOPE_BASIS,
  narrowToScope,
  type CommunityContentDomain,
} from '../community-directory-api';
import { projectScope } from '../community/scope';
import type { Community, CommunityId, CommunityScope } from '@/types/community-directory';

// ── Fixtures, written out rather than imported ───────────────────────────────

function communityWithOrigin(id: string, countryCode: string | null): Community {
  return {
    id,
    slug: id,
    name: id,
    type: 'National',
    origin: { countryCode },
    identity: {},
    status: 'Active',
  } as unknown as Community;
}

const NIGERIAN = communityWithOrigin('ng', 'NG');
const WEST_AFRICAN = communityWithOrigin('wa', null);

const lookup = (id: CommunityId) => [NIGERIAN, WEST_AFRICAN].find((c) => c.id === id);

const scopeFor = (id: string): CommunityScope => ({
  mode: 'SELECTED_COMMUNITY',
  communityIds: [id],
});

const nigerianProjection = () => projectScope(scopeFor('ng'), lookup);

const ALL_DOMAINS = Object.keys(DOMAIN_SCOPE_BASIS) as CommunityContentDomain[];

// ═════════════════════════════════════════════════════════════════════════════

describe('no domain is scoped server-side, and the map says so', () => {
  it('records that no certified list response carries a publisher origin', () => {
    // The whole of Part 2's finding in one assertion. If this ever fails it is
    // because a backend wave shipped the field — which is good news, and the
    // right response is to delete the entry from this list rather than to relax
    // the assertion.
    for (const domain of ALL_DOMAINS) {
      expect(DOMAIN_SCOPE_BASIS[domain].carriedOnCertifiedResponse).toBe(false);
    }
  });

  it('carries the evidence for each domain, so the claim is checkable', () => {
    // A register of facts about another repository is worth exactly as much as
    // its citations. Every entry names a file.
    for (const domain of ALL_DOMAINS) {
      expect(DOMAIN_SCOPE_BASIS[domain].evidence).toMatch(/\.cs|mocks\//);
    }
  });

  it('names no publisher object for the four domains that have none', () => {
    // `EventSummaryResponse`, `OrganizationSummaryResponse`, guides and updates
    // have no publisher object at all — not an unpopulated one, an absent one.
    for (const domain of ['event', 'organization', 'guide', 'update'] as const) {
      expect(DOMAIN_SCOPE_BASIS[domain].publisherKey).toBeNull();
    }
  });
});

describe('a location country is never accepted as a community', () => {
  it('does not narrow events by the country the event is held in', () => {
    // The defect this replaced: a Ghanaian association meeting in Peckham has
    // `location.countryCode === 'GB'`. Under a Nigerian scope the old fallback
    // kept whichever events happened to be *in* Nigeria and discarded every
    // Nigerian-community event in London — the exact inversion of the question.
    const events = [
      { location: { countryCode: 'NG' } },
      { location: { countryCode: 'GB' } },
      { location: {} },
    ];

    const result = narrowToScope('event', events, nigerianProjection());

    expect(result.scopeUnavailable).toBe(true);
    expect(result.items).toHaveLength(3);
    expect(result.scopeApplied).toBe(false);
  });

  it('does not narrow guides by the jurisdiction they are about', () => {
    const guides = [{ country: { code: 'NG' } }, { country: { code: 'GB' } }];

    const result = narrowToScope('guide', guides, nigerianProjection());

    expect(result.scopeUnavailable).toBe(true);
    expect(result.items).toHaveLength(2);
  });

  it('returns the page whole rather than empty when it cannot scope it', () => {
    // The alternative — filtering anyway and returning nothing — would render as
    // "your community has nothing here", which is a claim about the member's
    // community made on the strength of a missing backend field.
    const rows = [{ seller: { displayName: 'A' } }, { seller: { displayName: 'B' } }];

    const result = narrowToScope('marketplace', rows, nigerianProjection());

    expect(result.items).toHaveLength(2);
    expect(result.totalAfterScope).toBe(result.totalBeforeScope);
  });
});

describe('isApproximate says what actually happened', () => {
  it('is true when a country projection genuinely stood in for a community', () => {
    const rows = [
      { employer: { originCountry: { code: 'NG' } } },
      { employer: { originCountry: { code: 'GH' } } },
    ];

    const result = narrowToScope('job', rows, nigerianProjection());

    expect(result.scopeApplied).toBe(true);
    expect(result.isApproximate).toBe(true);
    expect(result.items).toHaveLength(1);
  });

  it('is false when nothing was applied at all — a stronger admission, not a weaker one', () => {
    const result = narrowToScope('job', [{ employer: {} }], nigerianProjection());

    expect(result.scopeUnavailable).toBe(true);
    expect(result.isApproximate).toBe(false);
  });

  it('is false for an unscoped read, and that stays a different state from unavailable', () => {
    const unscoped = projectScope({ mode: 'ALL_COMMUNITIES', communityIds: [] }, lookup);
    const result = narrowToScope('job', [{ employer: {} }], unscoped);

    expect(result.isApproximate).toBe(false);
    // Nothing was *unavailable*: the member asked for everything and got it.
    expect(result.scopeUnavailable).toBe(false);
  });

  it('keeps an empty scope empty rather than treating it as unavailable', () => {
    // §42's most dangerous confusion: "I follow no communities" must not widen to
    // the whole platform, and must not be reported as a missing capability
    // either. It is a complete, correct, empty answer.
    const empty = projectScope({ mode: 'INTERESTED_COMMUNITIES', communityIds: [] }, lookup);
    const result = narrowToScope('job', [{ employer: { originCountry: { code: 'NG' } } }], empty);

    expect(result.items).toEqual([]);
    expect(result.scopeApplied).toBe(true);
    expect(result.scopeUnavailable).toBe(false);
  });
});

describe('the pagination limitation is reported, not absorbed', () => {
  it('marks a narrowing that only saw one server page', () => {
    // Twenty rows in, one match out. The other nineteen matches — if there are
    // any — are on server pages this read cannot ask for, because the cursor
    // advances the server's page and not the projection's.
    const rows = Array.from({ length: 20 }, (_, index) => ({
      employer: { originCountry: { code: index === 0 ? 'NG' : 'GH' } },
    }));

    const result = narrowToScope('job', rows, nigerianProjection(), [], { pageLimited: true });

    expect(result.items).toHaveLength(1);
    expect(result.pageLimited).toBe(true);
    expect(result.resultTruncated).toBe(true);
  });

  it('stays true even when the page happened to survive intact', () => {
    // The flag describes the mechanism, not the outcome. A page that lost
    // nothing this time is still a page, and the next one is still unreachable.
    const rows = [{ employer: { originCountry: { code: 'NG' } } }];

    const result = narrowToScope('job', rows, nigerianProjection(), [], { pageLimited: true });

    expect(result.items).toHaveLength(1);
    expect(result.pageLimited).toBe(true);
  });

  it('is false for an in-memory collection, which has no pages', () => {
    // `useScopedCollection` narrows something already wholly in the app. Claiming
    // a pagination limitation there would be inventing a caveat.
    const result = narrowToScope('job', [{ employer: { originCountry: { code: 'NG' } } }], nigerianProjection());

    expect(result.pageLimited).toBe(false);
  });
});

describe('the two publisher-origin shapes are both read', () => {
  it('reads the flat provider shape and the nested shape identically', () => {
    // `ProviderOwnerResponse.cs:26` declares a flat `originCountryCode`; jobs,
    // housing and marketplace carry a nested `originCountry: CountryRef`.
    // Reading only one of the two is how the provider directory would match
    // nothing even after the backend began populating the field.
    const flat = narrowToScope(
      'provider',
      [{ owner: { originCountryCode: 'NG' } }, { owner: { originCountryCode: 'GH' } }],
      nigerianProjection()
    );

    const nested = narrowToScope(
      'job',
      [
        { employer: { originCountry: { code: 'NG' } } },
        { employer: { originCountry: { code: 'GH' } } },
      ],
      nigerianProjection()
    );

    expect(flat.items).toHaveLength(1);
    expect(nested.items).toHaveLength(1);
    expect(flat.isApproximate).toBe(nested.isApproximate);
  });
});
