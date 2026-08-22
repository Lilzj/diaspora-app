// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — the creator's own activity history
//
// ── What this replaces ───────────────────────────────────────────────────────
//
// `store/creator-timeline.ts` opened seeded with `mockTimelineEvents`, so every
// member who flipped the Timeline Log toggle read an invented history of their
// own account — a guide published on a date they published nothing, a
// verification granted, a followers milestone reached. That was removed and the
// store left empty with a sentence saying why:
//
//   > Diaspora cannot show your activity history yet — the platform records it
//   > but serves no route to read it back.
//
// The store's header was precise about the shape of the gap:
//
//   > `CreatorActivityEntry` exists in the Creator module as a domain entity,
//   > with a repository and event consumers that write to it — and **no HTTP
//   > surface at all** … Wiring this store is one route away.
//
// That route landed (BG-06). `GET /creators/me/activity` is cursor-paged,
// newest first, and this is the client for it.
//
// ── The two things the response separates, and why it matters ────────────────
//
// `isCreator` rides alongside the items for the same reason
// `/providers/me/reviews` carries `providerId`: **"you have not started
// publishing" and "nothing recognised yet" are different sentences**, and an
// empty array cannot tell them apart. A member who has never published should
// read an invitation; a member who has published and sees nothing is looking at
// a defect.
//
// ── Attribution, and why the history was thinner than it should have been ────
//
// Until BG-10 this route would have under-reported for anybody who sold, let or
// hired: `ListingPublishedCreatorConsumer`, `JobPublishedCreatorConsumer` and
// `HousingPublishedCreatorConsumer` each passed a *profile* identifier where a
// member belongs, so those publications were credited to a seller, landlord or
// employer profile and never appeared in the member's own history. Fixed at the
// three consumers and repaired in place by `RepairCreatorActivityAttribution`.
// This client needed no change for it — which is the point of fixing it at the
// source.
// ─────────────────────────────────────────────────────────────────────────────

import { apiClient } from '../apiClient';
import type { CreatorTimelineEvent, ContentType, TimelineEventType } from '@/types/creator';

/**
 * The same day/month/year the workspace cards use, so one screen does not show
 * two date formats. Empty for an unparseable value rather than the raw string —
 * a member reading their own history should not meet an ISO instant.
 */
function toDisplayDate(value: string | null | undefined): string {
  if (!value) return '';

  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime())
    ? ''
    : parsed.toLocaleDateString(undefined, {
      day: 'numeric', month: 'short', year: 'numeric',
    });
}

export interface CreatorActivityPage {
  events: CreatorTimelineEvent[];
  nextCursor: string | null;
  hasMore: boolean;
  /**
   * Whether the platform recognises this member as a creator at all.
   *
   * `false` with an empty list means "you have not started publishing".
   * `true` with an empty list means "nothing you have done is recognised yet".
   * The screen says different things for each.
   */
  isCreator: boolean;
}

/**
 * `CreatorActivityTypes` on the server, mapped to the timeline's own vocabulary.
 *
 * Every publication action becomes `published`. The distinction the timeline
 * draws is *what happened*, and the row already carries the subject type, so
 * seven separate publication kinds would be seven labels for one event.
 */
const EVENT_TYPE: Record<string, TimelineEventType> = {
  'guide.published': 'published',
  'post.published': 'published',
  'event.published': 'published',
  'provider.published': 'published',
  'listing.published': 'published',
  'job.published': 'published',
  'housing.published': 'published',
  'guide.featured': 'milestone_achieved',
  'event.hosted': 'milestone_achieved',
  'comment.added': 'updated',
};

/** The server's subject type, mapped to the client's content vocabulary. */
const CONTENT_TYPE: Record<string, ContentType> = {
  guide: 'Guide',
  post: 'Update',
  event: 'Event',
  provider: 'Provider',
  listing: 'Marketplace',
  job: 'Job',
  housing: 'Housing',
};

/** What a member reads on the row. Derived from the action, never from a fixture. */
const TITLE: Record<string, string> = {
  'guide.published': 'Published a guide',
  'post.published': 'Posted an update',
  'event.published': 'Published an event',
  'provider.published': 'Published a business listing',
  'listing.published': 'Published a marketplace listing',
  'job.published': 'Posted a job',
  'housing.published': 'Published a property',
  'guide.featured': 'A guide was featured',
  'event.hosted': 'Hosted an event',
  'comment.added': 'Added a comment',
};

interface ActivityRow {
  id?: string;
  actionType?: string;
  subjectType?: string | null;
  subjectId?: string | null;
  occurredAt?: string;
  weight?: number;
  countryCode?: string | null;
}

/**
 * One page of the member's own history.
 *
 * **Unknown action types are kept, not dropped.** A release that adds a
 * recognised action the client has no label for should show the member that
 * something happened rather than silently shortening their history — so an
 * unmapped `actionType` renders as itself, which is ugly and honest, instead of
 * disappearing.
 */
export async function fetchCreatorActivity(
  identityName: string,
  options: { cursor?: string | null; limit?: number } = {},
): Promise<CreatorActivityPage> {
  const params: Record<string, string | number> = { limit: options.limit ?? 25 };
  if (options.cursor) params.cursor = options.cursor;

  const { data } = await apiClient.get('/creators/me/activity', { params });
  const payload = data?.data ?? data ?? {};
  const rows: ActivityRow[] = payload.items ?? [];

  return {
    isCreator: payload.isCreator === true,
    nextCursor: payload.nextCursor ?? null,
    hasMore: payload.hasMore === true,
    events: rows.map((row, index) => {
      const action = row.actionType ?? 'unknown';
      const subject = row.subjectType ?? undefined;

      return {
        // The server's own entry id where it has one, so a re-fetch does not
        // remount every row. The index is a fallback and never a fabrication.
        id: row.id ?? `activity-${index}`,
        type: EVENT_TYPE[action] ?? 'updated',
        title: TITLE[action] ?? action,

        // Deliberately empty rather than invented. The route carries the action,
        // the subject and the time; it does not carry a sentence about them, and
        // writing one here would be this module deciding what the member did.
        description: '',

        // Formatted, not passed through. The route serves a full ISO instant with
        // microseconds — `2026-08-21T14:45:01.647828+00:00` — and the timeline
        // renders `timestamp` verbatim, so the raw value reached the member. Seen
        // on a device; no test asserted the shape because none had a real one.
        timestamp: toDisplayDate(row.occurredAt),
        contentId: row.subjectId ?? undefined,
        contentType: subject ? CONTENT_TYPE[subject] : undefined,

        // The signed-in member, passed in rather than read from the row: the
        // route serves only the caller's own activity, so the identity is the
        // session's and the row has no business restating it.
        identityName,
      };
    }),
  };
}
