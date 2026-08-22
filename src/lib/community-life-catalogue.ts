// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Community Life catalogue (event categories, org types)
//
// **This module exists because the client and the server were speaking two
// different vocabularies, and nothing was checking.**
//
// `src/types/community-life.ts` declares `EventCategory` as twenty-eight
// *display strings with spaces* — `'Naming Ceremony'`, `'Football Match'`,
// `'Independence Celebration'` — and `OrgCategory` as eighteen more
// (`'Churches'`, `'Student Associations'`, `'NGOs'`). Neither is what the
// backend stores. Both catalogues are **seeded entity tables**, keyed on a
// normalized lower-kebab string:
//
//   * `CommunityLife/Infrastructure/Catalog/DefaultEventCategoryContributor.cs`
//     seeds seventeen event-category keys.
//   * `CommunityLife/Infrastructure/Catalog/DefaultOrganizationTypeContributor.cs`
//     seeds fourteen organization-type keys.
//
// The two vocabularies are **not derivable from one another by casing**. The
// server does normalize what it is given —
// `Organization.NormalizeKey` (`Domain/Organizations/Organization.cs:1258`) is
// `Trim().ToLowerInvariant().Replace(' ', '-')` — which means exactly six of
// the twenty-eight display categories land on a real key by accident
// (`Wedding`→`wedding`, `Naming Ceremony`→`naming-ceremony`, `Networking`,
// `Career Fair`, `Workshop`, `Other`) and the other twenty-two land on nothing.
// On the organization side only `Other` survives the accident; even
// `'Sports Clubs'` misses, because the seeded key is singular `sports-club`.
//
// What happened to a value the server could not match depended on the route,
// and this platform does both things:
//
//   * **A write refuses.** `CommunityLifeCatalogResolver.RequireCategoryAsync`
//     (`Application/Services/CommunityLifeCatalogResolver.cs`) returns
//     `EventCategoryNotFound`, an `Error.NotFound`, which `PlatformResults`
//     renders as **404**. Nothing is filed under a default; the create is
//     rejected outright.
//   * **A read empties.** The browse filter normalizes each key and applies
//     `keys.Contains(communityEvent.CategoryKey)`
//     (`Persistence/Repositories/CommunityEventRepository.cs:594`), so an
//     unrecognised category is a predicate that matches nothing: **200 with an
//     empty page and no error**. A member filtering by "Basketball" saw "no
//     events" rather than "that filter is not a thing here".
//
// So the tables below are written out from *both* sides' source rather than
// computed, with `'other'` as the fallback — which is a real seeded key and not
// a sentinel. **A guessed slug would be refused by the server**, which is the
// failure this module exists to prevent.
//
// Several display categories collapse onto one key (`Football Match` and
// `Basketball` are both `sports`), and three seeded keys — `religious-festival`,
// `funeral`, `support-session` — have no display category pointing at them at
// all. That is a genuine loss of expressiveness on the client's side and it is
// recorded here rather than papered over; `fetchCommunityLifeCatalogue()` below
// is the way out of it, because a picker built from the live catalogue offers
// what the deployment actually has instead of what this file guessed in 2026.
//
// **Prefer the live catalogue over these tables.** They exist so that a screen
// that has not yet been converted still sends a key the server can resolve; a
// screen being written now should read `GET /community-life/catalogue` and
// render the keys it returns.
//
// NOTE ON DUPLICATION: `src/lib/community-programme-api.ts` carries its own copy
// of the event-category table for the series surface. The two agree, and this
// module is the canonical one; collapsing that copy onto this module is a
// follow-up that was left alone here only because that file was being edited
// concurrently.
// ─────────────────────────────────────────────────────────────────────────────

import { apiClient } from './apiClient';
import { toFinancialError } from './financial-errors';
import type { EventCategory, OrgCategory } from '@/types/community-life';

const ROOT = '/community-life';

// ── The seeded key sets ──────────────────────────────────────────────────────

/**
 * The seventeen event-category keys `DefaultEventCategoryContributor` seeds.
 *
 * A union rather than a bare `string` so that a typo in a call site is a
 * compile error rather than a 404 a member discovers.
 */
export type EventCategoryKey =
  | 'worship-service'
  | 'religious-festival'
  | 'cultural-celebration'
  | 'naming-ceremony'
  | 'wedding'
  | 'funeral'
  | 'community-meeting'
  | 'fundraiser'
  | 'workshop'
  | 'networking'
  | 'career-fair'
  | 'market'
  | 'sports'
  | 'student-event'
  | 'volunteering'
  | 'support-session'
  | 'other';

/** The fourteen keys `DefaultOrganizationTypeContributor` seeds. */
export type OrganizationTypeKey =
  | 'place-of-worship'
  | 'hometown-association'
  | 'cultural-association'
  | 'student-society'
  | 'womens-group'
  | 'youth-group'
  | 'charity'
  | 'support-group'
  | 'business-network'
  | 'professional-body'
  | 'sports-club'
  | 'school'
  | 'media'
  | 'other';

