// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Community scope resolution and projection (Frontend
// Phase 13, §12, §13, §15, §42, §43)
//
// The single source of truth for three questions the whole phase depends on:
//
//   1. Given a mode and a membership set, **which communities** are in scope?
//   2. Given a scope, what **cache key token** represents it?
//   3. Given a scope, what **parameters** can the certified routes actually be
//      asked for, and what part of the scope could not be expressed?
//
// Every community-sensitive query in the application derives its key from (2)
// and its request from (3). There is no second implementation of either, which
// is what makes §42's "avoid cross-community data leakage" a property of the
// codebase rather than a rule people remember.
//
// ── (2) is the part worth reading carefully ──────────────────────────────────
//
// The scope token is derived from the **resolved community id set**, not from
// the mode. That is deliberate and it cuts both ways:
//
//   *Isolation.* Two different id sets always produce two different tokens, so
//   Nigerian-scoped guides and Ghanaian-scoped guides are two cache entries and
//   neither can ever serve the other. §72 requires this to be proved, and
//   `community-cache-isolation.test.ts` proves it.
//
//   *Deduplication.* `PRIMARY_COMMUNITY` resolving to `[ng]` and
//   `SELECTED_COMMUNITY` resolving to `[ng]` produce the **same** token,
//   because they produce the same request and therefore the same response.
//   Keying on the mode as well would double the cache for no benefit, and §60
//   forbids massive cache duplication in as many words.
//
// The one distinction the token must preserve, and does:
//
//   `ALL_COMMUNITIES`      → `all`   — send no community parameter
//   a non-empty id set     → `c:…`   — scope to exactly these
//   an **empty** id set    → `none`  — the member has no community of this kind
//
// `none` is not `all`. A member with no interests, in `INTERESTED_COMMUNITIES`
// mode, must see an empty state — not the entire platform. Conflating those two
// is the most likely way this phase could show somebody the wrong data, and the
// token makes them different strings.
//
// ── (3) is the honest part ───────────────────────────────────────────────────
//
// No certified route accepts a community id. FRONTEND-PHASE13-GAP-009 says so at
// length.
//
// ⚠ **REMEDIATION WAVE J — the sentence that used to follow was wrong, and it
// was the sentence this whole projection rests on.** It read: "What the routes
// do accept is the publisher's country of origin — a real, populated, certified
// field". Audited route by route against the backend source, **neither half of
// that is true**:
//
//   *No route filters on origin.* Every `countryCode` / `country` parameter on
//   every discovery route resolves to `<entity>.Location.CountryCode` — where
//   the thing is, not where its publisher came from. Eight routes, eight
//   identical predicates; the table with file:line for each is in
//   `lib/community-directory-api.ts`, above `DOMAIN_SCOPE_BASIS`.
//
//   *No route returns origin either.* `JobCardResponse` has no employer object
//   at all; `LandlordSummaryResponse` and `SellerSummaryResponse` declare no
//   country field; `EventSummaryResponse` and `OrganizationSummaryResponse` have
//   no publisher object. `ProviderOwnerResponse` is the sole exception and it is
//   worse than an absence: it *declares* `OriginCountryCode`, its doc comment
//   says "the client's origin-country filter reads this", and its only producer
//   — `ProviderMapper.ToOwner`, `Application/Mapping/ProviderMapper.cs:434-444` —
//   assigns it `null` unconditionally.
//
// The field the application has been filtering on at `(tabs)/discover.tsx:316`
// is populated by the development fixtures (`mocks/data.ts:29` and the three
// domain data modules) and by nothing else. So the projection has looked like a
// working community filter in development for four waves, and against the real
// server it would have matched **zero rows under every scope** — an entire app
// of empty lists, each reading as "your community has nothing here".
//
// What this changes, and what it deliberately does not:
//
//   `projectScope()` is unchanged, and `isApproximate` still comes back **true**
//   for every scoped projection. Not one domain moved to server-side filtering,
//   because not one domain can: a location filter is not a community filter, and
//   substituting one would hide the very content a member asked for — a
//   Nigerian-community event in London has `Location.CountryCode = 'GB'`.
//
//   `narrowToScope()` now checks each page for an origin signal before narrowing
//   it, and reports `scopeUnavailable` when there is none, so the list says the
//   filter was not applied instead of returning nothing and letting the member
//   draw a conclusion about their community.
//
// So `projectScope()` converts a community scope into country codes and returns,
// alongside them, an honest account of what it lost: which communities have no
// country to project onto, and whether the result is a real filter or an
// approximation. Every list that applies a projection renders that account. A
// country of origin is not a community, the UI says so, and — since Wave J — it
// also says when there was no country of origin to go on at all.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  Community,
  CommunityAssociation,
  CommunityFilterSelection,
  CommunityId,
  CommunityMembership,
  CommunityMembershipSet,
  CommunityMode,
  CommunityRef,
  CommunityScope,
} from '@/types/community-directory';
import { UNKNOWN_ASSOCIATION } from '@/types/community-directory';

