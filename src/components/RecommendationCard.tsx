// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Recommendation card (Remediation Wave D-1)
//
// One card for every kind of recommended thing, because the contract has one
// shape for every kind of recommended thing. `RecommendationResponse` is flat
// and uniform: a guide, a job, a housing listing and an organisation all arrive
// as the same record with a `targetType` discriminator and no per-type payload.
//
// ── Why this is not `JobCard`, `GuideCard` or `HousingCard` ──────────────────
//
// It cannot be. `JobCard` requires `salary`, `employer`, `benefitsFlags`,
// `urgency` and `expiresAt`; `GuideCard` requires an author with a reputation
// level and a verification record; `HousingCard` requires a rent and a
// bedroom count. **None of those fields exist on a recommendation.** Rendering a
// feed item through one of those cards would mean inventing a salary, an author
// or a rent — which is the exact defect this remediation exists to remove, and
// is worse here than anywhere else because a recommendation is the platform
// telling a member "this one, for you".
//
// So this card renders precisely what the wire carries and nothing more: the
// title, the summary, the place, the category key, the two badges, and the
// server's own sentence explaining why the item is there. A member who wants the
// salary taps through to the job, where the job's own module answers.
//
// ── The reason line is not decoration ────────────────────────────────────────
//
// `reason.text` is the server's explanation of its own choice — "Popular with
// people near you", "Based on what you have been reading". It is rendered
// because a recommender that will not say why it chose something is a recommender
// a member cannot correct, and because the "not interested" control next to it
// only makes sense once the member knows what they are declining.
//
// `reason.confidence` is a **string** ("low", "medium") and not a percentage. It
// is deliberately not rendered: there is no honest way to draw a bar from it.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';

import {
  describeRecommendationLocation,
  routeForRecommendation,
} from '@/lib/recommendations-api';
import type { Recommendation } from '@/types/recommendations';

export interface RecommendationCardProps {
  item: Recommendation;
  /** Called when the member opens the item. Only ever called when it is openable. */
  onOpen: (item: Recommendation) => void;
  /** "Not interested." Omitted where dismissal is not offered. */
  onDismiss?: (item: Recommendation) => void;
  /** Called once when the card is first rendered, for the impression. */
  onImpression?: (item: Recommendation) => void;
  /** `carousel` is the fixed-width form used inside a horizontal rail. */
  variant?: 'carousel' | 'list';
}

/**
 * A human label for a `targetType`.
 *
 * The wire value is PascalCase and machine-facing — "MarketplaceListing" is not
 * something to show a member. The map is exhaustive over the union so a new wire
 * type is a compile error here rather than a raw enum name on a card.
 */
const TYPE_LABELS: Record<Recommendation['targetType'], string> = {
  Job: 'Job',
  MarketplaceListing: 'For sale',
  HousingListing: 'Housing',
  Provider: 'Provider',
  Guide: 'Guide',
  LearningPath: 'Learning',
  Organization: 'Organization',
  Event: 'Event',
  Neighborhood: 'Neighbourhood',
  Community: 'Community',
  Country: 'Country',
  Announcement: 'Announcement',
  MonetizationOffer: 'Suggested for you',
};

