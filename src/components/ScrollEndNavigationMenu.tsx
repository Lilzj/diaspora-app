import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Animated,
  Platform,
  FlatList,
  ScrollView,
  ScrollViewProps,
} from 'react-native';
import type { FlatListProps } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useConversationStore, selectTotalUnread } from '@/store/conversation';
import { useTheme } from '@/design-system';
import { CountBadge } from './CountBadge';
import {
  NAV_DESTINATIONS,
  NAV_BAR_HEIGHT,
  type TabKey,
} from './navigation/destinations';
import { useBottomInset } from './layout/bottom-inset';

export type { TabKey };

interface ScrollEndNavigationMenuProps {
  visible: boolean;
  activeTab?: TabKey;
}

/**
 * The navigation bar a stack screen raises once the member scrolls to the
 * bottom of its content. Stack screens sit outside the tab navigator, so
 * without this there is no way to a primary destination except the header back
 * button.
 *
 * Destinations, sizing and colour all come from the shared navigation module so
 * this bar and the real tab bar cannot drift apart again.
 */
export function ScrollEndNavigationMenu({ visible, activeTab }: ScrollEndNavigationMenuProps) {
  const insets = useSafeAreaInsets();
  const { tokens } = useTheme();
  const nav = tokens.color.navigation;
  const translateY = useRef(new Animated.Value(120)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  const conversations = useConversationStore((s) => s.conversations);
  const totalUnread = selectTotalUnread(conversations);

  useEffect(() => {
    Animated.parallel([
      Animated.spring(translateY, {
        toValue: visible ? 0 : 120,
        useNativeDriver: Platform.OS !== 'web',
        friction: 8,
        tension: 40,
      }),
      Animated.timing(opacity, {
        toValue: visible ? 1 : 0,
        duration: tokens.motion.duration.normal,
        useNativeDriver: Platform.OS !== 'web',
      }),
    ]).start();
  }, [visible, tokens.motion.duration.normal, translateY, opacity]);

  return (
    <Animated.View
      accessibilityRole="tablist"
      accessibilityLabel="Primary navigation"
      // Hidden from assistive tech while off-screen, so a screen reader does
      // not announce six destinations that cannot currently be reached.
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? 'yes' : 'no-hide-descendants'}
      pointerEvents={visible ? 'auto' : 'none'}
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        transform: [{ translateY }],
        opacity,
        zIndex: tokens.zIndex.header,
        flexDirection: 'row',
        justifyContent: 'space-around',
        alignItems: 'center',
        backgroundColor: nav.background,
        borderTopWidth: 1,
        borderTopColor: nav.border,
        height: NAV_BAR_HEIGHT + insets.bottom,
        paddingBottom: insets.bottom || tokens.spacing[2],
        paddingTop: tokens.spacing[2],
        paddingHorizontal: tokens.spacing[2],
        ...tokens.shadow.elevated,
        // The bar sits above the content it floats over, so the shadow points
        // up. The dark token set drops elevation to 0 in favour of the border,
        // but this bar overlays scrolling content and still needs to separate
        // from it on Android.
        shadowOffset: { width: 0, height: -4 },
        elevation: 10,
      }}
    >
      {NAV_DESTINATIONS.map((item) => {
        const isActive = activeTab === item.key;
        const iconName = isActive ? item.icon : item.iconOutline;
        const showBadge = item.key === 'messages' && totalUnread > 0;

        return (
          <TouchableOpacity
            key={item.key}
            onPress={() => router.replace(item.route as any)}
            accessibilityRole="tab"
            accessibilityLabel={
              showBadge ? `${item.label}, ${totalUnread} unread` : item.label
            }
            accessibilityState={{ selected: isActive }}
            style={{
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              flex: 1,
              // 44pt minimum touch target (WCAG 2.5.5).
              minHeight: 44,
              paddingVertical: tokens.spacing[1],
            }}
          >
            <View style={{ position: 'relative' }}>
              <Ionicons
                name={iconName as any}
                size={item.iconSize}
                color={isActive ? nav.activeIcon : nav.inactive}
              />
              {showBadge && (
                <CountBadge
                  count={totalUnread}
                  size={16}
                  backgroundColor={nav.badge}
                  borderColor={nav.background}
                  textColor={nav.onBadge}
                  style={{ position: 'absolute', top: -4, right: -8 }}
                />
              )}
            </View>
            <Text
              numberOfLines={1}
              style={{
                color: isActive ? nav.activeLabel : nav.inactive,
                fontSize: 12,
                fontWeight: '700',
                marginTop: 2,
              }}
            >
              {item.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </Animated.View>
  );
}

export const isCloseToBottom = (event: any, threshold = 60) => {
  const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
  return layoutMeasurement.height + contentOffset.y >= contentSize.height - threshold;
};

interface ScrollEndScrollViewProps extends ScrollViewProps {
  activeTab?: TabKey;
  onBottomNavVisibilityChange?: (visible: boolean) => void;
  bottomShieldColor?: string;
  /** Height of a footer pinned over this screen's content, if it has one. */
  footerHeight?: number;
  /**
   * False on a screen with its own action bar pinned below this scroll view
   * (Save, Continue, Change plan). The navigation bar is drawn at the bottom of
   * the scroll area, which on such a screen ends above the action bar, so it
   * surfaced mid-screen over the content (13 Oct 2026). Those screens keep the
   * back arrow as their way out.
   */
  endNavigation?: boolean;
}

/**
 * A ScrollView that raises the navigation bar as the member reaches the end of
 * the content, and permanently reserves room for it so the last item is never
 * trapped behind the bar.
 */
export const ScrollEndScrollView = React.forwardRef<ScrollView, ScrollEndScrollViewProps>(
  (
    {
      children,
      activeTab,
      onScroll,
      onBottomNavVisibilityChange,
      bottomShieldColor,
      footerHeight = 0,
      endNavigation = true,
      ...props
    },
    ref
  ) => {
    const [showBottomNav, setShowBottomNav] = useState(false);
    const insets = useSafeAreaInsets();
    const { tokens } = useTheme();
    // One source of truth with every other scroll container in the app.
    const bottomInset = useBottomInset({ chrome: 'scroll-end-nav', footerHeight });

    // ── A screen shorter than the viewport is already at its end ────────────
    //
    // The bar was raised only by a scroll event, so a screen whose content does
    // not overflow never raised it at all — no scroll, no event, no bar, and no
    // navigation anywhere on the screen but the back arrow. `/settings/about`
    // is four rows and a copyright line; it had nothing.
    //
    // The reserved inset is subtracted before comparing, because it is padding
    // this component itself adds: without that, every short screen is 60pt
    // taller than its viewport and reads as scrollable when there is nothing to
    // scroll.
    const [viewportHeight, setViewportHeight] = useState(0);
    const [contentHeight, setContentHeight] = useState(0);
    const fitsWithoutScrolling =
      viewportHeight > 0 && contentHeight > 0 && contentHeight - bottomInset <= viewportHeight;

    const handleScroll = (event: any) => {
      const isClose = isCloseToBottom(event, 80);
      if (isClose !== showBottomNav) {
        setShowBottomNav(isClose);
        onBottomNavVisibilityChange?.(isClose);
      }
      onScroll?.(event);
    };

    const atEnd = showBottomNav || fitsWithoutScrolling;

    return (
      <View style={{ flex: 1, position: 'relative' }}>
        <ScrollView
          ref={ref}
          {...props}
          onScroll={handleScroll}
          onLayout={(event) => {
            setViewportHeight(event.nativeEvent.layout.height);
            props.onLayout?.(event);
          }}
          onContentSizeChange={(width, height) => {
            setContentHeight(height);
            props.onContentSizeChange?.(width, height);
          }}
          scrollEventThrottle={16}
          // Without this the keyboard swallows the first tap on any control
          // inside a scrolling form.
          keyboardShouldPersistTaps={props.keyboardShouldPersistTaps ?? 'handled'}
          contentContainerStyle={[
            props.contentContainerStyle,
            // Reserve the full navigation height at all times. Reserving it
            // only while the bar was showing made the content grow by 60pt at
            // the exact moment the bar appeared, shifting the control the
            // member was reaching for out from under their finger.
            { paddingBottom: bottomInset },
          ]}
        >
          {children}
        </ScrollView>
        {endNavigation ? <ScrollEndNavigationMenu visible={atEnd} activeTab={activeTab} /> : null}

        {/* Covers the bottom safe area while the bar is hidden, so scrolling
            content does not show through the home-indicator strip. Not with
            end navigation off: a pinned footer covers that strip, and the
            shield drew a band above it (Android UAT, 3 Nov 2026). */}
        {endNavigation && !atEnd && insets.bottom > 0 && (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: insets.bottom,
              backgroundColor: bottomShieldColor || tokens.color.navigation.background,
              zIndex: tokens.zIndex.card,
            }}
          />
        )}
      </View>
    );
  }
);

ScrollEndScrollView.displayName = 'ScrollEndScrollView';

// ─────────────────────────────────────────────────────────────────────────────
// The same behaviour, for a list
//
// `ScrollEndScrollView` cannot be dropped over a `FlatList` — a list owns its
// own virtualised scrolling, and wrapping one in a ScrollView flattens it into
// rendering every row at once, which is the whole thing a list exists to avoid.
//
// So this repeats the wrapper rather than the container: same threshold, same
// reserved inset from the same hook, same shield over the home-indicator strip.
// Thirteen screens use lists — a member's transactions, notifications, saved
// items, listings, reviews — and they are exactly the screens somebody scrolls
// to the end of.
//
// Kept beside `ScrollEndScrollView` on purpose. Two files would drift; one file
// means a change to the threshold or the shield reaches both.
// ─────────────────────────────────────────────────────────────────────────────

interface ScrollEndFlatListProps<T> extends FlatListProps<T> {
  activeTab?: TabKey;
  onBottomNavVisibilityChange?: (visible: boolean) => void;
  bottomShieldColor?: string;
  /** Height of a footer pinned over this screen's content, if it has one. */
  footerHeight?: number;
}

export function ScrollEndFlatList<T>({
  activeTab,
  onScroll,
  onBottomNavVisibilityChange,
  bottomShieldColor,
  footerHeight = 0,
  contentContainerStyle,
  ...props
}: ScrollEndFlatListProps<T>) {
  const [showBottomNav, setShowBottomNav] = useState(false);
  const insets = useSafeAreaInsets();
  const { tokens } = useTheme();
  const bottomInset = useBottomInset({ chrome: 'scroll-end-nav', footerHeight });

  // Same reasoning as `ScrollEndScrollView`: a list with three rows never
  // scrolls, so it never raised the bar. An empty or nearly-empty list is
  // exactly where a member most needs a way onwards.
  const [viewportHeight, setViewportHeight] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);
  const fitsWithoutScrolling =
    viewportHeight > 0 && contentHeight > 0 && contentHeight - bottomInset <= viewportHeight;

  const handleScroll = (event: any) => {
    const isClose = isCloseToBottom(event, 80);
    if (isClose !== showBottomNav) {
      setShowBottomNav(isClose);
      onBottomNavVisibilityChange?.(isClose);
    }
    onScroll?.(event);
  };

  const atEnd = showBottomNav || fitsWithoutScrolling;

  return (
    <View style={{ flex: 1, position: 'relative' }}>
      <FlatList
        {...props}
        onScroll={handleScroll}
        onLayout={(event) => {
          setViewportHeight(event.nativeEvent.layout.height);
          props.onLayout?.(event);
        }}
        onContentSizeChange={(width, height) => {
          setContentHeight(height);
          props.onContentSizeChange?.(width, height);
        }}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps={props.keyboardShouldPersistTaps ?? 'handled'}
        // Reserved at all times, for the reason recorded on
        // `ScrollEndScrollView`: growing the content by 60pt at the moment the
        // bar appears moves the row under the member's finger.
        contentContainerStyle={[contentContainerStyle, { paddingBottom: bottomInset }]}
      />
      <ScrollEndNavigationMenu visible={atEnd} activeTab={activeTab} />

      {!atEnd && insets.bottom > 0 && (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: insets.bottom,
            backgroundColor: bottomShieldColor || tokens.color.navigation.background,
            zIndex: tokens.zIndex.card,
          }}
        />
      )}
    </View>
  );
}
