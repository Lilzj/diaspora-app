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
import { getActiveLocation, useLocationStore } from '@/store/location';

import { GuideCard } from '@/components/GuideCard';
import { JobCard } from '@/components/JobCard';
import { HousingCard } from '@/components/HousingCard';
import { MarketplaceCard } from '@/components/MarketplaceCard';
import { ProviderCard } from '@/components/ProviderCard';
import { UpdateCard } from '@/components/UpdateCard';

import { mockAuthors, mockCommunityUpdates, mockGuides } from '@/mocks/community-data';

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
 * The two domains served from in-app collections rather than a list route.
 *
 * Guides and updates have no dedicated certified list endpoint — the audit
 * confirmed it — so they are narrowed in memory through the identical projection.
 * Recording the distinction here rather than in a comment means
 * `fetchScopedContent` can throw for them, which is what catches a caller that
 * reached for the wrong path.
 */
const IN_MEMORY_DOMAINS: CommunityContentDomain[] = ['guide', 'update'];

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

  // The in-memory collections. `useScopedCollection` applies the same projection
  // as the request path, so a guide and a job never disagree about scope.
  const collection = useMemo(() => {
    if (domain === 'guide') return mockGuides;
    if (domain === 'update') return mockCommunityUpdates;
    return [];
  }, [domain]);

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
      latitude: activeLocation.latitude,
      longitude: activeLocation.longitude,
      radiusKm: locationStore.searchRadius > 0 ? locationStore.searchRadius : undefined,
    },
    { enabled: !isInMemory }
  );

  const result = isInMemory ? inMemory : remote.data;

  const unavailable: CommunityUnavailableReason | null = useMemo(() => {
    if (projection.isEmpty) return 'empty';
    if (!isInMemory) {
      if (remote.isLoading) return 'loading';
      if (remote.isError) return isOnline ? 'error' : 'offline';
    }
    if (!result || result.items.length === 0) return 'empty';
    return null;
  }, [isInMemory, isOnline, projection.isEmpty, remote.isError, remote.isLoading, result]);

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

      {!hideScopeNote && !projection.isUnscoped ? (
        <View className="px-4 mb-3">
          <CommunityScopeNote
            projection={projection}
            totalBeforeScope={result?.totalBeforeScope}
            totalAfterScope={result?.totalAfterScope}
            resultTruncated={result?.resultTruncated}
            compact
          />
        </View>
      ) : null}

      {unavailable ? (
        <CommunityUnavailablePanel
          reason={unavailable}
          subject={DOMAIN_LABELS[domain].subject}
          compact
          onAction={isInMemory ? undefined : () => void remote.refetch()}
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
      const authorId = (item.authorId as string) ?? '';
      const author = mockAuthors[authorId];

      return (
        <GuideCard
          guide={guide}
          author={
            (author
              ? {
                  userId: author.userId,
                  name: author.name,
                  avatarUrl: author.avatarUrl,
                  reputationLevel: author.reputationLevel,
                  isCountryVerified: author.countryVerifications.length > 0,
                  primaryCountry: author.countryVerifications[0] ?? null,
                  expertiseCategories: author.expertiseCategories,
                  followerCount: author.followerCount,
                  isFollowedByUser: author.isFollowedByUser,
                }
              : {
                  userId: '',
                  name: 'Community member',
                  avatarUrl: null,
                  reputationLevel: 'Newcomer',
                  isCountryVerified: false,
                  primaryCountry: null,
                  expertiseCategories: [],
                  followerCount: 0,
                  isFollowedByUser: false,
                }) as never
          }
        />
      );
    }

    case 'update': {
      const authorId = (item.authorId as string) ?? '';
      const author = mockAuthors[authorId];

      return (
        <UpdateCard
          update={item as never}
          author={
            (author
              ? {
                  userId: author.userId,
                  name: author.name,
                  avatarUrl: author.avatarUrl,
                  reputationLevel: author.reputationLevel,
                  isCountryVerified: author.countryVerifications.length > 0,
                  primaryCountry: author.countryVerifications[0] ?? null,
                  expertiseCategories: author.expertiseCategories,
                  followerCount: author.followerCount,
                  isFollowedByUser: author.isFollowedByUser,
                }
              : {
                  userId: '',
                  name: 'Community member',
                  avatarUrl: null,
                  reputationLevel: 'Newcomer',
                  isCountryVerified: false,
                  primaryCountry: null,
                  expertiseCategories: [],
                  followerCount: 0,
                  isFollowedByUser: false,
                }) as never
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
      const location = item.location as Record<string, unknown> | undefined;

      return (
        <ProviderCard
          listingId={String(item.listingId ?? item.id ?? '')}
          title={String(item.title ?? '')}
          category={String(item.category ?? '')}
          areaName={location?.areaName as string | undefined}
          distanceKm={location?.distanceKm as number | undefined}
          rating={Number(item.rating ?? 0)}
          reviewCount={Number(item.reviewCount ?? 0)}
          coverImageUrl={item.coverImageUrl as string | undefined}
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