export function RecommendationCard({
  item,
  onOpen,
  onDismiss,
  onImpression,
  variant = 'carousel',
}: RecommendationCardProps) {
  // The impression fires once per mount rather than on every render. It is
  // de-duplicated server-side inside a five-minute window anyway, so a repeat is
  // harmless — but a request per re-render would be a request per keystroke on
  // any screen that grows a filter.
  React.useEffect(() => {
    onImpression?.(item);
    // Keyed on the item rather than on the callback: a parent that rebuilds its
    // handler each render must not re-fire the impression.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.targetId]);

  // Null when this client has no screen for the type — `LearningPath`,
  // `Announcement`, `Country`, and a `Community` with no slug. An unopenable
  // card must not look openable, so it renders as a plain view with no press
  // handler and no button role.
  const destination = routeForRecommendation(item);
  const isOpenable = destination !== null;

  const place = describeRecommendationLocation(item);
  const typeLabel = TYPE_LABELS[item.targetType];

  const body = (
    <>
      <View className="flex-row items-start justify-between mb-2">
        <View className="bg-surface-background px-2 py-1 rounded-lg border border-faint">
          <Text className="text-[10px] font-bold text-content-muted uppercase">{typeLabel}</Text>
        </View>

        {onDismiss ? (
          <TouchableOpacity
            accessible
            accessibilityRole="button"
            accessibilityLabel={`Not interested in ${item.title}`}
            accessibilityHint="Hides this and stops it being recommended for ninety days"
            onPress={() => onDismiss(item)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            className="w-7 h-7 rounded-full bg-surface-background items-center justify-center border border-faint"
          >
            <Text className="text-xs text-content-muted">✕</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <Text
        className="text-base font-extrabold text-content-primary leading-snug mb-1"
        numberOfLines={2}
      >
        {item.title}
      </Text>

      {/* Null on plenty of real items. Rendering the element unconditionally
          would leave a blank line where the server simply had nothing to say. */}
      {item.summary ? (
        <Text className="text-sm text-content-muted font-semibold leading-snug mb-2" numberOfLines={2}>
          {item.summary}
        </Text>
      ) : null}

      {/* Every field on `RecommendationLocation` is optional and a guide is
          frequently country-wide, so this is empty as often as not. */}
      {place ? (
        <Text className="text-sm text-content-muted font-semibold mb-2" numberOfLines={1}>
          📍 {place}
        </Text>
      ) : null}

      <View className="flex-row flex-wrap gap-1 mb-2">
        {item.isVerified ? (
          <View className="bg-surface-muted px-2 py-0.5 rounded-full">
            <Text className="text-[9px] font-bold text-success-default">✓ Verified</Text>
          </View>
        ) : null}
        {item.isFeatured ? (
          <View className="bg-surface-muted px-2 py-0.5 rounded-full">
            <Text className="text-[9px] font-bold text-primary-600">★ Featured</Text>
          </View>
        ) : null}
        {item.categoryKey ? (
          <View className="bg-surface-background px-2 py-0.5 rounded-full border border-faint">
            <Text className="text-[9px] font-bold text-content-muted">{item.categoryKey}</Text>
          </View>
        ) : null}
      </View>

      <View className="border-t border-faint pt-2">
        <Text className="text-[10px] font-bold text-content-faint" numberOfLines={2}>
          {item.reason.text}
        </Text>
        {!isOpenable ? (
          // Said out loud rather than hidden. The feed can recommend a learning
          // path, an announcement or a country, and this application has no
          // screen for any of them — a card that silently did nothing on tap
          // would read as a bug rather than as a missing feature.
          <Text className="text-[10px] font-bold text-content-faint mt-1">
            Not available in the app yet
          </Text>
        ) : null}
      </View>
    </>
  );

  const className =
    variant === 'carousel'
      ? 'w-[280px] bg-surface-card rounded-2xl p-4 mr-4 border border-subtle'
      : 'bg-surface-card rounded-2xl p-4 mb-3 border border-subtle';

  if (!isOpenable) {
    return (
      <View accessible accessibilityLabel={`${typeLabel}: ${item.title}`} className={className}>
        {body}
      </View>
    );
  }

  return (
    <TouchableOpacity
      accessible
      accessibilityRole="button"
      accessibilityLabel={`${typeLabel}: ${item.title}${place ? `, ${place}` : ''}`}
      accessibilityHint={item.reason.text}
      onPress={() => onOpen(item)}
      activeOpacity={0.9}
      className={className}
      style={{
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
        elevation: 3,
      }}
    >
      {body}
    </TouchableOpacity>
  );
}