/**
 * The seeded display names, straight from the contributor.
 *
 * Only a fallback: a deployment may rename a category without a release, which
 * is the entire reason the catalogue is a table. Render
 * `fetchCommunityLifeCatalogue()`'s `name` when you have it.
 */
export const SEEDED_EVENT_CATEGORY_NAMES: Record<EventCategoryKey, string> = {
  'worship-service': 'Worship service',
  'religious-festival': 'Religious festival',
  'cultural-celebration': 'Cultural celebration',
  'naming-ceremony': 'Naming ceremony',
  wedding: 'Wedding',
  funeral: 'Funeral or memorial',
  'community-meeting': 'Community meeting',
  fundraiser: 'Fundraiser',
  workshop: 'Workshop or training',
  networking: 'Networking',
  'career-fair': 'Career fair',
  market: 'Market or bazaar',
  sports: 'Sport',
  'student-event': 'Student event',
  volunteering: 'Volunteering',
  'support-session': 'Support session',
  other: 'Other',
};

/** See {@link SEEDED_EVENT_CATEGORY_NAMES}. */
export const SEEDED_ORGANIZATION_TYPE_NAMES: Record<OrganizationTypeKey, string> = {
  'place-of-worship': 'Place of worship',
  'hometown-association': 'Hometown association',
  'cultural-association': 'Cultural association',
  'student-society': 'Student society',
  'womens-group': "Women's group",
  'youth-group': 'Youth group',
  charity: 'Charity',
  'support-group': 'Support group',
  'business-network': 'Business network',
  'professional-body': 'Professional body',
  'sports-club': 'Sports club',
  school: 'School',
  media: 'Media',
  other: 'Other',
};

// ── The translation ──────────────────────────────────────────────────────────

/**
 * Every client display category → the catalogue key it means.
 *
 * `Record<EventCategory, …>` rather than `Record<string, …>` deliberately:
 * **total by construction**. Adding a twenty-ninth display category to the
 * union without deciding which server key it files under is now a type error,
 * not a silent `'other'`.
 */
const EVENT_CATEGORY_KEYS: Record<EventCategory, EventCategoryKey> = {
  Wedding: 'wedding',
  'Naming Ceremony': 'naming-ceremony',
  // No `birthday` key exists. A birthday party is a family celebration, and
  // `cultural-celebration` is the nearest shelf the catalogue has.
  Birthday: 'cultural-celebration',
  Graduation: 'student-event',
  'Football Match': 'sports',
  Basketball: 'sports',
  Concert: 'cultural-celebration',
  'Comedy Show': 'cultural-celebration',
  Networking: 'networking',
  'Career Fair': 'career-fair',
  'Job Fair': 'career-fair',
  'Business Seminar': 'workshop',
  Conference: 'workshop',
  Training: 'workshop',
  Workshop: 'workshop',
  // The catalogue draws the line at "a regular service" rather than at a faith,
  // which is why four devotional display categories share one key.
  'Church Program': 'worship-service',
  'Mosque Event': 'worship-service',
  'Bible Study': 'worship-service',
  'Prayer Meeting': 'worship-service',
  'Youth Program': 'community-meeting',
  'Cultural Festival': 'cultural-celebration',
  'Independence Celebration': 'cultural-celebration',
  'Food Festival': 'market',
  Picnic: 'community-meeting',
  'Volunteer Activity': 'volunteering',
  'Charity Event': 'fundraiser',
  'Embassy Event': 'community-meeting',
  'Student Orientation': 'student-event',
  Other: 'other',
};

/**
 * Every client organization category → the seeded organization-type key.
 *
 * Note `'Embassies'`, `'Doctors'`, `'Lawyers'`, `'Accountants'`,
 * `'Immigration Consultants'` and `'Restaurants'` — the catalogue has no
 * professional-practice or hospitality type at all, because B12's organization
 * table is for *community* organizations and a law firm is a provider, not a
 * community. They land on `other` rather than on a slug that does not exist.
 */
const ORGANIZATION_TYPE_KEYS: Record<OrgCategory, OrganizationTypeKey> = {
  Churches: 'place-of-worship',
  Mosques: 'place-of-worship',
  Associations: 'hometown-association',
  Embassies: 'other',
  'Student Associations': 'student-society',
  'Professional Associations': 'professional-body',
  'Community Centres': 'hometown-association',
  NGOs: 'charity',
  Doctors: 'other',
  Lawyers: 'other',
  Accountants: 'other',
  'Immigration Consultants': 'other',
  'Cultural Organizations': 'cultural-association',
  // Seeded key is singular. `'Sports Clubs'.toLowerCase().replace(' ', '-')` is
  // `sports-clubs`, which is *not* a key — the near miss this table exists for.
  'Sports Clubs': 'sports-club',
  'Business Associations': 'business-network',
  'Volunteer Organizations': 'charity',
  Restaurants: 'other',
  Other: 'other',
};

