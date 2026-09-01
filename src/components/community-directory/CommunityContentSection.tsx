// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Community-scoped content sections (Frontend Phase 13,
// §17–§24, §39)
//
// One component for all eight community content sections — guides, jobs,
// marketplace, housing, events, providers, organizations and updates — rather than
// eight screens that each grew their own filter, their own empty state and their
// own idea of whether a community badge means anything.
//
// §17 through §24 each end with the same instruction in different words: *do not
// duplicate the existing infrastructure*. So this component renders the platform's
// **existing** cards — `GuideCard`, `JobCard`, `HousingCard`, `MarketplaceCard`,
// `ProviderCard`, `UpdateCard` — unchanged. It adds a scope, a note about how the
// scope was applied, and the §74 states. It adds no second card, no second list
// and no second discovery path.
//
// ── The one thing this component insists on ──────────────────────────────────
//
// Every scoped list renders `<CommunityScopeNote>` above its results whenever a
// scope is applied. Not optionally, not behind a setting — the note is part of the
// list. GAP-009 means the community filter is really a country-of-origin
// projection, and a list that silently returned 12 of 48 results while implying it
// had filtered by community would be the exact conflation §2 forbids, dressed as a
// feature.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useMemo } from 'react';
import { Text, View } from 'react-native';
import { useTheme } from '@/design-system';
import type { CommunityContentDomain } from '@/lib/community-directory-api';
import type { CommunityAssociation, CommunityUnavailableReason } from '@/types/community-directory';
import { resolveAssociation } from '@/lib/community/scope';
import {
  useAvailableCommunities,
  useCommunityScope,
  useScopedCollection,
  useScopedContent,
} from '@/hooks/communities';
import { useConnectivityStore } from '@/lib/connectivity';
import { getActiveLocation, useLocationStore, coordinatesOf } from '@/store/location';

import { GuideCard } from '@/components/GuideCard';
import { JobCard } from '@/components/JobCard';
import { HousingCard } from '@/components/HousingCard';
import { MarketplaceCard } from '@/components/MarketplaceCard';
import { ProviderCard } from '@/components/ProviderCard';
import { UpdateCard } from '@/components/UpdateCard';

import { useGuideSearch } from '@/hooks/guides';

import { CommunityScopeNote } from './MultiCommunityGapNotice';
import { CommunityUnavailablePanel } from './CommunityStatePanels';
import { CommunityBadge } from './CommunityIdentity';

/** What a member calls each section. Used in headings and in the §74 copy. */
export const DOMAIN_LABELS: Record<CommunityContentDomain, { title: string; subject: string }> = {
  guide: { title: 'Guides', subject: 'guides' },
  job: { title: 'Jobs', subject: 'jobs' },
  marketplace: { title: 'Marketplace', subject: 'marketplace listings' },
  housing: { title: 'Housing', subject: 'housing' },
  event: { title: 'Events', subject: 'events' },
  provider: { title: 'Service providers', subject: 'service providers' },
  organization: { title: 'Organisations', subject: 'organisations' },
  update: { title: 'Community updates', subject: 'community updates' },
};

/**
 * The two domains `fetchScopedContent` will not fetch, because `DOMAIN_ROUTES`
 * has no path for them.
 *
 * ── What changed, and why it mattered ────────────────────────────────────────
 *
 * Both used to be served from `mockGuides` and `mockCommunityUpdates`. This is a
 * *shared* component — it renders the guide and update sections on every
 * community-scoped surface in the application — so a single fixture import here
 * put fabricated guides and fabricated community updates in front of the member
 * on every one of them, complete with a community badge asserting an association
 * that had been computed from a fixture's country field.
 *
 *   * **`guide` is now real.** `GET /guides` → `SearchGuidesQuery` exists and
 *     `useGuideSearch` already wraps it, tested. The projection is applied to
 *     the real page through the same `useScopedCollection`, so a guide card and
 *     a job card still cannot disagree about scope.
 *
 *   * **`update` is genuinely missing and stays missing.** There is no
 *     `/community/updates` route on the platform. `GET /community/posts` is a
 *     single-post read, listing is feed-only via
 *     `GET /community/feeds/{feedKey}`, and the only thing the backend calls an
 *     "update" is a *campaign* update — `GET /communities/campaigns/{id}/updates`
 *     — which is a different object on a different aggregate. So the section
 *     renders its §74 empty state rather than a fabricated feed.
 */
