// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — the creator workspace's content list
//
// ── What this replaces ───────────────────────────────────────────────────────
//
// `store/content-management.ts` opened seeded with `mockCreatorContent`, so
// every member saw the same seven items and was told they were theirs. That was
// removed, and the store was left deliberately empty with a sentence saying so:
//
//   > Diaspora cannot list your published content yet — no route serves a
//   > creator's own items.
//
// The store's own header then named the honest fix: *"Building the workspace
// properly means either building the fan-out over the `/mine` routes with only
// the fields those routes actually carry, or a real unified route."*
//
// This is that fan-out. Four routes, all live, all verified against a running
// deployment:
//
//   GET /guides/mine                  every guide the member wrote, any state
//   GET /marketplace/listings/mine    403 until they have a seller profile
//   GET /housing/listings/mine        403 until they have a landlord profile
//   GET /community-life/events/mine   events they organise
//
// ── The 403 is not an error ──────────────────────────────────────────────────
//
// Marketplace and Housing refuse with `Platform.Auth.Forbidden` until the member
// has a seller or landlord profile, and Jobs refuses until they have an employer
// one. That is **not a failure to report** — it is the answer "you have not
// started selling", and rendering it as an error would tell a guide author that
// something is broken because they have never listed a sofa.
//
// So each source resolves to one of four outcomes, and the caller can tell them
// apart:
//
//   `listed`      the route answered; `items` is what it returned, empty or not
//   `notEnrolled` 403 — the member has no profile in that vertical yet
//   `failed`      anything else, with the reason
//   `skipped`     not asked for
//
// A workspace that shows guides and says "you have not set up a seller profile"
// is a true screen. One that shows an empty list is not, and one that shows an
// error is worse.
//
// ── What is deliberately absent ──────────────────────────────────────────────
//
// **The health score is applied, not invented.** This paragraph used to read
// *"nothing on the platform computes any of the three … a number invented in
// this file is the same fabrication that was removed from the store, moved one
// layer down"*. That warning was right and still binds — which is why the rule
// is **not** in this repository. BG-08 settled what health means (completeness,
// and deliberately not freshness or engagement) and the platform publishes it at
// `GET /creators/content-health/rubric`; `lib/creator/health.ts` applies it to
// the rows below and holds no fallback of its own. When the platform serves no
// rubric the fields stay undefined and `ContentCard` still renders
// "Not measured".
//
// **No cross-domain engagement.** `messagesCount`, `unreadMessagesCount` and
// `offersCount` are only set where the source route carries them. Marketplace
// cards carry `viewCount` and `saveCount`; guide cards carry `views`,
// `commentCount` and `bookmarkCount`; events carry neither. Absent stays absent.
// ─────────────────────────────────────────────────────────────────────────────

import axios from 'axios';

import { apiClient } from '../apiClient';
import { readPage } from '../platform-envelope';
import { assessAll, fetchHealthRubric } from './health';
import type {
  ContentStatus,
  ContentType,
  UnifiedContentItem,
} from '@/types/creator';

/** Which vertical a row came from. */
export type WorkspaceSourceKey = 'guides' | 'marketplace' | 'housing' | 'events' | 'providers';

export type WorkspaceSourceOutcome = 'listed' | 'notEnrolled' | 'failed' | 'skipped';

export interface WorkspaceSource {
  key: WorkspaceSourceKey;
  outcome: WorkspaceSourceOutcome;
  count: number;
  /** Why, when the outcome is `failed`. Safe to render. */
  reason: string | null;
  /** What the member would do about a `notEnrolled`, when there is somewhere to go. */
  enrolRoute: string | null;
}

export interface WorkspaceContent {
  items: UnifiedContentItem[];
  sources: WorkspaceSource[];
  /** True when not one source answered — the only state that is really "unknown". */
  isUnavailable: boolean;
}