// ═════════════════════════════════════════════════════════════════════════════
// CANONICALIZATION
// ═════════════════════════════════════════════════════════════════════════════

/**
 * De-duplicated, sorted, trimmed.
 *
 * Sorting is what makes the token stable: a member who selects Ghana then
 * Nigeria must hit the same cache entry as one who selected Nigeria then Ghana,
 * because they are asking for the same thing. Without this the cache would
 * silently double for every ordering.
 */
export function canonicalCommunityIds(ids: readonly (CommunityId | null | undefined)[]): CommunityId[] {
  const seen = new Set<CommunityId>();

  for (const id of ids) {
    const trimmed = typeof id === 'string' ? id.trim() : '';
    if (trimmed) seen.add(trimmed);
  }

  return [...seen].sort();
}

/** The unscoped scope. Used as the safe default before membership has loaded. */
export const ALL_COMMUNITIES_SCOPE: CommunityScope = {
  mode: 'ALL_COMMUNITIES',
  communityIds: [],
};

// ═════════════════════════════════════════════════════════════════════════════
// RESOLUTION — §12, §13
// ═════════════════════════════════════════════════════════════════════════════

/** The membership states that count as *belonging* for scope purposes. */
const MEMBER_STATES = new Set(['Member', 'VerifiedMember']);

/** The states that count as a declared interest. §8: interest is not membership. */
const INTEREST_STATES = new Set(['Interested']);

/**
 * "My communities" for filter purposes: belonging, or following.
 *
 * `Following` is included because a follower asked to see the community's
 * content, which is what a content filter is for. `Interested` is **not**,
 * because §8 requires interest to influence personalization without claiming
 * membership — and `INTERESTED_COMMUNITIES` is its own mode for exactly that.
 * `PendingApproval` is not, because an application is not yet access.
 */
const MY_COMMUNITY_STATES = new Set(['Member', 'VerifiedMember', 'Following']);

export function isMemberState(membership: CommunityMembership): boolean {
  return MEMBER_STATES.has(membership.state);
}

/**
 * The member's primary community, from the set.
 *
 * Prefers the server's `primaryCommunityId` over scanning `isPrimary`, because
 * a set with two `isPrimary` entries is a server bug that must render as *one*
 * primary rather than as whichever came back first. Falls back to the scan when
 * the server did not state one, and to `null` when there is genuinely none —
 * which §9 permits: a member need not have a primary community.
 */
/**
 * The memberships in a set, or an empty list.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 *
 * Every function below used to guard `!set` and then dereference
 * `set.memberships` — which is safe only if the field is always an array. The
 * type says it is: `CommunityMembershipSet.memberships` is declared required
 * and non-nullable, so `tsc` had no reason to object and never did.
 *
 * A type is a claim about data the client did not produce. On the first screen
 * after sign-in, `set` arrived as an object whose `memberships` was absent, and
 * `set.memberships.length` threw — taking the whole Home screen down with a red
 * render error, on the very first thing a member sees after verifying.
 *
 * These functions already accept `null | undefined`, so tolerating a malformed
 * object is the same job, not a new one. The empty list is the honest answer:
 * a set that did not tell us its memberships has not told us about any.
 */
