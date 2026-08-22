// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — A card for the server's guide shape (Remediation Wave D-3)
//
// `components/GuideCard.tsx` renders `types/guide.ts`'s `GuideSummary` — a
// fixture shape with a `coverImageUrl`, a `country: { flag, name }` object, a
// `qualityLabel`, a `summary` and an `AuthorSummary` beside it. **The server
// returns none of those.**
//
// `GuideCardResponse` carries `countryCode` and no country name or flag,
// `heroMediaId` and no URL, `excerpt` and no summary, `authorId` and no author
// object at all, and no quality label because the platform has no such concept —
// what it has is `isVerified`, which is Trust's decision.
//
// So this is a second component rather than a widened first one. Adapting the
// server's shape into `GuideSummary` would have meant inventing a flag, a
// country name, a cover URL and an author for every row — four fabrications per
// card, on the screen whose whole purpose is to stop fabricating.
// `GuideCard` keeps serving the screens that still render fixtures, and this
// serves the ones that render the knowledge base.
//
// ── Why there is no image ────────────────────────────────────────────────────
//
// `heroMediaId` is a Media identifier and rendering it needs a second call per
// card into `/media`. A list of twenty cards would make twenty of them, so the
// card shows a category-tinted placeholder and the *detail* screen resolves the
// hero. That is a deliberate omission with a cost, not an oversight: what it
// avoids is a fabricated Unsplash URL, which is what the fixture cards had.
//
// ── Why the byline is an identifier ─────────────────────────────────────────
//
// There is no author on this contract and no author route in this module. A card
// that wanted a name would have to ask Trust or the profile module per row. Until
// a screen needs that enough to batch it, the card renders the marks the server
// *does* give it — verified, featured — and leaves the byline to the detail
// screen, which has `author` on its response.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';

import type { GuideCardResponse } from '@/types/guides';

interface GuideResultCardProps {
  guide: GuideCardResponse;
  /** The catalogue's display name for `guide.categoryKey`, when the caller has it. */
  categoryName?: string | null;
}

/** `Beginner` / `Intermediate` / `Advanced`, as a member reads them. */
const DIFFICULTY_LABEL: Record<GuideCardResponse['difficulty'], string> = {
  Beginner: 'Beginner',
  Intermediate: 'Intermediate',
  Advanced: 'Advanced',
};

export function GuideResultCard({ guide, categoryName }: GuideResultCardProps) {
  const updated = guide.updatedAt ?? guide.publishedAt;

  return (
    <Pressable
      onPress={() => router.push(`/guide/${guide.guideId}`)}
      accessibilityRole="button"
      accessibilityLabel={`${guide.title}, ${guide.readingTimeMinutes} minute read`}
      className="bg-surface-card border border-faint rounded-2xl p-4 mb-3"
      testID={`guide-card-${guide.guideId}`}
    >
      <View className="flex-row items-center mb-1.5 flex-wrap">
        <Text className="text-[11px] font-black text-primary-500 uppercase tracking-widest">
          {/* The key is the fallback, and it is honest: a category the catalogue
              no longer lists is still the category this guide is filed under. */}
          {categoryName ?? guide.categoryKey}
        </Text>
        <Text className="text-content-faint mx-1.5">·</Text>
        <Text className="text-[11px] font-bold text-content-faint">{guide.countryCode}</Text>
        {guide.cityName ? (
          <>
            <Text className="text-content-faint mx-1.5">·</Text>
            <Text className="text-[11px] font-bold text-content-faint">{guide.cityName}</Text>
          </>
        ) : null}
        {/* `status` appears on a card only where a draft can legitimately be
            listed — the author's own workspace. Everywhere else the server has
            already filtered to Published. */}
        {guide.status !== 'Published' ? (
          <>
            <Text className="text-content-faint mx-1.5">·</Text>
            <Text className="text-[11px] font-black text-content-muted uppercase">
              {guide.status}
            </Text>
          </>
        ) : null}
      </View>

      <Text className="font-extrabold text-content-primary text-base leading-snug mb-1" numberOfLines={2}>
        {guide.title}
      </Text>

      {guide.excerpt ? (
        <Text className="text-sm text-content-muted mb-2" numberOfLines={2}>
          {guide.excerpt}
        </Text>
      ) : null}

      {guide.tags.length > 0 ? (
        <View className="flex-row flex-wrap mb-2">
          {guide.tags.slice(0, 4).map((tag) => (
            <View key={tag} className="bg-surface-muted rounded-md px-2 py-0.5 mr-1.5 mb-1">
              <Text className="text-[10px] font-bold text-content-tertiary">#{tag}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <View className="flex-row items-center justify-between border-t border-faint pt-2.5">
        <View className="flex-row items-center">
          {/* Trust's decision, not a computed "quality". Nothing in Guides can
              set this — only a Trust integration event can. */}
          {guide.isVerified ? (
            <Text className="text-[10px] font-black text-success-default mr-2">🛡️ VERIFIED</Text>
          ) : null}
          {guide.isFeatured ? (
            <Text className="text-[10px] font-black text-primary-500 mr-2">★ FEATURED</Text>
          ) : null}
          <Text className="text-[11px] font-bold text-content-faint">
            {DIFFICULTY_LABEL[guide.difficulty]}
          </Text>
        </View>

        <Text className="text-[11px] font-bold text-content-faint">
          {guide.readingTimeMinutes}m · 👍 {guide.helpfulCount} · 💬 {guide.commentCount}
        </Text>
      </View>

      {updated ? (
        <Text className="text-[10px] text-content-faint font-semibold mt-1.5">
          Updated {relativeDate(updated)}
        </Text>
      ) : null}
    </Pressable>
  );
}

/**
 * A short relative date.
 *
 * Deliberately coarse: the freshness of a guide matters in weeks and months, and
 * "3h ago" on advice about a visa fee implies a precision the platform does not
 * have about when the fee actually changed.
 */
function relativeDate(iso: string): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return 'recently';

  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return `${Math.floor(days / 365)} years ago`;
}
