// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Community Life screen shell (Frontend Phase 12)
//
// Every Phase 12 screen is the same five things in the same order: a themed
// header, an access check, a gap check, an error state, and the content. Doing
// that once here rather than thirty times has three consequences that matter
// more than the saved lines:
//
//   **Dark mode actually works.** The shared `<ScreenHeader>` is hard-coded
//   `bg-surface-card`, which is fine on the surfaces it was written for and wrong on a
//   dark background. This shell draws its own header from tokens, so §46 holds
//   on every community screen rather than on the ones somebody remembered to
//   check.
//
//   **A refusal cannot be forgotten.** The access refusal and the release-build
//   refusal are handled by the shell, before the screen's own content renders.
//   A screen cannot ship having forgotten to handle a restricted member,
//   because it never gets the chance to render for one.
//
//   **The gap notice is where the data is.** Passing `gapKey` puts the marker
//   directly above the content it describes, every time, in the same place.
//
// §46 also asks for dynamic text sizing. Nothing here caps `maxFontSizeMultiplier`
// or fixes a height that a scaled font would overflow — the header title
// truncates rather than clipping, and every row below grows.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
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
import type { AccessRefusal } from '@/lib/financial-access';
import type { FinancialError } from '@/lib/financial-errors';
import { CommunityGapNotice, CommunityGapUnavailable } from './CommunityGapNotice';

/** A themed header. Tokens rather than `bg-surface-card`, so dark mode is real. */
export function CommunityHeader({
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

export interface CommunityScreenProps {
  title: string;
  subtitle?: string;
  /** Names the gap register entry. Renders the notice and the release refusal. */
  gapKey?: string;
  /** Overrides the notice's default sentence. */
  gapDetail?: string;
  /** Whether this build can reach the data at all. */
  isEnabled?: boolean;
  /** The access decision. A refusal replaces the content with an explanation. */
  refusal?: AccessRefusal;
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

export function CommunityScreen({
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
}: CommunityScreenProps) {
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();

  const frame = (content: React.ReactNode) => (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: tokens.color.surface.background }}
      edges={['top', 'left', 'right']}
    >
      <CommunityHeader title={title} subtitle={subtitle} showBack={showBack} right={headerRight} />
      {content}
    </SafeAreaView>
  );

  // A release build cannot reach the data. Not an error — a statement.
  if (!isEnabled && gapKey) {
    return frame(<CommunityGapUnavailable gapKey={gapKey} />);
  }

  // The member is not allowed. Explained, with the action that would fix it.
  if (refusal && !refusal.allowed) {
    return frame(<AccessGate refusal={refusal} />);
  }

  if (error) {
    return frame(<FinancialErrorView error={error} onRetry={onRetry} />);
  }

  const bodyContent = (
    <>
      {gapKey ? (
        <View className="px-5 pt-4">
          <CommunityGapNotice gapKey={gapKey} detail={gapDetail} />
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
    // The keyboard has to be handled here rather than on each screen: the
    // footer is pinned outside the scroll view, so only a wrapper that covers
    // both the body *and* the footer lifts the submit button clear of the
    // keyboard. Fifteen community forms depended on this and none had it.
    //
    // `behavior` is 'padding' on Android too: this app targets SDK 36, and
    // Android 15+ stops honouring `adjustResize` under enforced edge-to-edge,
    // so the window never resizes and the avoiding view must apply the
    // keyboard height itself. Measured on device — see F-033.
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      {sticky}

      {scrollable ? (
        <ScrollView
          showsVerticalScrollIndicator={false}
          // Without this the first tap on the footer's submit button is spent
          // dismissing the keyboard, which reads as a dead button.
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
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
          {bodyContent}
        </ScrollView>
      ) : (
        <View className="flex-1">{bodyContent}</View>
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
    </KeyboardAvoidingView>
  );
}
