/**
 * The bottom guard rail — the invariant, held in one place
 *
 * The post-APK device pass reported the Automation "Create an automation" CTA
 * sitting under the phone's navigation bar, and content on other screens
 * scrolling underneath it. The audit behind the fix found 34 scrollable route
 * files reserving nothing below their content and twelve different hard-coded
 * `paddingBottom` values across 49 files.
 *
 * These tests hold the replacement: one hook, three kinds of bottom chrome, and
 * a footer that offsets itself from the same numbers the scroll body reserves.
 * The property worth protecting is not any single value — it is that the space
 * *reserved* by the content is always at least the space *occupied* by
 * everything below it.
 */

import React from 'react';
import { Text, View } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import { ThemeProvider } from '@/design-system';
import { NAV_BAR_HEIGHT, navContentInset } from '@/components/navigation/destinations';
import {
  BOTTOM_GUTTER,
  FloatingFooter,
  ScreenScrollView,
  useBottomInset,
  useChromeInset,
  type BottomChrome,
} from '../bottom-inset';

/** A phone with a gesture bar, so the bottom inset is non-zero. */
const GESTURE_BAR = 34;

const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: GESTURE_BAR },
};

function wrap(node: React.ReactElement) {
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider initialPreference="light">{node}</ThemeProvider>
    </SafeAreaProvider>
  );
}

/** Reads a hook's value out through a rendered element. */
function readHook(useValue: () => number): number {
  let captured = NaN;
  function Probe() {
    captured = useValue();
    return null;
  }
  wrap(<Probe />);
  return captured;
}

const flatten = (style: unknown): Record<string, any> =>
  Array.isArray(style) ? Object.assign({}, ...style.filter(Boolean).map(flatten)) : (style as any) ?? {};

describe('useChromeInset', () => {
  it('reserves nothing for the tab bar, which is in the layout flow', () => {
    // `(tabs)/_layout` does not set `position: 'absolute'`, so the bar shrinks
    // the screen rather than covering it — and it already carries
    // `paddingBottom: insets.bottom` itself. A tab screen that reserved the
    // inset again would leave a second gesture-bar-sized band of dead space.
    expect(readHook(() => useChromeInset('tab-bar'))).toBe(0);
  });

  it('reserves the gesture bar on a stack screen with no bottom navigation', () => {
    expect(readHook(() => useChromeInset('none'))).toBe(GESTURE_BAR);
  });

  it('reserves the scroll-end bar and the gesture bar together', () => {
    expect(readHook(() => useChromeInset('scroll-end-nav'))).toBe(NAV_BAR_HEIGHT + GESTURE_BAR);
  });

  it('defaults to the safe answer for a screen that does not say', () => {
    // `none` is the conservative default: it over-reserves on a tab screen by
    // the gutter, and under-reserves nowhere.
    expect(readHook(() => useChromeInset())).toBe(readHook(() => useChromeInset('none')));
  });
});

describe('useBottomInset', () => {
  it('is the chrome, the footer and the gutter, for every kind of chrome', () => {
    const chromes: BottomChrome[] = ['tab-bar', 'scroll-end-nav', 'none'];

    for (const chrome of chromes) {
      const chromeInset = readHook(() => useChromeInset(chrome));
      const inset = readHook(() => useBottomInset({ chrome, footerHeight: 88 }));

      expect(inset).toBe(chromeInset + 88 + BOTTOM_GUTTER);
    }
  });

  it('never reserves less than the chrome it sits above', () => {
    // The invariant the whole module exists for. Stated as an inequality
    // rather than an equality on purpose: a future change may add breathing
    // room, and that is fine — taking it away is not.
    const chromes: BottomChrome[] = ['tab-bar', 'scroll-end-nav', 'none'];

    for (const chrome of chromes) {
      expect(readHook(() => useBottomInset({ chrome }))).toBeGreaterThanOrEqual(
        readHook(() => useChromeInset(chrome))
      );
    }
  });

  it('agrees with the pure `navContentInset` the scroll-end bar is asserted on', () => {
    // Two expressions of one number. They were allowed to drift once already.
    expect(readHook(() => useBottomInset({ chrome: 'scroll-end-nav' }))).toBe(
      navContentInset(GESTURE_BAR)
    );
  });
});

describe('FloatingFooter', () => {
  it('lifts itself clear of the gesture bar rather than relying on the parent', () => {
    // The Automation CTA used to be `className="absolute ... bottom-6"` inside
    // a `SafeAreaView`, which only clears the gesture bar if absolute children
    // are positioned against the parent's *padding* box. Offsetting from the
    // measured inset does not depend on that agreement.
    wrap(
      <FloatingFooter chrome="none" testID="cta">
        <Text>Create an automation</Text>
      </FloatingFooter>
    );

    const style = flatten(screen.getByTestId('cta').props.style);
    expect(style.position).toBe('absolute');
    expect(style.bottom).toBeGreaterThanOrEqual(GESTURE_BAR);
  });

  it('clears the scroll-end navigation bar when a screen raises one', () => {
    wrap(
      <FloatingFooter chrome="scroll-end-nav" testID="cta">
        <Text>Apply now</Text>
      </FloatingFooter>
    );

    const style = flatten(screen.getByTestId('cta').props.style);
    expect(style.bottom).toBeGreaterThanOrEqual(NAV_BAR_HEIGHT + GESTURE_BAR);
  });

  it('leaves room for the whole footer, not just its top edge', () => {
    // The failure this closes: the Automation list reserved a hard-coded 120pt
    // for a control that is ~52pt normally and ~94pt once the quota warning
    // appears. The short form fitted and the tall one did not.
    const FOOTER_HEIGHT = 94;

    const contentInset = readHook(() =>
      useBottomInset({ chrome: 'none', footerHeight: FOOTER_HEIGHT })
    );

    wrap(
      <FloatingFooter chrome="none" testID="cta">
        <Text>Create an automation</Text>
      </FloatingFooter>
    );
    const footerBottom = flatten(screen.getByTestId('cta').props.style).bottom;

    // Where the content stops must be at or above where the footer's top edge
    // sits, or the last row is behind the CTA.
    expect(contentInset).toBeGreaterThanOrEqual(footerBottom + FOOTER_HEIGHT);
  });
});

describe('ScreenScrollView', () => {
  it('applies the guard rail without the screen naming a number', () => {
    wrap(
      <ScreenScrollView testID="body">
        <View />
      </ScreenScrollView>
    );

    const style = flatten(screen.getByTestId('body').props.contentContainerStyle);
    expect(style.paddingBottom).toBe(GESTURE_BAR + BOTTOM_GUTTER);
  });

  it('keeps the caller´s own content padding', () => {
    wrap(
      <ScreenScrollView testID="body" contentContainerStyle={{ padding: 16 }}>
        <View />
      </ScreenScrollView>
    );

    const style = flatten(screen.getByTestId('body').props.contentContainerStyle);
    expect(style.padding).toBe(16);
    expect(style.paddingBottom).toBe(GESTURE_BAR + BOTTOM_GUTTER);
  });

  it('persists taps through the keyboard, so the first tap is not eaten', () => {
    wrap(
      <ScreenScrollView testID="body">
        <View />
      </ScreenScrollView>
    );

    expect(screen.getByTestId('body').props.keyboardShouldPersistTaps).toBe('handled');
  });
});
