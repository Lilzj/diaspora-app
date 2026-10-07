import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollEndScrollView } from '@/components/ScrollEndNavigationMenu';
import { useLocalSearchParams, router } from 'expo-router';
import { mockCountryStats, mockAuthors } from '@/mocks/community-data';
import { mockCategories } from '@/mocks/data';
import { CountryStats } from '@/components/CountryStats';
import { ContributorRow } from '@/components/ContributorRow';
import { useBottomInset } from '@/components/layout/bottom-inset';
import { GuideResultCard } from '@/components/guides/GuideResultCard';
import { useTrendingGuides } from '@/hooks/guides';
import { useCountryIntelligence } from '@/hooks/country-intelligence';

// Remediation Wave D-2b.
//
// The "Recent Community Alerts" rail used to filter `mockCommunityUpdates` by
// whether the *author* held a country verification for this page's country —
// which is a statement about the author, not about where the alert is. There is
// a `country` feed key on `Diaspora.Modules.Community` that answers the question
// the rail was actually asking, and `countryCode` is the filter it takes.
//
// Remediation Waves D-3 and D-5.
//
// **"Trending Guides" was three fixture identifiers.** `mockCountryStats`
// carried a `trendingGuideIds` array, each id resolved against `mockGuides`, so
// every country page showed the same guides and a country with no fixture entry
// showed none. `GET /guides/trending?countryCode=` is the real shelf, and it is
// what "earning attention now" actually means on this platform.
//
// **The country intelligence band is new.** `/api/v1/intelligence/countries/
// {code}` returns embassies, entry rules, emergency numbers and official
// notices for a country in one call, and no screen in this application had ever
// asked for it. The band below is the entry point to the three D-5 screens.
//
// The stats header and the contributors rail are still fixtures and belong to
// other modules.
import { CommunityPostCard } from '@/components/community-social';
import { Skeleton } from '@/components/Skeleton';
import { useCommunityFeed } from '@/hooks/community-social';
import { backOr } from '@/lib/navigation';