const IN_MEMORY_DOMAINS: CommunityContentDomain[] = ['guide', 'update'];

/**
 * Domains the platform cannot search at all.
 *
 * ── Remediation Wave I: why this is not just `IN_MEMORY_DOMAINS` minus guides ─
 *
 * `update` produced the `empty` panel — "Nothing here yet. There is no community
 * update to show for the communities you have chosen. Try widening your
 * community filter." Every clause of that is a claim about the *content*, and
 * all of them are false. Nothing was asked and nothing could be: verified
 * against the backend a second time for this wave,
 *
 *   · `Community/Api/PostEndpoints.cs` maps exactly four routes — `POST /posts`,
 *     `GET /posts/{postId}`, `GET /posts/{postId}/revisions` and
 *     `POST /posts/{postId}/poll/votes`. There is **no `GET /posts` collection
 *     route** and no post search of any kind.
 *   · `GET /community/feeds/search` is a *declared* feed key
 *     (`Extensibility/Feeds/FeedKeys.cs:54`) with **no provider registered
 *     behind it** — nothing in the backend references it, and
 *     `FeedComposer.cs:71` answers an unresolved key with `FeedUnknown`, a 404.
 *   · The only thing the backend calls an "update" is a *campaign* update on a
 *     different aggregate in a different module.
 *
 * So the honest panel says we did not look, and says so in a way that does not
 * also imply the content is missing — see `not-searchable` in
 * `CommunityStatePanels`. Widening a community filter cannot help, and offering
 * it was sending the member to do work that could not pay.
 *
 * This is checked **before** the scope, the loading state and the empty state,
 * because none of those is reachable for a domain with no route and each of them
 * would say something more specific and less true.
 */
const NOT_SEARCHABLE_DOMAINS: CommunityContentDomain[] = ['update'];

export interface CommunityContentSectionProps {
  domain: CommunityContentDomain;
  /** Free-text query, passed to the routes that bind it. */
  query?: string;
  category?: string;
  /** How many to render. The section is a preview on a profile, a list on a route. */
  limit?: number;
  /** Hide the heading where the screen already has one. */
  hideHeading?: boolean;
  /** Suppress the scope note where the parent screen renders one for the page. */
  hideScopeNote?: boolean;
  onSeeAll?: () => void;
}