/**
 * The catalogue key a client display category means.
 *
 * Accepts a loose `string` because several call sites hold a value that came
 * back off the wire and is only nominally an `EventCategory`. Anything the
 * table does not know becomes `'other'` — a real key the server resolves —
 * rather than a normalized guess the server would refuse.
 */
export function toEventCategoryKey(category: string | undefined | null): EventCategoryKey {
  if (!category) return 'other';
  if (category in EVENT_CATEGORY_KEYS) {
    return EVENT_CATEGORY_KEYS[category as EventCategory];
  }
  // It may already be a key — a value round-tripped from the server, or one a
  // catalogue-driven picker chose. Accept it rather than flattening it.
  if (category in SEEDED_EVENT_CATEGORY_NAMES) {
    return category as EventCategoryKey;
  }
  return 'other';
}

/** See {@link toEventCategoryKey}. */
export function toOrganizationTypeKey(category: string | undefined | null): OrganizationTypeKey {
  if (!category) return 'other';
  if (category in ORGANIZATION_TYPE_KEYS) {
    return ORGANIZATION_TYPE_KEYS[category as OrgCategory];
  }
  if (category in SEEDED_ORGANIZATION_TYPE_NAMES) {
    return category as OrganizationTypeKey;
  }
  return 'other';
}

/**
 * A catalogue key back to a client display category.
 *
 * **Lossy, and it has to be.** `sports` came from either `Football Match` or
 * `Basketball` and the key does not remember which; the first display category
 * that maps to the key wins, deterministically. The three keys no display
 * category claims (`religious-festival`, `funeral`, `support-session`) come back
 * as `'Other'`, which is honest — the client has no word for them — and is the
 * clearest argument for building pickers off the live catalogue instead.
 */
export function toEventCategory(categoryKey: string | undefined | null): EventCategory {
  if (!categoryKey) return 'Other';
  for (const [category, key] of Object.entries(EVENT_CATEGORY_KEYS)) {
    if (key === categoryKey) return category as EventCategory;
  }
  return 'Other';
}

/** See {@link toEventCategory}. */
export function toOrgCategory(typeKey: string | undefined | null): OrgCategory {
  if (!typeKey) return 'Other';
  for (const [category, key] of Object.entries(ORGANIZATION_TYPE_KEYS)) {
    if (key === typeKey) return category as OrgCategory;
  }
  return 'Other';
}

// ── The live catalogue ───────────────────────────────────────────────────────

/** One entry of `EventCategoryResponse`. */
export interface EventCategoryOption {
  key: string;
  name: string;
  description?: string | null;
  iconName?: string | null;
  groupName?: string | null;
  /** `religious`, `cultural`, `business`, `student`, `family`, `sport`, `volunteer`. */
  facets: string[];
  order: number;
  /**
   * Whether events of this kind take responses by default. A workshop does; a
   * Sunday service does not, and defaulting the wrong way would put a barrier
   * between a newcomer and a church door.
   */
  defaultsToRsvp: boolean;
  eventCount: number;
}

/** One entry of `OrganizationTypeResponse`. */
export interface OrganizationTypeOption {
  key: string;
  name: string;
  description?: string | null;
  iconName?: string | null;
  groupName?: string | null;
  order: number;
  /** A prompt the client renders. Never a rule that blocks publication. */
  encouragesVerification: boolean;
  organizationCount: number;
}

export interface CommunityLifeCatalogue {
  organizationTypes: OrganizationTypeOption[];
  eventCategories: EventCategoryOption[];
  /** The facet names in use across the live categories. What a filter bar renders. */
  facets: string[];
}

export const communityLifeCatalogueKeys = {
  catalogue: (includeRetired?: boolean) =>
    ['community-life', 'catalogue', includeRetired ?? false] as const,
};

/**
 * The organization types, event categories and facets a deployment actually has.
 *
 * `GET /community-life/catalogue`, anonymous
 * (`Api/CommunityLifeCatalogEndpoints.cs:26`). One call, because a creation
 * wizard needs both pickers before it can render either.
 *
 * `includeRetired` is off by default and should stay off for a create form: a
 * retired category resolves for an event already filed under it and is refused
 * for a new one, so offering it would be offering a choice the server rejects.
 * An *editor* screen passes `true`, so a page filed under a retired category
 * still renders its name instead of a blank.
 */
export async function fetchCommunityLifeCatalogue(
  includeRetired = false
): Promise<CommunityLifeCatalogue> {
  try {
    const response = await apiClient.get<{ data: Partial<CommunityLifeCatalogue> }>(
      `${ROOT}/catalogue`,
      { params: includeRetired ? { includeRetired: true } : undefined }
    );
    const data = response.data?.data ?? {};
    return {
      organizationTypes: data.organizationTypes ?? [],
      eventCategories: data.eventCategories ?? [],
      facets: data.facets ?? [],
    };
  } catch (cause) {
    throw toFinancialError(cause, 'read');
  }
}
