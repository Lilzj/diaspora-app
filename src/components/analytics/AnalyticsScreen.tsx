// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Analytics screen shell (Frontend Phase 15, §38 · §40 · §46)
//
// Every analytics screen is the same six things in the same order: a themed
// header, an access check, a build check, an error state, the provenance strip,
// and the content. Doing that once here rather than twenty-odd times has three
// consequences that matter more than the saved lines — the same three
// `CreatorScreen` found in Phase 7, plus one specific to this phase:
//
//   **Dark mode actually works.** The shared `<ScreenHeader>` is hard-coded
//   `bg-surface-card`. This shell draws its own header from tokens.
//
//   **A refusal cannot be forgotten.** The access refusal and the release-build
//   refusal are handled before the screen's own content renders, so a screen
//   cannot ship having forgotten to handle an unauthorized caller — it never gets
//   the chance to render for one.
//
//   **The provenance strip is where the data is.** §37 and §38 require the status
//   and the freshness to be visible with the figures; passing the dataset to the
//   shell puts them directly above it, every time, in the same place.
//
//   **And the one new to Phase 15: a screen cannot render a dataset without its
//   status.** `<AnalyticsScreen>` takes the dataset, not a boolean — so there is
//   no arrangement of props that yields figures with no marker.
//
// ── §40, and what "mobile-first" costs here ──────────────────────────────────
//
// The sticky area holds the range and comparison pickers, and it is deliberately
// *outside* the scroll view. On a long dashboard the alternative is scrolling
// back to the top to change the period, which on a 90-row cohort table is a
// genuinely bad experience. The cost is vertical space on a small phone, which is
// why the sticky area is a single scrolling chip row rather than a panel.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/design-system';
import { FinancialErrorView } from '@/components/financial';
import type { FinancialError } from '@/lib/financial-errors';
import type { AnalyticsDataset } from '@/types/analytics';
import type { AnalyticsVerdict } from '@/lib/analytics/access';
import { AnalyticsGapUnavailable, AnalyticsProvenanceHeader, hasSuppressedMetrics } from './AnalyticsNotices';
import { AnalyticsRefusal, AnalyticsSkeleton } from './AnalyticsPrimitives';
import { useBottomInset } from '@/components/layout/bottom-inset';
import { ScrollEndScrollView } from '@/components/ScrollEndNavigationMenu';

/** A themed header. Tokens rather than `bg-surface-card`, so dark mode is real. */
export function AnalyticsHeader({
  title,
  subtitle,
  showBack = true,
  onBack,
  right,
}: {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  onBack?: () => void;
  right?: React.ReactNode;
}) {
  const { tokens } = useTheme();

  return (
    <View
      style={{
        backgroundColor: tokens.color.surface.card,
        borderBottomColor: tokens.color.border.default,
      }}
      className="flex-row items-center border-b px-2 py-2.5"
    >
      {showBack ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={onBack ?? (() => router.back())}
          hitSlop={8}
          className="w-11 h-11 items-center justify-center"
        >
          <Ionicons name="chevron-back" size={24} color={tokens.color.text.primary} />
        </Pressable>
      ) : (
        <View className="w-3" />
      )}

      <View className="flex-1 mx-1">
        <Text
          accessibilityRole="header"
          style={{ color: tokens.color.text.primary }}
          className="text-base font-black tracking-tight"
          numberOfLines={1}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text
            style={{ color: tokens.color.text.placeholder }}
            className="text-[11px] font-semibold"
            numberOfLines={1}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>

      {right ?? <View className="w-11" />}
    </View>
  );
}

export interface AnalyticsScreenProps {
  title: string;
  /** Raise the shared navigation bar at the end of the content. */
  scrollEndNavigation?: boolean;
  subtitle?: string;
  /**
   * The dataset. Required rather than optional, and that is the point — a screen
   * cannot render figures without the object that carries their status.
   */
  dataset: AnalyticsDataset | null;
  /** The access decision. A refusal replaces the content. */
  verdict?: AnalyticsVerdict;
  /** Whether this build can reach the data at all. */
  isEnabled?: boolean;
  /** The gap key for the release-build refusal. */
  gapKey?: string;
  /** Overrides the gap notice's default sentence. */
  gapDetail?: string;
  /** §58's sentence, from the range. */
  timezoneNote?: string | null;
  isLoading?: boolean;
  isRefreshing?: boolean;
  error?: FinancialError | null;
  onRetry?: () => void;
  onRefresh?: () => void;
  headerRight?: React.ReactNode;
  showBack?: boolean;
  /** Rendered outside the scroll view, pinned under the header. */
  sticky?: React.ReactNode;
  children: React.ReactNode;
}