const ENROL_ROUTE: Record<WorkspaceSourceKey, string | null> = {
  guides: null,
  marketplace: '/marketplace/create',
  housing: '/housing/create',
  events: null,
  providers: '/(tabs)/post',
};

const ENROL_LABEL: Record<WorkspaceSourceKey, string> = {
  guides: 'guides',
  marketplace: 'a seller profile',
  housing: 'a landlord profile',
  events: 'events',
  providers: 'a business',
};

/** Reads a `/mine` route, turning the vertical's "you are not one of those" into a state. */
async function readSource<T>(
  key: WorkspaceSourceKey,
  path: string,
  params: Record<string, unknown>
): Promise<{ source: WorkspaceSource; rows: T[] }> {
  try {
    const response = await apiClient.get(path, { params });
    const page = readPage<T>(response.data);
    return {
      rows: page.items,
      source: { key, outcome: 'listed', count: page.items.length, reason: null, enrolRoute: null },
    };
  } catch (cause) {
    const status = axios.isAxiosError(cause) ? cause.response?.status : undefined;

    // 403 means "you have no profile in this vertical", not "this broke". 404
    // is read the same way: the employer dashboard answers `jobs.employer.not-found`
    // for a member who has never registered one.
    if (status === 403 || status === 404) {
      return {
        rows: [],
        source: {
          key,
          outcome: 'notEnrolled',
          count: 0,
          reason: `You have not set up ${ENROL_LABEL[key]} yet.`,
          enrolRoute: ENROL_ROUTE[key],
        },
      };
    }

    const detail = axios.isAxiosError(cause)
      ? ((cause.response?.data as { detail?: string } | undefined)?.detail ?? cause.message)
      : String(cause);

    return {
      rows: [],
      source: { key, outcome: 'failed', count: 0, reason: detail, enrolRoute: null },
    };
  }
}

// ── Row shapes, narrowed to the fields the routes actually send ──────────────

interface GuideRow {
  guideId: string;
  title?: string | null;
  summary?: string | null;
  status?: string | null;
  categoryKey?: string | null;
  cityName?: string | null;
  countryCode?: string | null;
  publishedAt?: string | null;
  updatedAt?: string | null;
  readingTimeMinutes?: number | null;
  heroMediaId?: string | null;
  tags?: string[] | null;
  views?: number | null;
  helpfulCount?: number | null;
  commentCount?: number | null;
  bookmarkCount?: number | null;
}

interface ListingRow {
  listingId: string;
  title?: string | null;
  summary?: string | null;
  status?: string | null;
  categoryKey?: string | null;
  coverMediaId?: string | null;
  tags?: string[] | null;
  publishedAt?: string | null;
  viewCount?: number | null;
  saveCount?: number | null;
  price?: { amount?: number | null; currency?: string | null } | null;
  location?: { cityName?: string | null; regionName?: string | null } | null;
}

interface ProviderRow {
  providerId?: string;
  name?: string | null;
  description?: string | null;
  status?: string | null;
  category?: { name?: string | null } | null;
  coverMedia?: { mediaId?: string | null } | null;
  location?: { cityName?: string | null } | null;
  publishedAt?: string | null;
  createdAt?: string | null;
}

interface HousingRow {
  listingId?: string;
  id?: string;
  title?: string | null;
  summary?: string | null;
  status?: string | null;
  accommodationTypeKey?: string | null;
  coverMediaId?: string | null;
  publishedAt?: string | null;
  viewCount?: number | null;
  saveCount?: number | null;
  rent?: { amount?: number | null; currency?: string | null } | null;
  location?: { cityName?: string | null; neighbourhood?: string | null } | null;
}

interface EventRow {
  eventId?: string;
  id?: string;
  title?: string | null;
  summary?: string | null;
  status?: string | null;
  startsAt?: string | null;
  updatedAt?: string | null;
  coverMediaId?: string | null;
  cityName?: string | null;
  attendeeCount?: number | null;
}