function membershipsOf(set: CommunityMembershipSet | null | undefined): CommunityMembership[] {
  return Array.isArray(set?.memberships) ? set.memberships : [];
}

export function resolvePrimaryMembership(
  set: CommunityMembershipSet | null | undefined
): CommunityMembership | null {
  const memberships = membershipsOf(set);
  if (memberships.length === 0) return null;

  if (set?.primaryCommunityId) {
    const stated = memberships.find((m) => m.communityId === set.primaryCommunityId);
    if (stated) return stated;
  }

  return memberships.find((m) => m.isPrimary) ?? null;
}

export function resolveInterestedCommunityIds(
  set: CommunityMembershipSet | null | undefined
): CommunityId[] {
  return canonicalCommunityIds(
    membershipsOf(set)
      .filter((m) => INTEREST_STATES.has(m.state))
      .map((m) => m.communityId)
  );
}

export function resolveMyCommunityIds(
  set: CommunityMembershipSet | null | undefined
): CommunityId[] {
  return canonicalCommunityIds(
    membershipsOf(set)
      .filter((m) => MY_COMMUNITY_STATES.has(m.state))
      .map((m) => m.communityId)
  );
}

/**
 * Turns a selection plus a membership set into a resolved scope.
 *
 * This is the only function that reads a mode. Everything downstream — query
 * keys, requests, labels — reads the *resolved* scope, which is why a mode can
 * be added later without auditing every call site.
 *
 * Note what happens when the member has nothing: `PRIMARY_COMMUNITY` with no
 * primary resolves to an **empty** id set, not to `ALL_COMMUNITIES`. The screen
 * then renders "you have not chosen a primary community yet" and offers the
 * onboarding step. Silently widening to everything would answer a question the
 * member did not ask.
 */