export function AnalyticsScreen({
  title,
  subtitle,
  dataset,
  verdict,
  isEnabled = true,
  gapKey,
  gapDetail,
  timezoneNote,
  isLoading = false,
  isRefreshing = false,
  error = null,
  onRetry,
  onRefresh,
  headerRight,
  scrollEndNavigation,
  showBack = true,
  sticky,
  children,
}: AnalyticsScreenProps) {
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();
  const bottomInset = useBottomInset({ gutter: 40 });
  // §2 — the shared navigation bar at the end of the content. Same reasoning as
  // `community/CommunityScreen`. This wrapper pins nothing at the bottom, so
  // there is no footer to compete with.
  const Body = scrollEndNavigation !== false ? ScrollEndScrollView : ScrollView;


  const frame = (content: React.ReactNode) => (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: tokens.color.surface.background }}
      edges={['top', 'left', 'right']}
    >
      <AnalyticsHeader title={title} subtitle={subtitle} showBack={showBack} right={headerRight} />
      {content}
    </SafeAreaView>
  );

  // A release build cannot reach the data. Not an error — a statement.
  if (!isEnabled && gapKey) {
    return frame(<AnalyticsGapUnavailable gapKey={gapKey} />);
  }

  // Hidden means render nothing at all — not a locked card. §46: a disabled
  // "Platform analytics" row tells a member that an administrative dashboard
  // exists and that somebody can see it.
  if (verdict?.kind === 'hidden') {
    return frame(
      <AnalyticsRefusal detail="You do not have access to this report. If you think you should, ask whoever manages this on Diaspora." />
    );
  }

  if (verdict?.kind === 'blocked') {
    return frame(
      <AnalyticsRefusal
        detail={verdict.detail}
        action={verdict.action}
        onAction={
          verdict.action === 'upgrade'
            ? () => router.push('/monetization/plans')
            : verdict.action === 'sign-in'
              ? () => router.push('/(auth)/login')
              : undefined
        }
      />
    );
  }

  if (error) {
    return frame(<FinancialErrorView error={error} onRetry={onRetry} />);
  }

  return frame(
    <>
      {sticky ? (
        <View
          style={{
            backgroundColor: tokens.color.surface.card,
            borderBottomColor: tokens.color.border.default,
          }}
          className="border-b px-5 py-3"
        >
          {sticky}
        </View>
      ) : null}

      <Body
        showsVerticalScrollIndicator={false}
        // The analytics surfaces carry date-range and definition search
        // fields; without this their first tap only dismisses the keyboard.
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: bottomInset }}
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={onRefresh}
              tintColor={tokens.color.primary[500]}
            />
          ) : undefined
        }
      >
        <View className="px-5 pt-4">
          {/* The provenance strip. Above the figures, always. */}
          {dataset ? (
            <View className="mb-5">
              <AnalyticsProvenanceHeader
                status={dataset.status}
                freshness={dataset.freshness}
                gapKey={gapKey ?? dataset.gapKey}
                gapDetail={gapDetail}
                timezoneNote={timezoneNote}
                hasSuppressedMetrics={hasSuppressedMetrics(dataset.metrics)}
              />
            </View>
          ) : null}

          {isLoading ? <AnalyticsSkeleton rows={4} /> : children}
        </View>
      </Body>
    </>
  );
}

/**
 * A quiet indicator that a refetch is in flight.
 *
 * Distinct from the loading skeleton, which replaces the content. A member who
 * changed the period should keep seeing the old figures — greyed slightly —
 * rather than watching the dashboard blank and rebuild, which on a slow
 * connection reads as a crash.
 */
export function AnalyticsFetchingIndicator({ label }: { label: string }) {
  const { tokens } = useTheme();

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={`Updating ${label}`}
      className="flex-row items-center justify-center pb-3"
    >
      <ActivityIndicator size="small" color={tokens.color.primary[500]} />
      <Text
        style={{ color: tokens.color.text.placeholder }}
        className="text-[11px] font-bold ml-2"
      >
        Updating {label}…
      </Text>
    </View>
  );
}

/** The header action that opens the export sheet. */
export function ExportHeaderButton({ onPress }: { onPress: () => void }) {
  const { tokens } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Export these figures"
      onPress={onPress}
      hitSlop={8}
      className="w-11 h-11 items-center justify-center"
      style={{ marginRight: Platform.OS === 'android' ? 2 : 0 }}
    >
      <Ionicons name="download-outline" size={20} color={tokens.color.text.primary} />
    </Pressable>
  );
}