/**
 * The server's per-module status words, in the client's `ContentStatus` union.
 *
 * Only members the platform actually returns are mapped. Anything unrecognised
 * falls through to the literal server word rather than to a guess — a status the
 * client has never seen should read as itself, not as "Published".
 */
function toStatus(raw: string | null | undefined, fallback: ContentStatus): ContentStatus {
  const value = (raw ?? '').toLowerCase();
  switch (value) {
    case 'published':
    case 'active':
      return 'Published';
    case 'draft':
      return 'Draft';
    case 'archived':
      return 'Archived';
    case 'sold':
      return 'Sold';
    case 'rented':
    case 'occupied':
      return 'Rented';
    case 'expired':
      return 'Expired';
    default:
      return raw ? (raw as ContentStatus) : fallback;
  }
}

/** A date the cards render. Absent stays absent rather than becoming "today". */
function toDisplayDate(value: string | null | undefined): string {
  if (!value) return '';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? ''
    : parsed.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * The shared parts of a workspace row.
 *
 * `publishingIdentity` is the member's own and is filled by the caller, which is
 * the only place that knows it. It is **not** invented here: an earlier version
 * of the store hard-coded a name, a handle, an avatar and a verification tick,
 * and a claim about identity is worse than a wrong number.
 */
function baseItem(
  id: string,
  contentType: ContentType,
  title: string,
  status: ContentStatus,
  identity: UnifiedContentItem['publishingIdentity']
): UnifiedContentItem {
  return {
    id,
    title,
    contentType,
    currentStatus: status,
    createdDate: '',
    lastUpdated: '',
    views: 0,
    bookmarks: 0,
    commentsCount: 0,
    // Conversations are keyed to a listing, not carried on its card. Left at
    // zero rather than guessed, and the card does not claim a count it has not
    // been given.
    messagesCount: 0,
    unreadMessagesCount: 0,
    publishingIdentity: identity,
  };
}

/**
 * Everything the member has authored, across every vertical that will say.
 *
 * `Promise.allSettled` rather than `Promise.all`: one vertical being down must
 * not empty the other three, which is the behaviour that turns a partial outage
 * into "you have published nothing".
 */
export async function fetchWorkspaceContent(
  identity: UnifiedContentItem['publishingIdentity'],
  options: { limit?: number } = {}
): Promise<WorkspaceContent> {
  const limit = options.limit ?? 50;

  // BG-08. The rubric rides along with the four content reads rather than after
  // them: it is a fifth independent request and serialising it would add a round
  // trip to every workspace load for a document that never changes within one.
  //
  // `fetchHealthRubric` resolves to null rather than rejecting, so a deployment
  // that has not shipped BG-08 — or a request that failed — leaves the health
  // fields undefined and the cards go on reading "Health not measured". It is
  // deliberately not in the `Promise.all` failure path for that reason.
  const [guides, listings, housing, events, rubric, providers] = await Promise.all([
    readSource<GuideRow>('guides', '/guides/mine', { limit }),
    readSource<ListingRow>('marketplace', '/marketplace/listings/mine', { limit }),
    readSource<HousingRow>('housing', '/housing/listings/mine', { limit }),
    readSource<EventRow>('events', '/community-life/events/mine', { limit }),
    fetchHealthRubric(),
    readSource<ProviderRow>('providers', '/providers/me', { limit }),
  ]);

  const items: UnifiedContentItem[] = [];

  for (const row of guides.rows) {
    if (!row?.guideId) continue;
    const item = baseItem(
      row.guideId,
      'Guide',
      row.title ?? 'Untitled guide',
      toStatus(row.status, 'Draft'),
      identity
    );
    item.createdDate = toDisplayDate(row.publishedAt);
    item.lastUpdated = toDisplayDate(row.updatedAt ?? row.publishedAt);
    item.views = row.views ?? 0;
    item.bookmarks = row.bookmarkCount ?? 0;
    item.commentsCount = row.commentCount ?? 0;
    item.helpfulVotes = row.helpfulCount ?? undefined;
    item.readingTime = row.readingTimeMinutes ? `${row.readingTimeMinutes} min` : undefined;
    item.thumbnail = row.heroMediaId ?? undefined;
    item.summary = row.summary ?? undefined;
    item.category = row.categoryKey ?? undefined;
    item.location = row.cityName ?? row.countryCode ?? undefined;
    item.tags = row.tags ?? undefined;
    items.push(item);
  }

  for (const row of listings.rows) {
    if (!row?.listingId) continue;
    const item = baseItem(
      row.listingId,
      'Marketplace',
      row.title ?? 'Untitled listing',
      toStatus(row.status, 'Available'),
      identity
    );
    item.createdDate = toDisplayDate(row.publishedAt);
    item.lastUpdated = toDisplayDate(row.publishedAt);
    item.views = row.viewCount ?? 0;
    item.bookmarks = row.saveCount ?? 0;
    item.thumbnail = row.coverMediaId ?? undefined;
    item.summary = row.summary ?? undefined;
    item.category = row.categoryKey ?? undefined;
    item.location = row.location?.cityName ?? row.location?.regionName ?? undefined;
    item.tags = row.tags ?? undefined;
    item.price =
      typeof row.price?.amount === 'number'
        ? `${row.price.currency ?? ''} ${row.price.amount}`.trim()
        : undefined;
    items.push(item);
  }

  for (const row of housing.rows) {
    const id = row?.listingId ?? row?.id;
    if (!id) continue;
    const item = baseItem(
      id,
      'Housing',
      row.title ?? 'Untitled property',
      toStatus(row.status, 'Available'),
      identity
    );
    item.createdDate = toDisplayDate(row.publishedAt);
    item.lastUpdated = toDisplayDate(row.publishedAt);
    item.views = row.viewCount ?? 0;
    item.bookmarks = row.saveCount ?? 0;
    item.thumbnail = row.coverMediaId ?? undefined;
    item.summary = row.summary ?? undefined;
    item.category = row.accommodationTypeKey ?? undefined;
    item.location = row.location?.cityName ?? row.location?.neighbourhood ?? undefined;
    item.price =
      typeof row.rent?.amount === 'number'
        ? `${row.rent.currency ?? ''} ${row.rent.amount}`.trim()
        : undefined;
    items.push(item);
  }

  // Businesses, since 14 Oct 2026. Creator Studio read four verticals and not
  // this one, so a member's business never appeared here: not to edit, not as a
  // draft, and a "delete" could only ever have touched something else.
  for (const row of providers.rows) {
    if (!row?.providerId || row.status === 'Archived') continue;
    const item = baseItem(
      row.providerId,
      'Provider',
      row.name ?? 'Untitled business',
      toStatus(row.status, 'Draft'),
      identity
    );
    item.createdDate = toDisplayDate(row.publishedAt ?? row.createdAt);
    item.lastUpdated = toDisplayDate(row.publishedAt ?? row.createdAt);
    item.thumbnail = row.coverMedia?.mediaId ?? undefined;
    item.summary = row.description ?? undefined;
    item.category = row.category?.name ?? undefined;
    item.location = row.location?.cityName ?? undefined;
    items.push(item);
  }

  for (const row of events.rows) {
    const id = row?.eventId ?? row?.id;
    if (!id) continue;
    const item = baseItem(
      id,
      'Event',
      row.title ?? 'Untitled event',
      toStatus(row.status, 'Published'),
      identity
    );
    item.createdDate = toDisplayDate(row.startsAt);
    item.lastUpdated = toDisplayDate(row.updatedAt ?? row.startsAt);
    item.thumbnail = row.coverMediaId ?? undefined;
    item.summary = row.summary ?? undefined;
    item.location = row.cityName ?? undefined;
    items.push(item);
  }

  const sources = [guides.source, listings.source, housing.source, events.source, providers.source];

  return {
    // Scored against the platform's published rule, or returned untouched when
    // it served none. `lib/creator/health.ts` holds no fallback rubric — an
    // invented rule is the fabrication this whole fan-out was written to remove.
    items: assessAll(items, rubric),
    sources,
    // "Unavailable" is reserved for the case where nothing answered at all. A
    // member who has simply published nothing gets an empty list and the
    // ordinary empty state, which is a different and true sentence.
    isUnavailable: sources.every((source) => source.outcome === 'failed'),
  };
}

/**
 * The archive, read the same way.
 *
 * A separate call rather than a filter over the list above, because each module
 * pages its own `/mine` route and an archived item can fall off the first page
 * of a busy author's list. `status=Archived` is bound by all three listing
 * routes; the events route takes no status filter and is not asked.
 */
export async function fetchWorkspaceArchive(
  identity: UnifiedContentItem['publishingIdentity'],
  options: { limit?: number } = {}
): Promise<WorkspaceContent> {
  const limit = options.limit ?? 50;

  const [guides, listings, housing, providers] = await Promise.all([
    readSource<GuideRow>('guides', '/guides/mine', { limit, status: 'Archived' }),
    readSource<ListingRow>('marketplace', '/marketplace/listings/mine', { limit, status: 'Archived' }),
    readSource<HousingRow>('housing', '/housing/listings/mine', { limit, status: 'Archived' }),
    // `/providers/me` takes no status filter; the archived ones are picked out below.
    readSource<ProviderRow>('providers', '/providers/me', { limit }),
  ]);

  const items: UnifiedContentItem[] = [];

  for (const row of guides.rows) {
    if (!row?.guideId) continue;
    const item = baseItem(row.guideId, 'Guide', row.title ?? 'Untitled guide', 'Archived', identity);
    item.lastUpdated = toDisplayDate(row.updatedAt ?? row.publishedAt);
    items.push(item);
  }
  for (const row of listings.rows) {
    if (!row?.listingId) continue;
    const item = baseItem(row.listingId, 'Marketplace', row.title ?? 'Untitled listing', 'Archived', identity);
    item.lastUpdated = toDisplayDate(row.publishedAt);
    items.push(item);
  }
  for (const row of housing.rows) {
    const id = row?.listingId ?? row?.id;
    if (!id) continue;
    const item = baseItem(id, 'Housing', row.title ?? 'Untitled property', 'Archived', identity);
    item.lastUpdated = toDisplayDate(row.publishedAt);
    items.push(item);
  }

  for (const row of providers.rows) {
    if (!row?.providerId || row.status !== 'Archived') continue;
    const item = baseItem(row.providerId, 'Provider', row.name ?? 'Untitled business', 'Archived', identity);
    item.lastUpdated = toDisplayDate(row.publishedAt ?? row.createdAt);
    items.push(item);
  }

  const sources = [guides.source, listings.source, housing.source, providers.source];
  return { items, sources, isUnavailable: sources.every((s) => s.outcome === 'failed') };
}

/**
 * One sentence naming the verticals that did not answer, or null when they all did.
 *
 * The workspace renders this instead of the old blanket "Diaspora cannot list
 * your published content yet", which was a claim about the platform. This is a
 * claim about *this member's* accounts, which is what the 403 actually says.
 */
export function workspaceCoverageNote(sources: WorkspaceSource[]): string | null {
  const notEnrolled = sources.filter((s) => s.outcome === 'notEnrolled');
  const failed = sources.filter((s) => s.outcome === 'failed');

  if (!notEnrolled.length && !failed.length) return null;

  const parts: string[] = [];
  if (notEnrolled.length) {
    parts.push(
      `Not shown: ${notEnrolled.map((s) => ENROL_LABEL[s.key]).join(' and ')} — you have not set ${notEnrolled.length > 1 ? 'those' : 'that'} up.`
    );
  }
  if (failed.length) {
    parts.push(`${failed.map((s) => s.key).join(' and ')} could not be loaded just now.`);
  }
  return parts.join(' ');
}