export function resolveScope(
  selection: CommunityFilterSelection,
  membershipSet: CommunityMembershipSet | null | undefined
): CommunityScope {
  const mode: CommunityMode = selection.mode;

  switch (mode) {
    case 'ALL_COMMUNITIES':
      return { mode, communityIds: [] };

    case 'PRIMARY_COMMUNITY': {
      const primary = resolvePrimaryMembership(membershipSet);
      return { mode, communityIds: primary ? [primary.communityId] : [] };
    }

    case 'INTERESTED_COMMUNITIES':
      return { mode, communityIds: resolveInterestedCommunityIds(membershipSet) };

    case 'SELECTED_COMMUNITY': {
      // Exactly one, even if the caller passed several — the mode names the
      // cardinality and honouring it here keeps the label truthful.
      const ids = canonicalCommunityIds(selection.communityIds ?? []);
      return { mode, communityIds: ids.slice(0, 1) };
    }

    case 'CROSS_COMMUNITY': {
      const explicit = canonicalCommunityIds(selection.communityIds ?? []);
      // A cross-community mode with nothing chosen means "everything I am
      // connected to", which is the useful reading and the one the switcher
      // presents. It is still not `ALL_COMMUNITIES`: it resolves to the
      // member's own set, so the request is scoped and the token is not `all`.
      return {
        mode,
        communityIds: explicit.length > 0 ? explicit : resolveMyCommunityIds(membershipSet),
      };
    }

    default: {
      // Exhaustiveness: a new mode must be handled above rather than falling
      // through to something that silently widens the scope.
      const never: never = mode;
      return { mode: never, communityIds: [] };
    }
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// THE CACHE TOKEN — §43, §72
// ═════════════════════════════════════════════════════════════════════════════

/**
 * The string that represents a scope in a query key.
 *
 * Three shapes, and the difference between the second and third is the one that
 * prevents the leak §42 warns about:
 *
 *   `all`            unscoped. No community parameter is sent.
 *   `c:a|b`          scoped to exactly these, sorted.
 *   `none`           the member has no community of the requested kind.
 *
 * Stable, short, and readable in a devtools cache dump — which matters, because
 * the way somebody will most likely notice a cross-community collision is by
 * reading a key.
 */
export function communityScopeToken(scope: CommunityScope | null | undefined): string {
  if (!scope) return 'all';
  if (scope.mode === 'ALL_COMMUNITIES') return 'all';

  const ids = canonicalCommunityIds(scope.communityIds);
  if (ids.length === 0) return 'none';

  return `c:${ids.join('|')}`;
}

/** True when a scope asks for nothing at all, so a query should not run. */
export function isEmptyScope(scope: CommunityScope | null | undefined): boolean {
  return communityScopeToken(scope) === 'none';
}

/** True when a scope asks for everything, so no community parameter is sent. */
export function isUnscoped(scope: CommunityScope | null | undefined): boolean {
  return communityScopeToken(scope) === 'all';
}

/**
 * Attaches the scope token to a query-parameter object.
 *
 * Existing key factories already hash their whole params object — for example
 * `communityLifeKeys.events(params)` — so adding this field is enough to give
 * every one of them per-scope isolation with no new key machinery. That is why
 * §43's requirement lands as one extra field rather than as a rewrite of every
 * key in the app.
 *
 * The field is named `communityScope` rather than `communityIds` on purpose: it
 * is a *cache dimension*, not a request parameter, and the request parameters
 * come from `projectScope()`. Anything that sent this string to a backend would
 * be sending `c:dev-ng|dev-gh` to a route that has never heard of it.
 */
export function withCommunityScope<T extends object>(
  params: T,
  scope: CommunityScope | null | undefined
): T & { communityScope: string } {
  return { ...params, communityScope: communityScopeToken(scope) };
}

// ═════════════════════════════════════════════════════════════════════════════
// PROJECTION ONTO CERTIFIED ROUTES — FRONTEND-PHASE13-GAP-009
// ═════════════════════════════════════════════════════════════════════════════

/**
 * What a scope becomes when it has to be asked of routes that have never heard
 * of a community.
 *
 * `isApproximate` is the field every list surface must render. It is true
 * whenever the projection is standing in for a community filter rather than
 * being one — which today is *always*, unless the scope is unscoped. Pretending
 * otherwise is the conflation §2 exists to prevent.
 */
export interface ScopeProjection {
  /** Country-of-origin codes to filter on. Empty when nothing was expressible. */
  originCountryCodes: string[];
  /**
   * The single code, for routes that accept only one (`MapSearchParams.countryCode`,
   * the Discover filter). Null when the scope spans several countries, in which
   * case the caller filters client-side and says the view is approximate.
   */
  singleCountryCode: string | null;
  /** True when no filter should be applied at all. */
  isUnscoped: boolean;
  /** True when the scope resolved to nothing, so the caller should render empty. */
  isEmpty: boolean;
  /**
   * True when the country projection stands in for a community filter. Drives
   * `<CommunityScopeNote>`, which is how the member is told.
   */
  isApproximate: boolean;
  /**
   * Communities in scope that have no country of origin at all — regional,
   * ethno-linguistic and interest communities. Their content **cannot** be
   * found by this projection, and the note names them rather than quietly
   * returning fewer results.
   */
  unexpressed: CommunityRef[];
  /** The scope this came from, so a caller can re-derive the token. */
  scope: CommunityScope;
}

/**
 * Projects a scope onto the parameters certified routes accept.
 *
 * `lookup` resolves a community id to its record. A community the client has not
 * loaded contributes nothing to the projection and is reported in
 * `unexpressed`, so a scope containing an unknown id narrows the request rather
 * than silently widening it — the failure mode that would otherwise show a
 * member the whole platform when they asked for one community.
 */
export function projectScope(
  scope: CommunityScope,
  lookup: (id: CommunityId) => Community | CommunityRef | undefined
): ScopeProjection {
  if (isUnscoped(scope)) {
    return {
      originCountryCodes: [],
      singleCountryCode: null,
      isUnscoped: true,
      isEmpty: false,
      isApproximate: false,
      unexpressed: [],
      scope,
    };
  }

  if (isEmptyScope(scope)) {
    return {
      originCountryCodes: [],
      singleCountryCode: null,
      isUnscoped: false,
      isEmpty: true,
      isApproximate: false,
      unexpressed: [],
      scope,
    };
  }

  const codes = new Set<string>();
  const unexpressed: CommunityRef[] = [];

  for (const id of scope.communityIds) {
    const community = lookup(id);

    if (!community) {
      // Not loaded. Nothing to project, and saying so is better than dropping it.
      continue;
    }

    const code = community.origin.countryCode?.trim().toUpperCase();
    if (code) {
      codes.add(code);
    } else {
      unexpressed.push(toRef(community));
    }
  }

  const originCountryCodes = [...codes].sort();

  return {
    originCountryCodes,
    singleCountryCode: originCountryCodes.length === 1 ? originCountryCodes[0] : null,
    isUnscoped: false,
    isEmpty: false,
    // Always true for a scoped request: the routes cannot express a community
    // filter, so anything they do express is an approximation of one.
    isApproximate: true,
    unexpressed,
    scope,
  };
}

/** The compact reference, from either shape. */
export function toRef(community: Community | CommunityRef): CommunityRef {
  return {
    id: community.id,
    slug: community.slug,
    name: community.name,
    type: community.type,
    origin: community.origin,
    identity: community.identity,
  };
}

/**
 * Whether an entity passes a projection, for the client-side pass.
 *
 * Used where a route cannot express the filter and the client has to narrow the
 * page it got. Two properties worth stating:
 *
 *   An entity with **no** origin country does not pass a scoped projection. It
 *   is not evidence of belonging, and including it would make the filter mean
 *   "these countries, plus anything unlabelled".
 *
 *   An unscoped projection passes everything, including unlabelled entities.
 */
export function matchesProjection(
  entityOriginCountryCode: string | null | undefined,
  projection: ScopeProjection
): boolean {
  if (projection.isUnscoped) return true;
  if (projection.isEmpty) return false;
  if (projection.originCountryCodes.length === 0) return false;

  const code = entityOriginCountryCode?.trim().toUpperCase();
  if (!code) return false;

  return projection.originCountryCodes.includes(code);
}

// ═════════════════════════════════════════════════════════════════════════════
// CONTENT ASSOCIATION — §39, GAP-009
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Which community a piece of content is associated with, and on what basis.
 *
 * The three inputs, in the order they are trusted:
 *
 *   `declaredCommunityIds`  the server stated it. A fact about the content.
 *                           No certified route sends this today — the parameter
 *                           exists so the migration in GAP-009 is a one-line
 *                           change here rather than a change in every card.
 *   `originCountryCode`     the publisher's country of origin. An inference —
 *                           a Ghanaian-origin seller's sofa is not Ghanaian
 *                           community content — and, since Wave J's audit,
 *                           known to be **absent from every certified list
 *                           response**. See the header. Callers pass what they
 *                           have; against the real server that is usually null,
 *                           and `resolveAssociation` then falls to `location`,
 *                           which is why the resulting basis is labelled
 *                           `'location'` and rendered as such rather than
 *                           passing for `'origin'`.
 *   `locationCountryCode`   where the content is. Weaker still, and only used
 *                           when there is no origin at all.
 *
 * Where more than one community shares the projected country — which is the
 * normal case once regional and city-chapter communities exist — the first by
 * canonical order is primary and the rest go in `additional`. The UI shows one
 * badge and a count, never a wall of them.
 */
export function resolveAssociation(input: {
  declaredCommunityIds?: readonly CommunityId[] | null;
  originCountryCode?: string | null;
  locationCountryCode?: string | null;
  /** Every community the client knows about, for country → community lookup. */
  communities: readonly (Community | CommunityRef)[];
}): CommunityAssociation {
  const { declaredCommunityIds, originCountryCode, locationCountryCode, communities } = input;

  if (declaredCommunityIds && declaredCommunityIds.length > 0) {
    const declared = canonicalCommunityIds(declaredCommunityIds)
      .map((id) => communities.find((c) => c.id === id))
      .filter((c): c is Community | CommunityRef => Boolean(c))
      .map(toRef);

    if (declared.length > 0) {
      return {
        community: declared[0],
        basis: 'declared',
        additional: declared.slice(1),
      };
    }
  }

  const origin = originCountryCode?.trim().toUpperCase();
  if (origin) {
    const matches = communitiesForCountry(origin, communities);
    if (matches.length > 0) {
      return { community: matches[0], basis: 'origin', additional: matches.slice(1) };
    }
  }

  const place = locationCountryCode?.trim().toUpperCase();
  if (place) {
    const matches = communitiesForCountry(place, communities);
    if (matches.length > 0) {
      return { community: matches[0], basis: 'location', additional: matches.slice(1) };
    }
  }

  return UNKNOWN_ASSOCIATION;
}

/**
 * Communities whose country of origin is this country.
 *
 * Deliberately many-to-one. §2: a country is not a community, and the plural
 * return type is the type system's way of saying so — a caller cannot write
 * `communityForCountry(code).name` and accidentally assume the mapping is a
 * bijection.
 */
export function communitiesForCountry(
  countryCode: string,
  communities: readonly (Community | CommunityRef)[]
): CommunityRef[] {
  const code = countryCode.trim().toUpperCase();

  return communities
    .filter((c) => c.origin.countryCode?.trim().toUpperCase() === code)
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(toRef);
}

// ═════════════════════════════════════════════════════════════════════════════
// LABELS — §56, §58
// ═════════════════════════════════════════════════════════════════════════════

/**
 * The label for a mode, for a chip or a switcher row.
 *
 * Community *names* are never composed here — they come from the data (§58).
 * What this produces is the English label for the mode itself, which belongs
 * with the platform's other UI strings and goes through the same i18n path when
 * one exists. `communityCount` is taken rather than derived so a caller can
 * label a mode before its scope has resolved.
 */
export function communityModeLabel(mode: CommunityMode, communityCount?: number): string {
  switch (mode) {
    case 'ALL_COMMUNITIES':
      return 'All communities';
    case 'PRIMARY_COMMUNITY':
      return 'My primary community';
    case 'SELECTED_COMMUNITY':
      return 'Selected community';
    case 'INTERESTED_COMMUNITIES':
      return typeof communityCount === 'number' && communityCount > 0
        ? `Communities I follow (${communityCount})`
        : 'Communities I follow';
    case 'CROSS_COMMUNITY':
      return typeof communityCount === 'number' && communityCount > 0
        ? `Across ${communityCount} communities`
        : 'Across my communities';
    default:
      return 'Communities';
  }
}

/**
 * The one-line description of a membership state, for a pill or a screen reader.
 *
 * §8 requires Member, Interested, Following and Discovering to be visually
 * distinguishable; §59 requires the distinction to survive a screen reader, and
 * a colour cannot. These strings are what a screen reader announces.
 */
export function membershipStateLabel(state: CommunityMembership['state']): string {
  switch (state) {
    case 'Member':
      return 'Member';
    case 'VerifiedMember':
      return 'Verified member';
    case 'Interested':
      return 'Interested';
    case 'Following':
      return 'Following';
    case 'PendingApproval':
      return 'Awaiting approval';
    case 'Discovering':
      return 'Viewing';
    case 'Declined':
      return 'Application declined';
    case 'Revoked':
      return 'Membership ended by the community';
    case 'Left':
      return 'You left this community';
    case 'None':
    default:
      return 'Not a member';
  }
}
