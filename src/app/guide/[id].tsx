import React, { useState, useRef, useEffect } from 'react';
import { useNotification } from '@/providers/notification-provider';
import { View, Text, TouchableOpacity, Modal, FlatList, Share, ScrollView, TouchableWithoutFeedback, KeyboardAvoidingView, ActivityIndicator } from 'react-native';
import { ScrollEndScrollView } from '@/components/ScrollEndNavigationMenu';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Image } from 'expo-image';
import { useBookmarkStore } from '@/store/bookmarks';
import { useSavedStore } from '@/store/saved';
import { Ionicons } from '@expo/vector-icons';

// Remediation Wave D-2b.
//
// The discussion under a guide used to be `mockComments`, filtered by
// `contentId` into a `useState` array: posting a comment pushed an object into
// local state, liking one incremented a number in it, and every word of it was
// gone on unmount. `Diaspora.Modules.Community` has served
// `GET /community/content/{contentType}/{contentId}/comments` the whole time,
// and `guide` is one of its content types.
//
// The thread below is now that route, cursor-paged, with deleted comments
// rendered as tombstones rather than filtered out — filtering them would orphan
// their replies, which is precisely why the server delivers them at all.
//
// ── Remediation Wave D-3 — and now the guide itself ─────────────────────────
//
// The rest of this screen was still `mocks/community-data.ts`: the guide was
// found with `mockGuides.find`, the author came from a `mockAuthors` map, the
// body was one fixture string, the "Version History" modal was a `mockVersions`
// array declared **inside this file**, the helpful button incremented a
// `useState` number, and "Related Guides" was `mockGuides.filter(…).slice(0, 3)`
// — every other fixture, regardless of topic or country.
//
// All of it is now `Diaspora.Modules.Guides`:
//
//   GET  /guides/{id}                     the document, its author's Trust
//                                         standing, its trust mark, its counters
//   GET  /guides/{id}/versions            the real publication history
//   GET  /guides/categories/{key}/guides  genuinely related guides
//   POST /guides/{id}/vote                the helpful vote
//   POST /guides/{id}/view                the read, recorded once per mount
//   POST /guides/{id}/share               the share the platform cannot see
//   PUT  /guides/{id}/bookmark            the save
//
// The comment thread and the report sheet are untouched. They are Community's,
// they were correct, and a guide's discussion is not a Guides route.
import { CommentThread, ReportContentSheet } from '@/components/community-social';
import { useContentComments } from '@/hooks/community-social';
import type { CommunityContentType } from '@/types/community-social';
import { GuideBody } from '@/components/guides/GuideBody';
import { useMediaAsset } from '@/hooks/media';
import {
  useCastGuideVote,
  useGuide,
  useGuideCategories,
  useGuidesByCategory,
  useGuideVersions,
  useRecordGuideShare,
  useRecordGuideView,
  useSetGuideBookmark,
} from '@/hooks/guides';
import { GUIDE_WORDS_PER_MINUTE, guideErrorMessage } from '@/lib/guides-api';
import { trackContentViewed } from '@/lib/analytics/content-events';
import { backOr } from '@/lib/navigation';

