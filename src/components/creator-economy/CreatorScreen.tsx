// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Creator screen shell (Frontend Phase 7)
//
// Every creator screen is the same five things in the same order: a themed
// header, an access check, a gap check, an error state, and the content. Doing
// that once here rather than twenty times has three consequences that matter
// more than the saved lines:
//
//   **Dark mode actually works.** The shared `<ScreenHeader>` is hard-coded
//   `bg-white`, which is fine on the surfaces it was written for and wrong on a
//   dark background. This shell draws its own header from tokens, so success
//   criterion 21 holds on every creator screen rather than on the ones somebody
//   remembered to check.
//
//   **A refusal cannot be forgotten.** The access refusal and the release-build
//   refusal are handled by the shell, before the screen's own content renders.
//   A screen cannot ship having forgotten to handle a suspended creator,
//   because it never gets the chance to render for one.
//
//   **The gap notice is where the data is.** Passing `gapKey` puts the marker
//   directly above the content it describes, every time, in the same place.
//
// The header collapses its title into the scroll on long screens? No — it does
// not, deliberately. A collapsing header animates on scroll, and a member who
// has turned on reduce-motion should not have a title moving under their thumb
// for decoration.
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
import { AccessGate, FinancialErrorView } from '@/components/financial';
import type { FinancialError } from '@/lib/financial-errors';
import type { CreatorRefusal } from '@/lib/creator-access';
import { CreatorGapNotice, CreatorGapUnavailable } from './CreatorGapNotice';

/** A themed header. Tokens rather than `bg-white`, so dark mode is real. */
export function CreatorHeader({
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

export interface CreatorScreenProps {
  title: string;
  subtitle?: string;
  /** Names the gap register entry. Renders the notice and the release refusal. */
  gapKey?: string;
  /** Overrides the notice's default sentence. */
  gapDetail?: string;
  /** Whether this build can reach the data at all. */
  isEnabled?: boolean;
  /** The access decision. A refusal replaces the content with an explanation. */
  refusal?: CreatorRefusal;
  isLoading?: boolean;
  error?: FinancialError | null;
  onRetry?: () => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  headerRight?: React.ReactNode;
  showBack?: boolean;
  /** Rendered outside the scroll view, pinned under the header. */
  sticky?: React.ReactNode;
  /** Rendered outside the scroll view, pinned to the bottom. */
  footer?: React.ReactNode;
  /** Set false where the screen supplies its own list. */
  scrollable?: boolean;
  children: React.ReactNode;
}

export function CreatorScreen({
  title,
  subtitle,
  gapKey,
  gapDetail,
  isEnabled = true,
  refusal,
  isLoading = false,
  error = null,
  onRetry,
  onRefresh,
  isRefreshing = false,
  headerRight,
  showBack = true,
  sticky,
  footer,
  scrollable = true,
  children,
}: CreatorScreenProps) {
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();

  const frame = (content: React.ReactNode) => (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: tokens.color.surface.background }}
      edges={['top', 'left', 'right']}
    >
      <CreatorHeader title={title} subtitle={subtitle} showBack={showBack} right={headerRight} />
      {content}
    </SafeAreaView>
  );

  // A release build cannot reach the data. Not an error — a statement.
  if (!isEnabled && gapKey) {
    return frame(<CreatorGapUnavailable gapKey={gapKey} />);
  }

  // The member is not allowed. Explained, with the action that would fix it.
  if (refusal && !refusal.allowed) {
    return frame(<CreatorRefusalView refusal={refusal} />);
  }

  if (error) {
    return frame(<FinancialErrorView error={error} onRetry={onRetry} />);
  }

  const body = (
    <>
      {gapKey ? (
        <View className="px-5 pt-4">
          <CreatorGapNotice gapKey={gapKey} detail={gapDetail} />
        </View>
      ) : null}

      {isLoading ? (
        <View className="py-16 items-center" accessible accessibilityLabel="Loading">
          <ActivityIndicator size="small" color={tokens.color.primary[500]} />
        </View>
      ) : (
        children
      )}
    </>
  );

  return frame(
    <>
      {sticky}

      {scrollable ? (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingBottom: insets.bottom + (footer ? 96 : 32),
          }}
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
          {body}
        </ScrollView>
      ) : (
        <View className="flex-1">{body}</View>
      )}

      {footer ? (
        <View
          style={{
            backgroundColor: tokens.color.surface.card,
            borderTopColor: tokens.color.border.default,
            paddingBottom: insets.bottom + (Platform.OS === 'android' ? 12 : 8),
          }}
          className="border-t px-5 pt-3"
        >
          {footer}
        </View>
      ) : null}
    </>
  );
}

/**
 * A refusal, in words the member can act on.
 *
 * Phase 5's `<AccessGate>` handles the four platform refusals it knows about.
 * The two creator-programme refusals are new — a suspended or restricted
 * *creator* is not the same as a suspended account — so they are rendered here
 * and everything else is delegated rather than reimplemented.
 */
function CreatorRefusalView({ refusal }: { refusal: CreatorRefusal }) {
  const { tokens } = useTheme();

  if (refusal.allowed) return null;

  if (refusal.reason !== 'creatorSuspended' && refusal.reason !== 'creatorRestricted') {
    return <AccessGate refusal={refusal} />;
  }

  const isSuspended = refusal.reason === 'creatorSuspended';

  return (
    <View className="flex-1 items-center justify-center px-8">
      <View
        style={{
          backgroundColor: isSuspended ? tokens.color.error.surface : tokens.color.warning.surface,
        }}
        className="w-16 h-16 rounded-full items-center justify-center mb-4"
      >
        <Ionicons
          name={isSuspended ? 'ban-outline' : 'alert-circle-outline'}
          size={26}
          color={isSuspended ? tokens.color.error.default : tokens.color.warning.default}
        />
      </View>

      <Text
        style={{ color: tokens.color.text.primary }}
        className="text-base font-black tracking-tight text-center"
        accessibilityRole="header"
      >
        {isSuspended ? 'Your creator account is suspended' : 'Some creator features are paused'}
      </Text>

      <Text
        style={{ color: tokens.color.text.placeholder }}
        className="text-xs font-semibold text-center mt-2 leading-relaxed"
      >
        {refusal.message}
      </Text>

      {refusal.action === 'appeal' ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open your appeals"
          onPress={() => router.push('/profile/appeals')}
          style={{ backgroundColor: tokens.color.primary[500] }}
          className="rounded-full px-5 py-3 mt-6"
        >
          <Text className="text-white text-xs font-black uppercase tracking-wider">
            Open appeals
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