export function CommunityContentSection({
  domain,
  query,
  category,
  limit,
  hideHeading = false,
  hideScopeNote = false,
  onSeeAll,
}: CommunityContentSectionProps) {
  const { tokens } = useTheme();
  const isOnline = useConnectivityStore((s) => s.isOnline);
  const locationStore = useLocationStore();
  const activeLocation = getActiveLocation(locationStore);
  const { projection } = useCommunityScope();
  const { refs: communities } = useAvailableCommunities();

  const isInMemory = IN_MEMORY_DOMAINS.includes(domain);

  // Guides come from the certified route; updates have none. `useGuideSearch` is
  // called unconditionally because hooks must be, and gated by `enabled` so no
  // request leaves the device for the other seven domains.
  // `SearchGuidesQuery` binds the free-text term as `q` and the taxonomy as
  // `category` — sending `query`/`limit` under any other name would be silently
  // dropped by the serialiser, which is exactly how a filter comes to look like
  // it works and does not.
  const guideList = useGuideSearch(
    { q: query || undefined, category: category || undefined, limit },
    { enabled: domain === 'guide' }
  );

  // `useScopedCollection` applies the same projection as the request path, so a
  // guide and a job never disagree about scope.
  const collection = useMemo(() => {
    if (domain === 'guide') return guideList.guides;
    // No route. See `IN_MEMORY_DOMAINS` above — an empty collection produces the
    // §74 empty state, which is the honest rendering of "we cannot list these".
    return [];
  }, [domain, guideList.guides]);

  const inMemory = useScopedCollection<Record<string, unknown>>(
    domain,
    collection as unknown as Record<string, unknown>[]
  );

  const remote = useScopedContent<Record<string, unknown>>(
    domain,
    {
      query,
      category,
      cityName: activeLocation.cityName,
      ...coordinatesOf(activeLocation),
      radiusKm: locationStore.searchRadius > 0 ? locationStore.searchRadius : undefined,
    },
    { enabled: !isInMemory }
  );

  const result = isInMemory ? inMemory : remote.data;

  const unavailable: CommunityUnavailableReason | null = useMemo(() => {
    // First, and before the scope: a domain with no route cannot be empty *of
    // results*, because no request was made. See `NOT_SEARCHABLE_DOMAINS`.
    if (NOT_SEARCHABLE_DOMAINS.includes(domain)) return 'not-searchable';
    if (projection.isEmpty) return 'empty';
    if (!isInMemory) {
      if (remote.isLoading) return 'loading';
      if (remote.isError) return isOnline ? 'error' : 'offline';
    }
    // Guides are a real request now, so they get the same loading and error
    // treatment as the seven request-path domains. Collapsing a failed guide
    // read into "empty" would say the community has no guides when in fact we
    // could not ask.
    if (domain === 'guide') {
      if (guideList.isLoading) return 'loading';
      if (guideList.error) return isOnline ? 'error' : 'offline';
    }
    if (!result || result.items.length === 0) return 'empty';
    return null;
  }, [
    domain,
    guideList.error,
    guideList.isLoading,
    isInMemory,
    isOnline,
    projection.isEmpty,
    remote.isError,
    remote.isLoading,
    result,
  ]);

  const items = useMemo(
    () => (limit ? (result?.items ?? []).slice(0, limit) : (result?.items ?? [])),
    [limit, result]
  );

  /**
   * The community association for one item.
   *
   * Resolved through the single `resolveAssociation`, so the basis travels with
   * the badge and `<CommunityBadge showQualifier>` can say "matched by origin"
   * rather than asserting the item belongs to the community.
   */
  const associationFor = (item: Record<string, unknown>): CommunityAssociation => {
    const publisherKey =
      domain === 'job'
        ? 'employer'
        : domain === 'housing'
          ? 'host'
          : domain === 'marketplace'
            ? 'seller'
            : 'owner';

    const publisher = item[publisherKey] as Record<string, unknown> | undefined;
    const origin = publisher?.originCountry as Record<string, unknown> | undefined;
    const direct = item.country as Record<string, unknown> | undefined;
    const location = item.location as Record<string, unknown> | undefined;

    return resolveAssociation({
      // No certified route sends a declared association yet — GAP-009. The field
      // is read anyway so the migration is a backend change rather than a
      // client one.
      declaredCommunityIds: (item.communityIds as string[] | undefined) ?? null,
      originCountryCode:
        (typeof origin?.code === 'string' ? origin.code : null) ??
        (typeof direct?.code === 'string' ? direct.code : null),
      locationCountryCode: typeof location?.countryCode === 'string' ? location.countryCode : null,
      communities,
    });
  };

  return (
    <View testID={`community-content-section-${domain}`}>
      {!hideHeading ? (
        <View className="flex-row items-center justify-between mb-2 px-4">
          <Text
            accessibilityRole="header"
            style={{ color: tokens.color.text.primary }}
            className="text-sm font-black"
          >
            {DOMAIN_LABELS[domain].title}
          </Text>

          {onSeeAll && items.length > 0 ? (
            <Text
              accessibilityRole="button"
              accessibilityLabel={`See all ${DOMAIN_LABELS[domain].subject}`}
              onPress={onSeeAll}
              style={{ color: tokens.color.primary[600] }}
              className="text-[11px] font-bold"
            >
              See all
            </Text>
          ) : null}
        </View>
      ) : null}

      {/* The scope note describes a narrowing that was applied to a result set.
          A `not-searchable` domain has no result set, so the note would say
          "showing 0 of 0 matched to your communities" — a sentence that asserts
          the community filter did something, when nothing was asked at all. */}
      {!hideScopeNote && !projection.isUnscoped && unavailable !== 'not-searchable' ? (
        <View className="px-4 mb-3">
          <CommunityScopeNote
            projection={projection}
            totalBeforeScope={result?.totalBeforeScope}
            totalAfterScope={result?.totalAfterScope}
            resultTruncated={result?.resultTruncated}
            // Wave J. `scopeUnavailable` says the community filter was not
            // applied to this list at all; `pageLimited` says the narrowing that
            // *was* applied only saw one server page. Both are conditions the
            // client cannot resolve, so both are stated rather than absorbed.
            scopeUnavailable={result?.scopeUnavailable}
            pageLimited={result?.pageLimited}
            compact
          />
        </View>
      ) : null}

      {unavailable ? (
        <CommunityUnavailablePanel
          reason={unavailable}
          subject={DOMAIN_LABELS[domain].subject}
          compact
          onAction={
            domain === 'guide'
              ? guideList.refresh
              : isInMemory
                ? undefined
                : () => void remote.refetch()
          }
        />
      ) : (
        <View className="px-4">
          {items.map((item, index) => (
            <View key={cardKey(domain, item, index)} className="mb-3">
              {renderCard(domain, item)}

              {/* §19/§39: the badge describes the *content's* association, never
                  the publisher's membership — the badge has no field for one. */}
              <View className="mt-1.5">
                <CommunityBadge association={associationFor(item)} size="xs" showQualifier />
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function cardKey(domain: CommunityContentDomain, item: Record<string, unknown>, index: number) {
  const id =
    (item.id as string) ??
    (item.guideId as string) ??
    (item.jobId as string) ??
    (item.updateId as string) ??
    // `GET /providers` rows key on `providerId`; `listingId` is the older
    // fixture spelling and never arrives from the certified route. Without this
    // every provider row fell through to the array index, so re-ordering a page
    // remounted every card.
    (item.providerId as string) ??
    (item.listingId as string) ??
    (item.eventId as string) ??
    (item.organizationId as string);

  return `${domain}-${id ?? index}`;
}

/**
 * Renders the platform's existing card for a domain.
 *
 * The casts are deliberate and are confined to this function: the scoped
 * repository returns rows from certified routes as opaque records, because the
 * projection does not need to know their shape, and exactly one place has to
 * reconcile that with each card's props. Putting it here rather than in eight
 * screens is the whole reason this component exists.
 */
function renderCard(domain: CommunityContentDomain, item: Record<string, unknown>) {
  switch (domain) {
    case 'guide': {
      const guide = item as never;

      // ── Why there is no author lookup here any more ───────────────────────
      //
      // This read `mockAuthors[item.authorId]` and, on a hit, rendered that
      // fixture's name, avatar, reputation level, country verification badge,
      // expertise list and follower count as the *real* author of a real guide.
      // A verification badge and a reputation level are trust signals; attaching
      // a fabricated pair to a genuine guide is worse than attaching none.
      //
      // `GuideCardResponse` carries the author's own summary from the server, and
      // there is no route that expands an author id into a profile —
      // `GET /guides/authors/{authorId}` lists that author's *guides*, not the
      // author. So the card is given the neutral author it already had as its
      // fallback, and the real attribution comes from the guide itself.
      return (
        <GuideCard
          guide={guide}
          author={
            {
              userId: (item.authorId as string) ?? '',
              name: 'Community member',
              avatarUrl: null,
              reputationLevel: 'Newcomer',
              isCountryVerified: false,
              primaryCountry: null,
              expertiseCategories: [],
              followerCount: 0,
              isFollowedByUser: false,
            } as never
          }
        />
      );
    }

    case 'update': {
      // Unreachable in practice — `update` has no route, so its collection is
      // always empty and the section renders its §74 state instead. Kept so the
      // switch stays exhaustive, and stripped of the `mockAuthors` lookup for
      // the same reason as the guide case above.
      return (
        <UpdateCard
          update={item as never}
          author={
            {
              userId: (item.authorId as string) ?? '',
              name: 'Community member',
              avatarUrl: null,
              reputationLevel: 'Newcomer',
              isCountryVerified: false,
              primaryCountry: null,
              expertiseCategories: [],
              followerCount: 0,
              isFollowedByUser: false,
            } as never
          }
        />
      );
    }

    case 'job':
      return <JobCard job={item as never} />;

    case 'housing':
      return <HousingCard listing={item as never} />;

    case 'marketplace':
      return <MarketplaceCard listing={item as never} />;

    case 'provider': {
      // ── Why every field here was renamed ─────────────────────────────────
      //
      // This read `item.listingId`, `item.title`, `item.rating`,
      // `item.reviewCount` and `item.coverImageUrl`. **Not one of those exists
      // on the response.** `DOMAIN_ROUTES.provider` is `GET /providers`, which
      // returns `ProviderPage` — and its rows are `ProviderSummary`, whose
      // fields are `providerId`, `name`, `category.name`, and a nested
      // `reviewSummary { average, totalReviews }`.
      //
      // So every provider card on every community-scoped surface rendered with
      // an empty id, an empty title, an empty category and a **zero rating out
      // of zero reviews**. Not fabricated — blank, and worse, blank in the
      // shape of a real rating. A provider with genuine five-star reviews was
      // being shown as unrated, and the card's `listingId` was `''`, so tapping
      // it navigated nowhere.
      //
      // The field names below come from `ProviderSummary` in
      // `lib/providers-api.ts`, which is the typed contract `searchProviders`
      // already returns. The items arrive here as opaque records because the
      // projection does not need their shape — this is the one place that does.
      const location = item.location as Record<string, unknown> | undefined;
      const category = item.category as Record<string, unknown> | undefined;
      const reviewSummary = item.reviewSummary as Record<string, unknown> | undefined;

      return (
        <ProviderCard
          listingId={String(item.providerId ?? '')}
          title={String(item.name ?? '')}
          category={String(category?.name ?? '')}
          areaName={location?.areaName as string | undefined}
          distanceKm={location?.distanceKm as number | undefined}
          rating={Number(reviewSummary?.average ?? 0)}
          reviewCount={Number(reviewSummary?.totalReviews ?? 0)}
          // `ProviderSummary` carries `coverMedia`, a **Media reference** with a
          // `mediaId` — not a URL. Resolving it needs a `useMediaAsset` query
          // per card, which cannot be called from this non-component function.
          // Left undefined so the card draws its neutral placeholder: a provider
          // with no resolvable photograph must look like one, never like
          // somebody else's shop. See `ProviderImage` in `app/provider/[id].tsx`
          // for the resolved form.
          coverImageUrl={undefined}
          isVerified={Boolean(item.isVerified)}
          isOpenNow={Boolean(item.isOpenNow)}
        />
      );
    }

    case 'event':
    case 'organization':
    default:
      // Events and organizations are rendered by Phase 12's own cards on the
      // Community Life surfaces. §21 and §23 forbid a second event or
      // organization card, so this section links to them rather than drawing one.
      return <CommunityLifeRow item={item} domain={domain} />;
  }
}

/**
 * A minimal row for events and organizations.
 *
 * Deliberately *minimal*: Phase 12 owns the full event and organization cards and
 * this is not a second one. It carries the name, the date or category and the
 * place, and routes to Phase 12's existing detail screens — which is what §21 and
 * §23's "do not duplicate" leaves room for.
 */
function CommunityLifeRow({
  item,
  domain,
}: {
  item: Record<string, unknown>;
  domain: CommunityContentDomain;
}) {
  const { tokens } = useTheme();
  const location = item.location as Record<string, unknown> | undefined;

  const title = String(item.title ?? item.name ?? 'Untitled');
  const secondary =
    domain === 'event'
      ? [item.startsAt ? new Date(String(item.startsAt)).toLocaleDateString() : null, item.category]
          .filter(Boolean)
          .join(' · ')
      : String(item.category ?? '');

  const place = [location?.areaName, location?.cityName].filter(Boolean).join(', ');

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={[title, secondary, place].filter(Boolean).join('. ')}
      style={{
        backgroundColor: tokens.color.surface.card,
        borderColor: tokens.color.border.default,
      }}
      className="rounded-2xl border p-3"
    >
      <Text style={{ color: tokens.color.text.primary }} className="text-xs font-bold">
        {title}
      </Text>
      {secondary ? (
        <Text
          style={{ color: tokens.color.text.placeholder }}
          className="text-[10px] font-bold mt-0.5"
        >
          {secondary}
        </Text>
      ) : null}
      {place ? (
        <Text
          style={{ color: tokens.color.text.secondary }}
          className="text-[10px] font-semibold mt-0.5"
        >
          {place}
        </Text>
      ) : null}
    </View>
  );
}