export default function CountryPageScreen() {
  // The guard rail: the phone's gesture area plus breathing room.
  const bottomInset = useBottomInset();

  const { code } = useLocalSearchParams<{ code: string }>();
  const stats = mockCountryStats.find((c) => c.countryCode === code);

  // Above the early return, because it is a hook. `enabled` is what keeps a
  // page opened on an unknown country code from issuing a request for it.
  const updates = useCommunityFeed(
    'country',
    { countryCode: code, limit: 5 },
    { enabled: Boolean(code) }
  );

  // Both above the early return, for the same reason.
  const trending = useTrendingGuides({ countryCode: code, limit: 5, enabled: Boolean(code) });
  const intelligence = useCountryIntelligence(code);

  if (!stats) {
    return (
      <SafeAreaView className="flex-1 bg-surface-card items-center justify-center">
        <Text>Country not found.</Text>
        <TouchableOpacity onPress={() => backOr()} className="mt-4">
          <Text className="text-primary-500">Go Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const topExperts = stats.topContributorIds
    .map((id) => mockAuthors[id])
    .filter(Boolean);

  return (
    // `edges={['top']}` rather than a bare `View`: this screen draws a full-bleed
    // hero behind its header, so it opted out of the safe area entirely and put
    // the back button at a hardcoded `top-12`. That is the status bar's height
    // on some phones and not others — on the device capture the clock sits on
    // top of the stats cards. The hero still bleeds; only the controls move.
    <SafeAreaView edges={['top']} className="flex-1 bg-surface-background">
      {/* Back navigation toggle */}
      <View className="absolute top-4 left-6 z-10">
        <TouchableOpacity
          onPress={() => backOr()}
          className="bg-black/40 rounded-full w-10 h-10 items-center justify-center"
        >
          <Text className="text-xl text-white">←</Text>
        </TouchableOpacity>
      </View>

      <ScrollEndScrollView className="flex-1" bounces={false} showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: bottomInset }}>
        {/* Full stats header block containing counts */}
        <CountryStats stats={stats} variant="full" />

        <View className="p-6">
          
          {/* Quick Categories Navigation shortcuts */}
          <Text className="text-xs font-bold text-content-faint uppercase tracking-widest mb-3">
            Explore Categories in {stats.countryName}
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row mb-6 gap-2">
            {mockCategories.slice(0, 5).map((cat) => (
              <TouchableOpacity
                key={cat.id}
                onPress={() =>
                  router.push({
                    pathname: '/(tabs)/discover',
                    params: { category: cat.id },
                  })
                }
                className="bg-surface-card border border-subtle rounded-2xl px-4 py-3 flex-row items-center mr-2 shadow-sm"
              >
                <Text className="text-sm mr-1.5">{cat.icon}</Text>
                <Text className="text-xs font-bold text-content-secondary">{cat.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* ── Official information ──────────────────────────────────────
              The Country Intelligence Platform, reached for the first time.
              The band renders only what the server says exists for this country
              — a count of zero is a row that is not offered rather than a row
              that leads somewhere empty. */}
          {intelligence.intelligence ? (
            <>
              <Text className="text-xs font-bold text-content-faint uppercase tracking-widest mb-3">
                🏛️ Official Information
              </Text>

              {intelligence.intelligence.statistics.urgentNoticeCount > 0 ? (
                <View className="bg-[#FEF2F2] border border-[#FECACA] rounded-2xl p-4 mb-3">
                  <Text className="text-[10px] font-black text-error-default uppercase tracking-widest mb-1">
                    {intelligence.intelligence.statistics.urgentNoticeCount} urgent{' '}
                    {intelligence.intelligence.statistics.urgentNoticeCount === 1
                      ? 'notice'
                      : 'notices'}
                  </Text>
                  {intelligence.intelligence.safetyAlerts.slice(0, 2).map((alert) => (
                    <Text
                      key={alert.officialNoticeId}
                      onPress={() =>
                        router.push(`/intelligence/notice/${alert.officialNoticeId}` as never)
                      }
                      accessibilityRole="link"
                      className="text-xs font-bold text-content-strong mt-1"
                      numberOfLines={2}
                    >
                      {alert.title}
                    </Text>
                  ))}
                </View>
              ) : null}

              {/* Emergency numbers are carried in full on the dashboard — "making
                  somebody tap through to an ambulance number would be
                  indefensible" — so they are rendered here rather than linked. */}
              {intelligence.intelligence.emergency &&
              intelligence.intelligence.emergency.contacts.length > 0 ? (
                <View className="bg-surface-card border border-faint rounded-2xl p-4 mb-3">
                  <Text className="text-[10px] font-black text-content-faint uppercase tracking-widest mb-2">
                    Emergency numbers
                  </Text>
                  {intelligence.intelligence.emergency.guidance ? (
                    <Text className="text-[11px] text-content-muted mb-2 leading-relaxed">
                      {intelligence.intelligence.emergency.guidance}
                    </Text>
                  ) : null}
                  {intelligence.intelligence.emergency.contacts.map((contact) => (
                    <View
                      key={`${contact.kind}-${contact.number}`}
                      className="flex-row justify-between items-center py-1"
                    >
                      {/* `label` is what **this country** calls it, localized —
                          never the platform's English name for the kind. */}
                      <Text className="text-xs font-bold text-content-secondary">
                        {contact.label}
                      </Text>
                      <Text className="text-sm font-black text-content-primary">
                        {contact.number}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}

              {/* Added 7 Oct 2026: notices had no list screen at all. */}
              {intelligence.intelligence.statistics.activeNoticeCount > 0 ? (
                <IntelligenceLink
                  label={`Notices (${intelligence.intelligence.statistics.activeNoticeCount})`}
                  onPress={() => router.push(`/intelligence/notices?country=${stats.countryCode}` as never)}
                />
              ) : null}

              {intelligence.intelligence.statistics.embassyCount > 0 ? (
                <IntelligenceLink
                  label={`Embassies & consulates (${intelligence.intelligence.statistics.embassyCount})`}
                  onPress={() => router.push(`/intelligence/embassies?country=${stats.countryCode}`)}
                />
              ) : null}

              {intelligence.intelligence.statistics.visaAdvisoryCount > 0 ? (
                <IntelligenceLink
                  label={`Entry rules (${intelligence.intelligence.statistics.visaAdvisoryCount})`}
                  onPress={() => router.push(`/intelligence/visas?country=${stats.countryCode}`)}
                />
              ) : null}

              <View className="mb-6" />
            </>
          ) : null}

          {/* Trending Guides list — `GET /guides/trending?countryCode=` */}
          <Text className="text-xs font-bold text-content-faint uppercase tracking-widest mb-3">
            🔥 Trending Guides
          </Text>
          {trending.isLoading ? (
            <View className="mb-6">
              <Skeleton height={90} borderRadius={16} className="mb-2" />
              <Skeleton height={90} borderRadius={16} />
            </View>
          ) : trending.guides.length > 0 ? (
            <View className="mb-2">
              {trending.guides.map((guide) => (
                <GuideResultCard key={guide.guideId} guide={guide} />
              ))}
            </View>
          ) : (
            <View className="bg-surface-card rounded-2xl p-4 border border-faint mb-6">
              <Text className="text-xs text-content-faint text-center font-bold">
                {trending.error ?? 'No trending guides published yet.'}
              </Text>
            </View>
          )}

          {/* Recent Updates list */}
          <Text className="text-xs font-bold text-content-faint uppercase tracking-widest mt-4 mb-3">
            📢 Recent Community Alerts
          </Text>
          {updates.isLoading ? (
            <View
              accessible
              accessibilityRole="progressbar"
              accessibilityLabel="Loading community alerts"
            >
              <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
                {[0, 1].map((row) => (
                  <View
                    key={row}
                    className="bg-surface-card rounded-2xl p-4 mb-3 border border-subtle"
                  >
                    <Skeleton width="40%" height={12} className="mb-3" />
                    <Skeleton width="85%" height={16} className="mb-2" />
                    <Skeleton width="60%" height={14} />
                  </View>
                ))}
              </View>
            </View>
          ) : updates.error ? (
            // A failed rail says it failed. The rail it replaced could not fail,
            // because it read an array that was always there.
            <View className="bg-surface-card rounded-2xl p-4 border border-faint mb-6">
              <Text className="text-xs text-content-faint text-center font-bold">
                {updates.error}
              </Text>
            </View>
          ) : updates.posts.length > 0 ? (
            updates.posts.map((post) => <CommunityPostCard key={post.postId} post={post} />)
          ) : (
            <View className="bg-surface-card rounded-2xl p-4 border border-faint mb-6">
              <Text className="text-xs text-content-faint text-center font-bold">No active local updates reported today.</Text>
            </View>
          )}

          {/* Expert Contributors Ranking list */}
          <Text className="text-xs font-bold text-content-faint uppercase tracking-widest mt-4 mb-3">
            🏅 Verified Local Experts
          </Text>
          {topExperts.length > 0 ? (
            topExperts.map((expert, idx) => (
              <ContributorRow key={expert.userId} contributor={expert} rank={idx + 1} />
            ))
          ) : (
            <View className="bg-surface-card rounded-2xl p-4 border border-faint">
              <Text className="text-xs text-content-faint text-center font-bold">No local experts verified yet.</Text>
            </View>
          )}
          
        </View>
        <View className="h-8" />
      </ScrollEndScrollView>
    </SafeAreaView>
  );
}

/** One row into the Country Intelligence Platform. Rendered only when it leads somewhere. */
function IntelligenceLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="bg-surface-card border border-faint rounded-2xl p-4 mb-2 flex-row items-center justify-between"
    >
      <Text className="text-xs font-black text-content-secondary flex-1 mr-2">{label}</Text>
      <Text className="text-content-faint text-lg">›</Text>
    </TouchableOpacity>
  );
}
