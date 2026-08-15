// ─────────────────────────────────────────────────────────────────────────────
// The bottom guard rail — one answer to "how much room goes below the content?"
//
// The post-APK pass found twelve different hard-coded `paddingBottom` values
// across 49 route files and 34 scrollable screens that reserved nothing at all,
// so their last row sat under the Android gesture bar. Every one of those was a
// screen answering this question for itself.
//
//   Screen content
//        ↓
//   Last actionable content
//        ↓
//   gutter          ← breathing room, so the last item is not flush
//        ↓
//   floating footer ← a pinned CTA, if the screen has one
//        ↓
//   bottom chrome   ← the tab bar, or the scroll-end bar, or neither
//        ↓
//   insets.bottom   ← the phone's gesture bar / home indicator
//
// `useBottomInset` is the sum of everything below the content. A screen states
// which of those it sits under; it never states a number.
//
// ── Why `chrome` is declared rather than detected ────────────────────────────
//
// React Navigation's `useBottomTabBarHeight` throws outside a tab navigator, and
// three quarters of this app's routes are stack screens. Sniffing the segment
// list would work but would make the inset depend on where a screen was mounted
// rather than on what it renders — and `scroll-end-nav` is a *choice* a screen
// makes, not a fact about its route. So it is a prop with a safe default.
//
// ── Why the tab bar contributes nothing ──────────────────────────────────────
//
// `(tabs)/_layout` does not set `position: 'absolute'` on `tabBarStyle`, so the
// tab bar is in the layout flow: it shrinks the screen rather than covering it,
// and it already carries `paddingBottom: insets.bottom` itself. A tab screen
// that also reserved `insets.bottom` would leave a second gesture-bar-sized band
// of dead space above a bar that had already accounted for it. It needs the
// gutter and nothing else.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useState } from 'react';
import { ScrollView, View, type ScrollViewProps, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NAV_BAR_HEIGHT } from '@/components/navigation/destinations';

/**
 * What sits between a screen's content and the bottom of the display.
 *
 *   * `tab-bar`        — a route under `(tabs)`. The bar is in the layout flow
 *                        and consumes the safe area itself.
 *   * `scroll-end-nav` — a stack screen using `ScrollEndScrollView`, which
 *                        raises the shared navigation bar at the end of scroll.
 *   * `none`           — a stack screen with no bottom navigation. Only the
 *                        phone's own gesture area is below the content.
 */
export type BottomChrome = 'tab-bar' | 'scroll-end-nav' | 'none';

/** Breathing room between the last item and whatever is below it. */
export const BOTTOM_GUTTER = 24;

export interface BottomInsetOptions {
  /** Defaults to `none`, the safe answer for a stack screen. */
  chrome?: BottomChrome;
  /**
   * Height of a footer pinned over the content — a floating CTA, a pay bar.
   * Use `useFloatingFooter()` to measure it rather than estimating.
   */
  footerHeight?: number;
  /** Override the breathing room. Rarely needed. */
  gutter?: number;
}

/**
 * The height of the chrome below the content, excluding the gutter and any
 * floating footer. This is where a pinned footer's own `bottom` offset starts.
 */
export function useChromeInset(chrome: BottomChrome = 'none'): number {
  const insets = useSafeAreaInsets();

  switch (chrome) {
    // The bar occupies layout space and already reserves the safe area.
    case 'tab-bar':
      return 0;
    case 'scroll-end-nav':
      return NAV_BAR_HEIGHT + insets.bottom;
    case 'none':
    default:
      return insets.bottom;
  }
}

/**
 * Bottom padding for a scroll container's `contentContainerStyle`.
 *
 * Works for `ScrollView`, `FlatList`, `SectionList` and `FlashList` alike —
 * they all take `contentContainerStyle`, which is why this is a hook returning
 * a number rather than a wrapper component that only one of them could use.
 *
 * @example
 *   const bottomInset = useBottomInset({ chrome: 'tab-bar' });
 *   <FlatList contentContainerStyle={{ paddingBottom: bottomInset }} />
 */
export function useBottomInset({
  chrome = 'none',
  footerHeight = 0,
  gutter = BOTTOM_GUTTER,
}: BottomInsetOptions = {}): number {
  return useChromeInset(chrome) + footerHeight + gutter;
}

/**
 * Measures a pinned footer so the scroll body can reserve exactly its height.
 *
 * The alternative is a number typed by hand next to the footer, which is how
 * the Automation centre ended up reserving 120pt for a control that grows to
 * ~94pt only when a quota warning is showing — right until the warning appeared
 * and the last row went under it.
 *
 * @example
 *   const footer = useFloatingFooter();
 *   const bottomInset = useBottomInset({ footerHeight: footer.height });
 *   ...
 *   <FloatingFooter {...footer.props}>…</FloatingFooter>
 */
export function useFloatingFooter(chrome: BottomChrome = 'none') {
  const [height, setHeight] = useState(0);

  const onLayout = useCallback((event: { nativeEvent: { layout: { height: number } } }) => {
    const next = Math.round(event.nativeEvent.layout.height);
    // Guarded: `onLayout` fires on every re-layout, and setting identical state
    // in that handler is a render loop.
    setHeight((prev) => (prev === next ? prev : next));
  }, []);

  return { height, props: { chrome, onLayout } };
}

