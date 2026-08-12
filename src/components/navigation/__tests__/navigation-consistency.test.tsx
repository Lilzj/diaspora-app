/**
 * Bottom navigation — consistency and accessibility guards
 *
 * The tab bar and the scroll-end menu are two renderings of one navigation
 * model. They had drifted: different label sizes, different casing, a 9px label
 * against a 12px one, and two different oranges for the selected state. These
 * tests hold the two together and lock the contrast decisions in the tokens, so
 * a future colour change has to be a deliberate one.
 */

import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';
import { ThemeProvider, lightTokens, darkTokens } from '@/design-system';
import { ScrollEndNavigationMenu } from '../../ScrollEndNavigationMenu';
import {
  NAV_DESTINATIONS,
  NAV_BAR_HEIGHT,
  navContentInset,
  formatBadgeCount,
} from '../destinations';

/** A device with a home indicator, so the bottom inset is non-zero. */
const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function renderWithTheme(node: React.ReactElement) {
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider>{node}</ThemeProvider>
    </SafeAreaProvider>
  );
}

// --- WCAG contrast -------------------------------------------------------

function relativeLuminance(hex: string): number {
  const n = parseInt(hex.replace('#', ''), 16);
  const channels = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe('navigation destinations', () => {
  it('are a single shared list, so the two bars cannot drift', () => {
    expect(NAV_DESTINATIONS.map((d) => d.key)).toEqual([
      'home',
      'discover',
      'create',
      'messages',
      'knowledge',
      'profile',
    ]);
  });

  it('give every destination a distinct selected and unselected icon', () => {
    // The shape change is what tells a member which destination is active when
    // they cannot distinguish the active tint — colour must not be the only cue.
    for (const dest of NAV_DESTINATIONS) {
      expect(dest.icon).not.toEqual(dest.iconOutline);
    }
  });

  it('reserves room for the bar plus the safe area in the scroll inset', () => {
    // A screen whose inset is smaller than the bar leaves its last row
    // unreachable behind the bar.
    expect(navContentInset(34)).toBeGreaterThanOrEqual(NAV_BAR_HEIGHT + 34);
    expect(navContentInset(0)).toBeGreaterThanOrEqual(NAV_BAR_HEIGHT);
  });

  it('caps the unread badge so a long count cannot widen the bar', () => {
    expect(formatBadgeCount(5)).toBe('5');
    expect(formatBadgeCount(99)).toBe('99');
    expect(formatBadgeCount(100)).toBe('99+');
    expect(formatBadgeCount(41234)).toBe('99+');
  });
});

describe('navigation colour tokens', () => {
  it('give the unselected label enough contrast to read (WCAG AA, 12px)', () => {
    const light = lightTokens.color.navigation;
    expect(contrastRatio(light.inactive, light.background)).toBeGreaterThanOrEqual(4.5);

    const dark = darkTokens.color.navigation;
    expect(contrastRatio(dark.inactive, dark.background)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps the brand text token readable on the surface it sits on', () => {
    // `text.brand` exists precisely because primary-500 fails as text on white.
    expect(
      contrastRatio(lightTokens.color.text.brand, lightTokens.color.surface.card)
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrastRatio(darkTokens.color.text.brand, darkTokens.color.surface.card)
    ).toBeGreaterThanOrEqual(4.5);
  });

  it('records that the selected label still trades contrast for brand fidelity', () => {
    // Documented, not accidental: primary-500 as a label on white is 2.32:1.
    // Moving `activeLabel` to `text.brand` clears AA. This test fails the day
    // someone changes it, which is the point — it should be a decision.
    const light = lightTokens.color.navigation;
    const ratio = contrastRatio(light.activeLabel, light.background);
    expect(ratio).toBeLessThan(4.5);
    expect(lightTokens.color.text.brand).toBe('#924F00');
  });
});

describe('ScrollEndNavigationMenu', () => {
  it('exposes every destination as a tab to assistive technology', () => {
    renderWithTheme(<ScrollEndNavigationMenu visible activeTab="home" />);

    for (const dest of NAV_DESTINATIONS) {
      expect(screen.getByLabelText(dest.label)).toBeTruthy();
    }
  });

  it('marks only the active destination as selected', () => {
    renderWithTheme(<ScrollEndNavigationMenu visible activeTab="discover" />);

    expect(screen.getByLabelText('Discover').props.accessibilityState).toMatchObject({
      selected: true,
    });
    expect(screen.getByLabelText('Home').props.accessibilityState).toMatchObject({
      selected: false,
    });
  });

  it('hides itself from assistive technology while it is off-screen', () => {
    // The bar is always mounted and animates in. Without this a screen reader
    // would offer six destinations that cannot be reached.
    renderWithTheme(<ScrollEndNavigationMenu visible={false} activeTab="home" />);

    // Absent from the accessibility tree entirely...
    expect(screen.queryByLabelText('Primary navigation')).toBeNull();
    expect(screen.queryByLabelText('Discover')).toBeNull();

    // ...though still mounted, carrying the flags that hid it.
    const bar = screen.getByLabelText('Primary navigation', { includeHiddenElements: true });
    expect(bar.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(bar.props.accessibilityElementsHidden).toBe(true);
  });

  it('returns to the accessibility tree once it is on-screen', () => {
    renderWithTheme(<ScrollEndNavigationMenu visible activeTab="home" />);
    expect(screen.queryByLabelText('Primary navigation')).not.toBeNull();
  });

  it('gives every destination a 44pt touch target', () => {
    renderWithTheme(<ScrollEndNavigationMenu visible activeTab="home" />);

    for (const dest of NAV_DESTINATIONS) {
      const style = screen.getByLabelText(dest.label).props.style;
      const flat = Array.isArray(style) ? Object.assign({}, ...style.filter(Boolean)) : style;
      expect(flat.minHeight).toBeGreaterThanOrEqual(44);
    }
  });
});
