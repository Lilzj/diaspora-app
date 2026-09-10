import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollEndScrollView } from '@/components/ScrollEndNavigationMenu';
import { useLocalSearchParams, router } from 'expo-router';
import { useGuidesByAuthor } from '@/hooks/guides';
import { useThemeTokens } from '@/design-system';
import { trackProfileViewed } from '@/lib/analytics/content-events';

// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Contributor page
//
// ── There is no contributor profile on this platform ─────────────────────────
//
// This screen rendered `mockAuthors[id]` from `mocks/community-data.ts`: a name,
// an avatar, a reputation level, a "MONTHLY TOP CONTRIBUTOR" ribbon, follower
// and helpful-vote counts, a list of "Verified Resident" country badges with
// arrival years, and a three-dimensional "Reputation Scorecard" whose numbers
// were computed *in this file* from the fixture's own invented figures
// (`guidesPublished * 20 + updatesPublished * 5`, and a `trustScore` hardcoded
// to 95%).
//
// Every one of those is fabricated. The audit of `diaspora-backend` found **no
// contributor route of any kind** — no leaderboard, no contributor list, no
// contributor profile. The word "contributor" appears in that repository only as
// infrastructure vocabulary (`IEndpointContributor`, `IDatabaseContributor`),
// which is a different thing entirely. `guides-api.ts` records the same finding
// from the other side: "No author profile route. `GuideCardResponse` carries
// `authorId` and nothing else."
//
// A fabricated identity is the most damaging kind of fixture this application
// had. Reputation, residence verification and follower counts are exactly the
// signals a member uses to decide whether to trust advice about visas, money or
// housing — and they were decoration.
//
// ── What is real, and is therefore all this page shows ───────────────────────
//
//     GET /guides/authors/{authorId:guid}   →  the guides that author wrote
//
// Wrapped as `useGuidesByAuthor` in `hooks/guides.ts`. It is a **list of guides
// by an author, not an author profile**: the response carries guide cards and
// nothing about the person. So this page can honestly answer "what has this
// account published?" and cannot answer "who is this?" — and it now says so
// rather than filling the gap.
//
// ── Why the GUID check is load-bearing ───────────────────────────────────────
//
// The route constraint is `{authorId:guid}`. A non-GUID id — a fixture key like
// `author-1`, an old creator slug, a stale deep link — does not reach the
// handler at all; it 404s at routing. The old screen answered that case by
// looking the id up in `mockAuthors`, so an unknown id could resolve to *a
// different, invented person*. Showing the wrong person's credentials is worse
// than showing none, so a non-GUID id gets an honest not-found here and no
// request is issued.
//
// ── What was deliberately not kept ───────────────────────────────────────────
//
// The follow button and the provider-notification modal were both keyed on the
// fixture's `userId`. Neither has a verified contract established by this pass,
// and a "follow" or "alert me" control on a page that cannot name the person is
// a control with nothing behind it. They are removed rather than pointed
// somewhere hopeful.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `{authorId:guid}` as ASP.NET Core's route constraint accepts it.
 *
 * Checked before the request rather than after, because the failure it prevents
 * is not a wasted call — it is the difference between "we cannot show you this
 * person" and a 404 the screen would have to guess the meaning of.
 */
const GUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function ContributorProfileScreen() {
  const tokens = useThemeTokens();
  const { id } = useLocalSearchParams<{ id: string }>();

  /**
   * One profile view, counted by the platform.
   *
   * `profile.viewed` is registered and client-submittable and had no emitter.
   * The subject rides in `contentId` because the schema sets
   * `RequiresContent: true` and neither allow-list carries a `subjectUserId`.
   * Dedup is the server's: one person per subject per day.
   */
  useEffect(() => {
    trackProfileViewed({ userId: id });
  }, [id]);

  const authorId = typeof id === 'string' ? id.trim() : '';
  const isAddressable = GUID_PATTERN.test(authorId);

  // `enabled` is driven by the id the hook is handed: a non-GUID id passes null
  // and no request leaves the device.
  const authored = useGuidesByAuthor(isAddressable ? authorId : null);

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-surface-background">
      {/* Navigation Header */}
      <View className="px-6 py-4 border-b border-faint bg-surface-card flex-row items-center">
        <TouchableOpacity onPress={() => router.back()} className="mr-3 p-1" accessibilityRole="button" accessibilityLabel="Go back">
          <Text className="text-xl text-content-tertiary">←</Text>
        </TouchableOpacity>
        <Text className="text-lg font-black text-content-primary tracking-tight">
          Published guides
        </Text>
      </View>

      {!isAddressable ? (
        // No contributor directory exists, so an id that is not an account id
        // cannot be resolved to anybody. It must never fall back to a name.
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-5xl mb-5" accessibilityElementsHidden importantForAccessibility="no">
            👤
          </Text>
          <Text className="text-base font-black text-content-primary text-center" accessibilityRole="header">
            This contributor page cannot be opened
          </Text>
          <Text className="text-xs text-content-muted text-center mt-2.5 leading-relaxed">
            Diaspora has no contributor profiles — there is no page describing a member, their
            reputation or their history. The only thing that can be looked up is the set of guides
            written by an account, and this link does not carry a valid account id.
          </Text>
          <TouchableOpacity
            onPress={() => router.push('/(tabs)/knowledge')}
            className="bg-primary-500 px-6 py-3 rounded-2xl mt-6"
            accessibilityRole="button"
            accessibilityLabel="Open the Knowledge Hub"
          >
            <Text className="text-white font-black text-xs">Browse the Knowledge Hub</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollEndScrollView className="flex-1" showsVerticalScrollIndicator={false} activeTab="discover">
          {/*
            Said before the list, not after it. A member arriving from a byline
            expects a person; they are told immediately that this page is the
            author's work rather than the author.
          */}
          <View className="bg-surface-card px-6 py-5 border-b border-faint">
            <Text className="text-sm font-black text-content-primary">
              Guides written by this member
            </Text>
            <Text className="text-[11px] text-content-muted mt-1.5 leading-relaxed">
              Diaspora does not have contributor profiles, so there is no name, photo, reputation
              score or follower count to show here — the platform does not hold them. What it does
              hold is everything this account has published, which is listed below.
            </Text>
          </View>

          <View className="px-6 py-5">
            {authored.isLoading ? (
              <View className="items-center py-12">
                <ActivityIndicator color={tokens.color.text.placeholder} />
                <Text className="text-xs text-content-faint font-bold mt-3">Loading guides…</Text>
              </View>
            ) : authored.error ? (
              <View className="bg-surface-card rounded-3xl border border-subtle p-6 items-center">
                <Text className="text-sm font-bold text-content-strong text-center">
                  We could not load this member&apos;s guides
                </Text>
                <Text className="text-xs text-content-muted text-center mt-1.5 leading-relaxed">
                  {authored.error}
                </Text>
                <TouchableOpacity
                  onPress={authored.refresh}
                  className="bg-primary-500 px-5 py-2.5 rounded-xl mt-4"
                  accessibilityRole="button"
                  accessibilityLabel="Try again"
                >
                  <Text className="text-white font-black text-xs">Try again</Text>
                </TouchableOpacity>
              </View>
            ) : authored.isEmpty ? (
              // The server answered, and the answer was none. Distinguished from
              // the error branch above on purpose: "nothing published" and "we
              // could not ask" need different words.
              <View className="bg-surface-card rounded-3xl border border-subtle p-6 items-center">
                <Text className="text-3xl mb-1.5" accessibilityElementsHidden importantForAccessibility="no">
                  📖
                </Text>
                <Text className="text-sm font-bold text-content-strong text-center">
                  Nothing published yet
                </Text>
                <Text className="text-xs text-content-muted text-center mt-1.5 leading-relaxed">
                  This account has no published guides, or none that are visible to you.
                </Text>
              </View>
            ) : (
              <>
                <Text className="text-xs font-bold text-content-faint uppercase tracking-widest mb-3">
                  {/*
                    `totalCount` is `int?` on the wire and the route declines to
                    count — so null is **not** zero, and the honest fallback is
                    the number received rather than a total we do not have.
                  */}
                  {authored.totalCount ?? authored.guides.length} guide
                  {(authored.totalCount ?? authored.guides.length) === 1 ? '' : 's'}
                </Text>

                {authored.guides.map((guide) => (
                  <TouchableOpacity
                    key={guide.guideId}
                    onPress={() => router.push(`/guide/${guide.guideId}`)}
                    className="bg-surface-card border border-subtle rounded-2xl p-4 mb-2.5"
                    accessibilityRole="button"
                    accessibilityLabel={`Open guide: ${guide.title}`}
                  >
                    <Text className="text-sm font-black text-content-primary leading-snug">
                      {guide.title}
                    </Text>

                    {guide.excerpt ? (
                      <Text className="text-xs text-content-muted mt-1.5 leading-relaxed" numberOfLines={2}>
                        {guide.excerpt}
                      </Text>
                    ) : null}

                    <View className="flex-row items-center flex-wrap gap-x-2 gap-y-1 mt-3">
                      <Text className="text-[10px] font-bold text-content-faint uppercase tracking-wide">
                        {guide.countryCode}
                      </Text>
                      <Text className="text-[10px] text-content-faint">·</Text>
                      <Text className="text-[10px] font-bold text-content-faint">
                        {guide.readingTimeMinutes} min read
                      </Text>
                      {guide.isVerified && (
                        <Text className="text-[9px] font-black text-success-default bg-success-surface px-1.5 py-0.5 rounded">
                          VERIFIED
                        </Text>
                      )}
                      {guide.isFeatured && (
                        <Text className="text-[9px] font-black text-primary-500 bg-primary-50 px-1.5 py-0.5 rounded">
                          FEATURED
                        </Text>
                      )}
                    </View>
                  </TouchableOpacity>
                ))}

                {authored.hasMore && (
                  <TouchableOpacity
                    onPress={authored.loadMore}
                    disabled={authored.isFetchingMore}
                    className="bg-surface-card border border-subtle rounded-2xl py-3 items-center mt-2"
                    accessibilityRole="button"
                    accessibilityLabel="Load more guides"
                  >
                    <Text className="text-xs font-black text-primary-500">
                      {authored.isFetchingMore ? 'Loading…' : 'Load more'}
                    </Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </View>

          <View className="h-8" />
        </ScrollEndScrollView>
      )}
    </SafeAreaView>
  );
}