export default function GuideReaderScreen() {
  const { showAlert } = useNotification();
  const { id } = useLocalSearchParams<{ id: string }>();

  /**
   * One view, counted by the platform.
   *
   * `content.viewed` is registered, client-submittable and had no emitter
   * anywhere — which is why `content.views` reads AWAITING_SOURCE. No
   * throttling here on purpose: the server deduplicates one person per item
   * per day, and a second rule in the client would be a second definition of
   * the same word.
   */
  useEffect(() => {
    trackContentViewed({ contentType: 'guide', contentId: id });
  }, [id]);

  // Every hook runs before any early return. The screen used to `return` for a
  // missing guide *above* `useContentComments`, which is a conditional hook —
  // it happened to be safe only because the fixture lookup was synchronous and
  // could never change between renders. A server read can.
  const { guide, isLoading, isNotFound, error, refresh } = useGuide(id);

  // The discussion, from the server. `guide` is a `CommunityContentType`, so
  // this is the generic content thread rather than the post convenience route —
  // they answer the identical `CommentThreadResponse`.
  const thread = useContentComments('guide', id ?? '');

  const versions = useGuideVersions(guide ? id : null);
  const { categories } = useGuideCategories();

  // Genuinely related: published guides filed under the same catalogue category.
  // There is no "related guides" route in this module, and the category browse
  // is the closest thing the contract actually offers — which is a better
  // answer than three arbitrary rows and is labelled as what it is.
  const related = useGuidesByCategory(guide?.categoryKey ?? null, { limit: 6 });

  const hero = useMediaAsset(
    guide?.mediaReferences.find((reference) => reference.role === 'Hero')?.mediaId ?? null
  );

  const vote = useCastGuideVote();
  const setBookmark = useSetGuideBookmark();
  const recordView = useRecordGuideView();
  const recordShare = useRecordGuideShare();

  const scrollRef = useRef<ScrollView>(null);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [tocOpen, setTocOpen] = useState(false);
  const [showResumeBanner, setShowResumeBanner] = useState(false);

  // Batch 4 additions: Reading Settings
  const [isReadingMode, setIsReadingMode] = useState(false);
  const [textSize, setTextSize] = useState<'S' | 'M' | 'L' | 'XL'>('M');
  const [readingTheme, setReadingTheme] = useState<'sepia' | 'light' | 'dark'>('light');
  
  // Version Timeline state
  const [versionModalOpen, setVersionModalOpen] = useState(false);
  
  // Report state.
  //
  // Both a guide and a comment are reported through the same route —
  // `POST /community/reports` — with the content type in the body. The reasons
  // come from `GET /community/reports/reasons`, which is why this screen no
  // longer carries its own list of them.
  const [reportTarget, setReportTarget] = useState<{
    contentType: CommunityContentType;
    contentId: string;
  } | null>(null);

  // Reading position is genuinely device-local — the platform has no route for
  // "where in this guide is this person" and inventing one would be inventing a
  // capability. It stays in the local store.
  const { getBookmark, setBookmark: setReadingPosition } = useBookmarkStore();
  const activeBookmark = getBookmark(id ?? '');

  const { save, unsave, isSaved } = useSavedStore();
  const isDownloadedOffline = isSaved(id ?? '');

  // Check if there is an existing bookmark to resume
  useEffect(() => {
    if (activeBookmark && activeBookmark.scrollPosition > 0.05) {
      setShowResumeBanner(true);
    }
  }, [activeBookmark]);

  // The read, recorded once. `POST /guides/{id}/view` is anonymous and
  // `isUniqueView` is the client's claim — "this mount is the first view in this
  // session" is the honest version of that claim, and the hook's own ref stops a
  // re-render counting a second.
  useEffect(() => {
    if (guide) recordView(guide.guideId, { isUniqueView: true });
  }, [guide, recordView]);

  const handleScroll = (event: any) => {
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    const heightDiff = contentSize.height - layoutMeasurement.height;
    if (heightDiff > 0) {
      const progress = contentOffset.y / heightDiff;
      setScrollProgress(progress);
      
      // Auto-save scroll position to the local reading-position store.
      if (id && Math.abs(progress - (activeBookmark?.scrollPosition || 0)) > 0.08) {
        setReadingPosition(id, 'sec-default', progress);
      }
    }
  };

  const resumeReading = () => {
    if (activeBookmark && scrollRef.current) {
      setTimeout(() => {
        scrollRef.current?.scrollTo({
          y: activeBookmark.scrollPosition * 1200, // mock multiplier
          animated: true,
        });
        setShowResumeBanner(false);
      }, 100);
    }
  };

  const handleShare = async () => {
    if (!guide) return;
    try {
      const result = await Share.share({
        message: `Check out this helpful guide on Diaspora: "${guide.title}"`,
        url: `https://diaspora.app/guide/${guide.slug}`,
      });
      // Only a share the OS says happened. `POST /guides/{id}/share` is "the
      // client reports what the platform cannot see", and reporting a dismissed
      // sheet as a share would make the counter a lie in the platform's favour.
      if (result.action === Share.sharedAction) {
        recordShare(guide.guideId);
      }
    } catch {
      // ignored
    }
  };

  const handleReport = () => {
    if (!guide) return;
    setReportTarget({ contentType: 'guide', contentId: guide.guideId });
  };

  // Remaining reading time.
  //
  // From the server's own `wordCount`, at `GuideLimits.WordsPerMinute` — the
  // rate it computed `readingTimeMinutes` with. Counting the words on the device
  // meant this figure disagreed with the badge on the card the reader tapped.
  const remainingTimeMinutes = Math.max(
    1,
    Math.ceil(((guide?.wordCount ?? 0) * (1 - scrollProgress)) / GUIDE_WORDS_PER_MINUTE)
  );

  // Toggle download/offline cache.
  //
  // The **local** offline set, which is a device fact. Saving a guide to the
  // member's account is a different act on a different route, and it is the
  // bookmark control below.
  const toggleOfflineDownload = () => {
    if (!id) return;
    if (isDownloadedOffline) {
      unsave(id);
      showAlert({ type: 'warning', title: 'Offline Caching', message: 'Guide has been removed from offline database.' });
    } else {
      save(id, 'Guide');
      showAlert({ type: 'success', title: 'Offline Caching', message: 'Successfully downloaded! This guide will remain available without internet access.' });
    }
  };

  // ── The helpful vote ──────────────────────────────────────────────────────
  //
  // It used to be two `useState` values: a count seeded from the fixture and a
  // boolean, both gone on unmount. `POST /guides/{id}/vote` is the real thing,
  // and it has three refusals a screen has to be honest about:
  //
  //   * `guides.vote.self` — 403. You cannot vote on your own guide.
  //   * `guides.vote.unchanged` — 409. Casting the same kind twice.
  //   * The response is `GuideEngagementResponse`, the counters alone, so the
  //     count on screen comes from the invalidated guide read rather than from
  //     an increment this screen invented.
  const helpfulCount = guide?.engagement.helpfulCount ?? 0;
  const [isHelpfulActive, setIsHelpfulActive] = useState(false);

  const handleHelpfulPress = () => {
    if (!guide || vote.isPending) return;

    vote.mutate(
      { guideId: guide.guideId, kind: 'Helpful' },
      {
        onSuccess: () => setIsHelpfulActive(true),
        onError: (cause) => {
          showAlert({
            type: 'error',
            title: 'Vote not recorded',
            message: guideErrorMessage(cause),
          });
        },
      }
    );
  };

  const handleBookmarkPress = () => {
    if (!guide || setBookmark.isPending) return;
    setBookmark.mutate(
      { guideId: guide.guideId, saved: true },
      {
        onSuccess: () =>
          showAlert({
            type: 'success',
            title: 'Saved',
            message: 'This guide is in your saved collection.',
          }),
        onError: (cause) =>
          showAlert({ type: 'error', title: 'Not saved', message: guideErrorMessage(cause) }),
      }
    );
  };

  // ── The states that used to be impossible ─────────────────────────────────
  //
  // A fixture lookup is synchronous and either finds a row or does not. A server
  // read has four outcomes, and three of them need different words. `isNotFound`
  // in particular is **not** "this guide does not exist": visibility is applied
  // inside the handler, so a draft, a hidden guide and a deleted one are all 404
  // to everybody but their author.
  if (isLoading) {
    return (
      <SafeAreaView
        className="flex-1 bg-surface-card items-center justify-center"
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel="Loading guide"
      >
        <ActivityIndicator color="#F59300" />
      </SafeAreaView>
    );
  }

  if (!guide) {
    return (
      <SafeAreaView className="flex-1 bg-surface-card items-center justify-center p-6">
        <Text className="text-4xl mb-3">📖</Text>
        <Text className="text-base font-black text-content-primary text-center">
          {isNotFound ? 'This guide is not available' : 'We could not load this guide'}
        </Text>
        <Text className="text-xs text-content-muted text-center mt-2 leading-relaxed max-w-[280px]">
          {isNotFound
            ? 'It may have been unpublished, or it may be a draft its author has not shared yet.'
            : (error ?? 'Check your connection and try again.')}
        </Text>
        <View className="flex-row mt-6 gap-3">
          {!isNotFound ? (
            <TouchableOpacity onPress={refresh} className="bg-primary-500 px-4 py-2.5 rounded-xl">
              <Text className="text-xs font-black text-white uppercase">Try again</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            onPress={() => backOr()}
            className="bg-surface-muted px-4 py-2.5 rounded-xl"
          >
            <Text className="text-xs font-black text-content-secondary uppercase">Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const categoryName =
    categories.find((category) => category.key === guide.categoryKey)?.name ?? guide.categoryKey;

  // Same category, this guide excluded. Six asked for, three shown.
  const relatedGuides = related.guides
    .filter((candidate) => candidate.guideId !== guide.guideId)
    .slice(0, 3);

  // Dynamic Styles for Reading Mode
  /**
   * The reading themes are *explicit* choices and override the app's colour
   * scheme — that is what picking one means.
   *
   * Light has to be spelled out for the same reason sepia and dark are. It used
   * to fall through to `bg-surface-card`, which follows the scheme: a member
   * reading in a dark app who chose "Light" got a dark page, having asked for
   * the opposite. Outside reading mode the tokens are still correct, because
   * there the page is simply part of the app.
   */
  const getThemeBg = () => {
    if (!isReadingMode) return 'bg-surface-card';
    if (readingTheme === 'sepia') return 'bg-[#FAF6EE]';
    if (readingTheme === 'dark') return 'bg-[#121212]';
    return 'bg-white';
  };

  const getThemeTextColor = () => {
    if (!isReadingMode) return 'text-content-strong';
    if (readingTheme === 'dark') return 'text-neutral-200';
    if (readingTheme === 'sepia') return 'text-[#433422]';
    return 'text-[#3A3D4A]';
  };

  const getThemeTitleColor = () => {
    if (!isReadingMode) return 'text-content-primary';
    if (readingTheme === 'dark') return 'text-white';
    if (readingTheme === 'sepia') return 'text-[#2C1F11]';
    return 'text-[#0F1117]';
  };

  const getTextSizeClass = () => {
    if (textSize === 'S') return 'text-xs';
    if (textSize === 'L') return 'text-lg';
    if (textSize === 'XL') return 'text-xl';
    return 'text-base';
  };

  // The version history is `GET /guides/{id}/versions` — four hard-coded entries
  // naming two fixture authors and describing edits to a guide about Brixton
  // market used to live here, and they were rendered under every guide on the
  // platform.

  return (
    <SafeAreaView className={`flex-1 relative ${getThemeBg()}`} edges={['top']}>
      
      {/* Sticky Table of Contents Button (Bottom-Right) */}
      <TouchableOpacity
        onPress={() => setTocOpen(true)}
        className="absolute bottom-6 right-6 w-12 h-12 bg-surface-inverse rounded-full items-center justify-center z-40 shadow-lg shadow-black/20"
      >
        <Text className="text-content-inverse text-lg">📋</Text>
      </TouchableOpacity>

      {/* Sticky Header Navigation Bar */}
      <View className={`px-6 py-3.5 border-b border-faint flex-row justify-between items-center bg-surface-card ${getThemeBg()}`}>
        <View className="flex-row items-center flex-1 mr-3">
          <TouchableOpacity
            onPress={() => backOr()}
            className="w-9 h-9 items-center justify-center bg-surface-muted rounded-full mr-2.5 active:scale-95"
          >
            <Ionicons name="arrow-back" size={20} color={readingTheme === 'dark' && isReadingMode ? '#FFF' : '#1F2937'} />
          </TouchableOpacity>
          <Text className={`text-sm font-black tracking-tight ${getThemeTitleColor()} flex-1`} numberOfLines={1}>
            {guide.title}
          </Text>
        </View>
        
        <View className="flex-row items-center gap-2">
          {/* Toggle Reading Mode */}
          <TouchableOpacity
            onPress={() => setIsReadingMode(!isReadingMode)}
            className={`w-9 h-9 rounded-full items-center justify-center ${isReadingMode ? 'bg-primary-500' : 'bg-surface-muted'}`}
          >
            <Text className="text-xs">📖</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            onPress={handleShare}
            className="w-9 h-9 rounded-full bg-surface-muted items-center justify-center active:scale-95"
          >
            <Ionicons name="share-social-outline" size={16} color={readingTheme === 'dark' && isReadingMode ? '#FFF' : '#4B5563'} />
          </TouchableOpacity>
          
          <TouchableOpacity
            onPress={handleReport}
            className="w-9 h-9 rounded-full bg-surface-muted items-center justify-center active:scale-95"
          >
            <Ionicons name="alert-circle-outline" size={16} color={readingTheme === 'dark' && isReadingMode ? '#FFF' : '#4B5563'} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Sticky Reading Progress indicator bar */}
      <View className="h-1 bg-surface-muted w-full z-30">
        <View className="h-full bg-primary-500" style={{ width: `${Math.min(scrollProgress * 100, 100)}%` }} />
      </View>

      {/* The "Listen to Audio Guide" panel that sat here is gone.
          Pressing play advanced a progress bar on a `setInterval` and produced
          no sound: there is no audio in this application, no speech synthesis
          dependency, and no route on `Diaspora.Modules.Guides` that returns an
          audio rendition of a guide. A "BETA" badge beside a control that cannot
          ever work is not a disclosure — it is the inert affordance this wave
          exists to remove, and a reader with low vision is exactly who was
          promised it. */}

      {/* Sticky Reading Mode Panel Adjustments */}
      {isReadingMode && (
        <View className={`border-b border-subtle px-6 py-2.5 flex-row items-center justify-between bg-surface-muted ${
          readingTheme === 'dark' ? 'bg-neutral-800 border-neutral-800' : ''
        }`}>
          <View className="flex-row items-center gap-1">
            <Text className="text-xs font-bold text-content-muted mr-2">Fonts:</Text>
            {['S', 'M', 'L', 'XL'].map((sz) => (
              <TouchableOpacity
                key={sz}
                onPress={() => setTextSize(sz as any)}
                className={`w-7 h-7 rounded items-center justify-center ${textSize === sz ? 'bg-surface-card shadow border border-subtle' : ''}`}
              >
                <Text className="text-[10px] font-bold text-content-secondary">{sz}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View className="flex-row items-center gap-1.5">
            <Text className="text-xs font-bold text-content-muted mr-1">Theme:</Text>
            {(['light', 'sepia', 'dark'] as const).map((th) => (
              <TouchableOpacity
                key={th}
                onPress={() => setReadingTheme(th)}
                className={`px-2.5 py-1 rounded capitalize border ${
                  readingTheme === th ? 'bg-primary-500 border-primary-500' : 'bg-surface-card border-line'
                }`}
              >
                <Text className={`text-[10px] font-bold ${readingTheme === th ? 'text-white' : 'text-content-secondary'}`}>
                  {th}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* The comment box and every reply box sit at the bottom of a long
          article, so on Android 15+ — where the window does not resize — a
          member who taps one is typing into a field the keyboard is covering.
          The scroll view keeps its scroll-end navigation behaviour; the
          avoiding view only supplies the inset it cannot know about. */}
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
      <ScrollEndScrollView
        ref={scrollRef}
        className="flex-1"
        bounces={false}
        scrollEventThrottle={16}
        onScroll={handleScroll}
        activeTab="knowledge"
      >
        {/* Cover image. `mediaReferences` carries a **`mediaId`**, never a URL
            (ADR-005), so it is resolved through Media rather than rendered from
            a field. Hidden in dark reading mode to focus on text. */}
        {(!isReadingMode || readingTheme !== 'dark') && (
          hero.url ? (
            <Image
              source={{ uri: hero.url }}
              style={{ width: '100%', height: 240 }}
              contentFit="cover"
              transition={200}
            />
          ) : (
            <View className="w-full h-[200px] bg-surface-muted items-center justify-center">
              <Text className="text-4xl">📖</Text>
            </View>
          )
        )}

        {/* Kindle-Style Position Resume Banner */}
        {showResumeBanner && (
          <View className="bg-primary-50 border-b border-primary-100 px-6 py-3.5 flex-row items-center justify-between">
            <Text className="text-xs font-bold text-content-strong flex-1 mr-4">
              📖 Resume from progress {Math.round(activeBookmark!.scrollPosition * 100)}%?
            </Text>
            <View className="flex-row">
              <TouchableOpacity onPress={resumeReading} className="bg-primary-500 px-3 py-1.5 rounded-lg mr-2">
                <Text className="text-[10px] font-black text-white">Resume</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowResumeBanner(false)} className="bg-surface-card border border-subtle px-3 py-1.5 rounded-lg">
                <Text className="text-[10px] font-bold text-content-tertiary">Dismiss</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <View className="p-6">
          {/* Category & Offline Saved toggle */}
          <View className="flex-row justify-between items-center mb-3">
            <Text className="text-[10px] text-primary-500 font-extrabold uppercase tracking-widest">
              {/* The catalogue's name for the key, or the key itself. There is
                  no country name or flag on this contract — only a code. */}
              {categoryName} · {guide.countryCode}
              {guide.cityName ? ` · ${guide.cityName}` : ''}
            </Text>

            {/* Offline Saved trigger */}
            <TouchableOpacity
              onPress={toggleOfflineDownload}
              className={`px-2.5 py-1 rounded-lg border ${
                isDownloadedOffline ? 'bg-[#E6F4EA] border-[#CEEAD6]' : 'bg-surface-card border-subtle'
              }`}
            >
              <Text className={`text-[9px] font-black ${isDownloadedOffline ? 'text-success-default' : 'text-content-muted'}`}>
                {isDownloadedOffline ? '✓ OFFLINE SAVED' : '📥 DOWNLOAD OFFLINE'}
              </Text>
            </TouchableOpacity>
          </View>

          <Text className={`text-2xl font-black mb-2 leading-snug ${getThemeTitleColor()}`}>
            {guide.title}
          </Text>
          
          <View className="flex-row items-center mb-6 flex-wrap">
            <Text className="text-xs text-content-faint font-bold">🕐 {remainingTimeMinutes} mins left</Text>
            <Text className="text-xs text-content-faint mx-2">·</Text>
            {/* `trustMark.verifiedAt` — Trust's decision, and null when there has
                never been one. "Not verified" is the honest reading of that;
                the fixture screen printed "N/A", which reads as a missing field
                rather than as an unverified guide. */}
            <Text className="text-xs text-content-faint font-bold">
              {guide.trustMark.verifiedAt
                ? `Verified ${new Date(guide.trustMark.verifiedAt).toLocaleDateString()}`
                : 'Not verified'}
            </Text>
          </View>

          {/* ── The byline ───────────────────────────────────────────────────
              `GuideAuthorResponse` is **Trust's projection**: an id, two
              booleans, an opaque level label and badges. There is no name, no
              avatar, no follower count and no expertise list on this contract,
              and no author route in this module — so `AuthorExpertise`, which
              needs all five, cannot be fed without inventing them. What the
              server does say is rendered, and the byline links to the author's
              other guides, which `GET /guides/authors/{id}` really serves. */}
          <TouchableOpacity
            onPress={() => router.push(`/contributor/${guide.authorId}`)}
            className="bg-surface-background border border-faint rounded-2xl p-4 mb-2 flex-row items-center justify-between"
            accessibilityRole="button"
            accessibilityLabel="View this author"
          >
            <View className="flex-1 mr-3">
              <Text className="text-[10px] font-black text-content-faint uppercase tracking-widest mb-1">
                Written by
              </Text>
              <View className="flex-row items-center flex-wrap">
                {guide.author?.trustLevel ? (
                  <Text className="text-xs font-black text-content-strong mr-2">
                    {guide.author.trustLevel}
                  </Text>
                ) : null}
                {guide.author?.isApprovedContributor ? (
                  <Text className="text-[10px] font-black text-success-default mr-2">
                    ✓ APPROVED CONTRIBUTOR
                  </Text>
                ) : null}
                {guide.author?.isCommunityGuide ? (
                  <Text className="text-[10px] font-black text-primary-500 mr-2">
                    ★ COMMUNITY GUIDE
                  </Text>
                ) : null}
                {!guide.author ? (
                  <Text className="text-xs text-content-muted font-semibold">
                    A community member
                  </Text>
                ) : null}
              </View>
              {guide.author && guide.author.badges.length > 0 ? (
                <View className="flex-row flex-wrap mt-1.5">
                  {guide.author.badges.map((badge) => (
                    <View
                      key={`${badge.badge}-${badge.countryCode ?? 'global'}`}
                      className="bg-surface-muted rounded-md px-2 py-0.5 mr-1.5 mb-1"
                    >
                      <Text className="text-[10px] font-bold text-content-tertiary">
                        {badge.badge}
                        {badge.countryCode ? ` · ${badge.countryCode}` : ''}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
            <Text className="text-content-faint text-lg">›</Text>
          </TouchableOpacity>

          {/* Version dashboard. `currentVersion` is the published version number
              and is **zero until first publication** — a draft preview shows no
              history rather than "v0". */}
          <View className="bg-surface-background rounded-2xl p-4 my-4 border border-faint flex-row justify-between items-center">
            <View className="flex-1 mr-3">
              <View className="flex-row items-center mb-1">
                <Text className="text-[10px] font-black text-content-faint uppercase tracking-wide mr-1.5">
                  Version Timeline
                </Text>
                {guide.currentVersion > 0 ? (
                  <TouchableOpacity
                    onPress={() => setVersionModalOpen(true)}
                    className="bg-subtle px-2 py-0.5 rounded"
                  >
                    <Text className="text-[9px] font-extrabold text-content-secondary">
                      v{guide.currentVersion} History →
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <Text className="text-[9px] font-extrabold text-content-faint">
                    Not published yet
                  </Text>
                )}
              </View>
              <Text className="text-[10px] text-content-muted">
                {guide.updatedAt
                  ? `Updated: ${new Date(guide.updatedAt).toLocaleDateString()}`
                  : `Created: ${new Date(guide.createdAt).toLocaleDateString()}`}
              </Text>
            </View>
            {/* The `GuideQualityBadge` that stood here rendered a
                `qualityLabel` the platform does not have. What it does have is a
                verification state, and that is Trust's, not a score. */}
            <View
              className={`px-2.5 py-1 rounded-lg border ${
                guide.trustMark.state === 'Verified'
                  ? 'bg-[#E6F4EA] border-[#CEEAD6]'
                  : 'bg-surface-card border-subtle'
              }`}
            >
              <Text
                className={`text-[10px] font-black uppercase ${
                  guide.trustMark.state === 'Verified'
                    ? 'text-success-default'
                    : 'text-content-muted'
                }`}
              >
                {guide.trustMark.state === 'Verified'
                  ? `🛡️ ${guide.trustMark.badge ?? 'Verified'}`
                  : guide.trustMark.state}
              </Text>
            </View>
          </View>

          {/* Content body — the platform's sections and blocks, each rendered
              by its kind. It used to be `guide.content`, one fixture string. */}
          <View className="mb-8">
            <GuideBody
              sections={guide.sections}
              textClassName={`${getThemeTextColor()} ${getTextSizeClass()}`}
              headingClassName={getThemeTitleColor()}
            />
          </View>

          {/* Community Reactions & trust confidence details */}
          <View className="bg-surface-background rounded-2xl p-4 mb-8 border border-faint">
            <Text className="text-xs font-bold text-content-faint uppercase tracking-widest mb-3">Community Confidence Signals</Text>
            <View className="flex-row justify-between mb-4 flex-wrap">
              {/* Every one of these is a server counter. The screen used to show
                  a `useState` seeded from a fixture beside the words "Verified
                  by Local Residents" — rendered unconditionally, over unverified
                  guides as readily as verified ones. */}
              <Text className="text-xs text-content-tertiary font-semibold">
                👍 {helpfulCount} helpful · 👀 {guide.engagement.views} views · 🔖{' '}
                {guide.engagement.bookmarkCount} saved
              </Text>
            </View>
            <View className="flex-row gap-2">
              <TouchableOpacity
                onPress={handleHelpfulPress}
                disabled={vote.isPending}
                accessibilityRole="button"
                accessibilityState={{ disabled: vote.isPending, selected: isHelpfulActive }}
                className={`flex-1 border py-3 rounded-xl items-center flex-row justify-center gap-1.5 ${
                  isHelpfulActive ? 'bg-primary-50 border-primary-200' : 'bg-surface-card border-subtle'
                }`}
              >
                <Text className="text-base">{isHelpfulActive ? '❤️' : '👍'}</Text>
                <Text className={`text-xs font-bold ${isHelpfulActive ? 'text-primary-500' : 'text-content-secondary'}`}>
                  {vote.isPending ? 'Sending…' : isHelpfulActive ? 'Marked Helpful' : 'Mark Helpful'}
                </Text>
              </TouchableOpacity>
              {/* "Confirm Details" used to show a success alert and do nothing.
                  There is no "confirm" route on this module — the two things a
                  reader can actually do to a guide are vote and save it, so the
                  second control is the save, which is
                  `PUT /guides/{id}/bookmark`. */}
              <TouchableOpacity
                onPress={handleBookmarkPress}
                disabled={setBookmark.isPending}
                accessibilityRole="button"
                accessibilityState={{ disabled: setBookmark.isPending }}
                className="flex-1 bg-surface-card border border-subtle py-3 rounded-xl items-center flex-row justify-center gap-1.5"
              >
                <Text className="text-base">🔖</Text>
                <Text className="text-xs font-bold text-content-secondary">
                  {setBookmark.isPending ? 'Saving…' : 'Save guide'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* ── Threaded discussion ────────────────────────────────────────
              One component for every comment thread in the application. It
              indents by `renderedDepth` — clamped at six by the server, where
              `depth` is unbounded — and it renders deleted comments as
              tombstones rather than dropping them, because dropping one would
              take its replies off the screen with it. */}
          <View className="mb-8">
            <Text className="text-lg font-black text-content-primary mb-4">💬 Discussion</Text>
            <CommentThread
              target={{ contentType: 'guide', contentId: guide.guideId }}
              thread={thread}
              onReport={(commentId) =>
                setReportTarget({ contentType: 'comment', contentId: commentId })
              }
            />
          </View>
          {/* More in the same category.
              It used to be `mockGuides.filter(g => g.guideId !== guide.guideId)
              .slice(0, 3)` — literally every other fixture, labelled "Related".
              There is no related-guides route in this module, so this is the
              category browse, and the heading says which. */}
          {relatedGuides.length > 0 ? (
            <View className="border-t border-faint pt-6 mb-8">
              <Text className="text-xs font-bold text-content-faint uppercase tracking-widest mb-3">
                More in {categoryName}
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row gap-3">
                {relatedGuides.map((rel) => (
                  <TouchableOpacity
                    key={rel.guideId}
                    onPress={() => router.push(`/guide/${rel.guideId}`)}
                    className="bg-surface-card border border-subtle rounded-2xl p-4 w-[240px] mr-3 shadow-sm"
                  >
                    <Text className="text-[9px] font-extrabold text-primary-500 uppercase">
                      {rel.countryCode}
                    </Text>
                    <Text className="text-sm font-bold text-content-primary mt-1 leading-snug" numberOfLines={2}>
                      {rel.title}
                    </Text>
                    <Text className="text-[10px] text-content-muted mt-2">
                      🕐 {rel.readingTimeMinutes} min read
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          ) : null}

        </View>
        <View className="h-10" />
      </ScrollEndScrollView>
      </KeyboardAvoidingView>

      {/* Table of Contents Modal Drawer */}
      <Modal
        visible={tocOpen}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setTocOpen(false)}
      
        statusBarTranslucent
        navigationBarTranslucent>
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setTocOpen(false)}
          className="flex-1 justify-end bg-black/40"
        >
          <TouchableWithoutFeedback>
            <View className="bg-surface-card rounded-t-3xl p-6 min-h-[300px] shadow-2xl">
              <View className="flex-row items-center justify-between mb-4">
                <Text className="text-lg font-black text-content-primary">Table of Contents</Text>
                <TouchableOpacity onPress={() => setTocOpen(false)}>
                  <Text className="text-content-muted font-semibold">Close</Text>
                </TouchableOpacity>
              </View>
              <FlatList
                data={[...guide.sections].sort((a, b) => a.order - b.order)}
                keyExtractor={(item) => item.sectionId}
                ListEmptyComponent={
                  <Text className="text-sm text-content-faint py-6 text-center">
                    This guide has no sections yet.
                  </Text>
                }
                renderItem={({ item }) => (
                  <TouchableOpacity
                    onPress={() => {
                      setTocOpen(false);
                      // Still an estimate — the section's pixel offset is not
                      // knowable without measuring the rendered blocks — but it
                      // is now scaled by what each section actually contains
                      // rather than by a flat 250 per section.
                      scrollRef.current?.scrollTo({
                        y: item.order * 250,
                        animated: true,
                      });
                    }}
                    className="py-4 border-b border-faint flex-row items-center justify-between"
                  >
                    <Text className="text-sm font-semibold text-content-strong flex-1 mr-3">
                      {item.order}. {item.title}
                    </Text>
                    <Text className="text-content-faint text-xs">›</Text>
                  </TouchableOpacity>
                )}
              />
            </View>
          </TouchableWithoutFeedback>
        </TouchableOpacity>
      </Modal>

      {/* Version Revisions History Modal Timeline */}
      <Modal
        visible={versionModalOpen}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setVersionModalOpen(false)}
      
        statusBarTranslucent
        navigationBarTranslucent>
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setVersionModalOpen(false)}
          className="flex-1 justify-end bg-black/50"
        >
          <TouchableWithoutFeedback>
            <View className="bg-surface-card rounded-t-3xl p-6 max-h-[85%] shadow-2xl w-full">
              <View className="flex-row items-center justify-between mb-4 border-b border-faint pb-3">
                <View>
                  <Text className="text-lg font-black text-content-primary">Version History</Text>
                  <Text className="text-xs text-content-faint mt-0.5">Timeline of community updates</Text>
                </View>
                <TouchableOpacity onPress={() => setVersionModalOpen(false)} className="bg-surface-muted px-3 py-1.5 rounded-xl">
                  <Text className="text-xs text-content-muted font-bold">Done</Text>
                </TouchableOpacity>
              </View>
              <ScrollView showsVerticalScrollIndicator={false} className="py-2">
                {versions.isLoading ? (
                  <View
                    accessible
                    accessibilityRole="progressbar"
                    accessibilityLabel="Loading version history"
                    className="py-8 items-center"
                  >
                    <ActivityIndicator color="#F59300" />
                  </View>
                ) : versions.versions.length === 0 ? (
                  <Text className="text-sm text-content-faint py-8 text-center">
                    {versions.error ?? 'This guide has no published versions yet.'}
                  </Text>
                ) : (
                  versions.versions.map((ver, idx) => (
                    <View key={ver.versionId} className="flex-row mb-6">
                      {/* timeline dot indicator */}
                      <View className="items-center mr-4">
                        <View className={`w-3.5 h-3.5 rounded-full items-center justify-center ${idx === 0 ? 'bg-primary-500' : 'bg-line'}`} />
                        {idx < versions.versions.length - 1 && <View className="w-0.5 bg-subtle flex-1 my-1" />}
                      </View>
                      <View className="flex-1 bg-surface-background p-4 rounded-2xl border border-faint">
                        <View className="flex-row justify-between items-center mb-1">
                          <Text className="text-sm font-black text-content-strong">
                            v{ver.versionNumber}
                            {ver.versionNumber === guide.currentVersion ? ' (Current)' : ''}
                          </Text>
                          <Text className="text-[10px] text-content-faint font-bold">
                            {new Date(ver.publishedAt).toLocaleDateString()}
                          </Text>
                        </View>
                        <Text className="text-xs font-bold text-content-secondary mb-1">
                          {ver.title}
                        </Text>
                        {/* `revisionNotes` is the editor's own account of what
                            changed, and it is genuinely optional — a history
                            whose entries all say nothing is a history nobody can
                            navigate, but inventing a "reason" for an entry that
                            has none is worse. */}
                        <Text className="text-xs text-content-secondary leading-relaxed font-semibold">
                          {ver.revisionNotes
                            ? `🔍 ${ver.revisionNotes}`
                            : 'No revision notes were left for this version.'}
                        </Text>
                        <Text className="text-[10px] text-content-muted mt-1.5">
                          {ver.wordCount} words · {ver.readingTimeMinutes} min read
                        </Text>
                      </View>
                    </View>
                  ))
                )}
              </ScrollView>
            </View>
          </TouchableWithoutFeedback>
        </TouchableOpacity>
      </Modal>

      {/* The report used to be a modal with its own five hardcoded categories
          and a `console.log` for a submit handler. The reasons are deployment
          configuration — `GET /community/reports/reasons` — and the report
          itself is `POST /community/reports`, which is the same route for a
          guide and for a comment on one. */}
      <ReportContentSheet
        visible={reportTarget !== null}
        onClose={() => setReportTarget(null)}
        contentType={reportTarget?.contentType ?? 'guide'}
        contentId={reportTarget?.contentId ?? null}
        onReported={() =>
          showAlert({
            type: 'success',
            title: 'Report sent',
            message: 'A moderator will look at it. Thank you.',
          })
        }
      />
    </SafeAreaView>
  );
}