export interface FloatingFooterProps {
  children: React.ReactNode;
  chrome?: BottomChrome;
  onLayout?: (event: any) => void;
  /** Extra lift above the chrome. Defaults to the standard gutter. */
  gutter?: number;
  style?: ViewStyle;
  testID?: string;
}

/**
 * A footer pinned over the content that always clears the bottom chrome and the
 * phone's gesture area.
 *
 * Screens used to do this with `className="absolute left-4 right-4 bottom-6"`
 * inside a `SafeAreaView`, which depends on absolute children being positioned
 * against the parent's *padding* box. That is Yoga's documented behaviour, but
 * it makes the clearance an emergent property of two components agreeing rather
 * than something the footer states — and on device the Automation CTA came out
 * under the navigation bar regardless. Offsetting from the measured inset is
 * the same result without the dependency.
 *
 * Pair with `edges` that exclude `'bottom'` on the screen's `SafeAreaView`, or
 * the inset is counted twice.
 */
export function FloatingFooter({
  children,
  chrome = 'none',
  onLayout,
  gutter = BOTTOM_GUTTER,
  style,
  testID,
}: FloatingFooterProps) {
  const chromeInset = useChromeInset(chrome);

  return (
    <View
      testID={testID}
      onLayout={onLayout}
      style={[
        {
          position: 'absolute',
          left: 16,
          right: 16,
          bottom: chromeInset + gutter,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Overlays
//
// A `<Modal>` on Android is its own window, and that is what makes sheets a
// separate problem from screens rather than the same one.
//
// The post-APK device photos showed sheet content under a three-button
// navigation bar — the guide's table of contents, the creator achievements
// list, the content health centre. All three are hand-rolled `<Modal>`s. An
// audit found 34 of them and exactly one, `overlays/AppModal`, setting
// `statusBarTranslucent`.
//
// `dumpsys window displays` on API 36 reports `nonDecorInsets` bottom = 0: the
// navigation bar draws *over* the app and reserves nothing on its behalf. A
// sheet that ends at the window's bottom edge therefore ends underneath it.
//
// `AchievementsModal` carried the tell — `Math.max(insets.bottom + 16, 28)`.
// Nobody writes a floor like that unless they have watched the value come out
// too small and patched around it without finding out why.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Window flags every `<Modal>` in this app should spread.
 *
 * Without them the modal's window and the app's window disagree about whether
 * the system bars are being drawn over, and the inset the sheet pads by — read
 * from the app window — describes a layout the modal is not in. With them, both
 * windows are edge-to-edge and one inset is true of both.
 *
 * @example
 *   <Modal visible={open} {...SHEET_MODAL_PROPS} onRequestClose={close}>
 */
export const SHEET_MODAL_PROPS = {
  transparent: true,
  statusBarTranslucent: true,
  // Added in React Native 0.76; this app is on 0.86. Without it the bottom of
  // the modal window stops at the navigation bar on some versions and runs
  // under it on others, which is the inconsistency the device photos show.
  navigationBarTranslucent: true,
} as const;

/**
 * Bottom padding for a sheet's own container.
 *
 * Not `useBottomInset`: a sheet is anchored to the bottom of the window rather
 * than sitting under the app's navigation, so `chrome` does not apply to it.
 * What it needs is the gesture area plus breathing room, and never less than a
 * three-button bar — which is what the `Math.max` is for, stated once here
 * rather than guessed at as `28` in one modal and omitted in eleven others.
 */
export function useSheetInset(gutter: number = BOTTOM_GUTTER): number {
  const insets = useSafeAreaInsets();
  return Math.max(insets.bottom, 0) + gutter;
}

export interface ScreenScrollViewProps extends ScrollViewProps {
  chrome?: BottomChrome;
  footerHeight?: number;
  gutter?: number;
}

/**
 * A `ScrollView` that reserves the guard rail without the screen naming a
 * number. The plain-`ScrollView` majority of screens need only this.
 *
 * Lists keep their own component and take `useBottomInset()` directly —
 * wrapping `FlashList` would cost its recycling.
 */
export const ScreenScrollView = React.forwardRef<ScrollView, ScreenScrollViewProps>(
  ({ children, chrome = 'none', footerHeight = 0, gutter, contentContainerStyle, ...props }, ref) => {
    const bottomInset = useBottomInset({ chrome, footerHeight, gutter });

    return (
      <ScrollView
        ref={ref}
        {...props}
        // Without this the keyboard swallows the first tap on any control
        // inside a scrolling screen.
        keyboardShouldPersistTaps={props.keyboardShouldPersistTaps ?? 'handled'}
        contentContainerStyle={[contentContainerStyle, { paddingBottom: bottomInset }]}
      >
        {children}
      </ScrollView>
    );
  }
);

ScreenScrollView.displayName = 'ScreenScrollView';
