/**
 * A count on an icon — 15 Sep 2026.
 *
 * Aisha's bell showed "…" instead of 10: the pill sized itself to its minimum
 * and Android ellipsised the digits. The width now comes from the label.
 */
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { Text, View } from 'react-native';
import { CountBadge, countBadgeWidth } from '../CountBadge';

const HIDDEN = { includeHiddenElements: true } as const;

function renderBadge(count: number, size = 18) {
  return render(<CountBadge count={count} size={size} backgroundColor="#d00" borderColor="#fff" />);
}

function badgeStyle() {
  const views = screen.UNSAFE_getAllByType(View);
  const flattened = [views[0].props.style].flat(3).filter(Boolean);
  return Object.assign({}, ...flattened) as { width?: number; height?: number };
}

describe('the badge', () => {
  it('shows two digits whole, in a pill wide enough for them', () => {
    renderBadge(10);

    const label = screen.getByText('10', HIDDEN);
    // Never cut: no line limit that Android could ellipsise into "…".
    expect(label.props.numberOfLines).toBeUndefined();
    expect(label.props.ellipsizeMode).toBeUndefined();
    expect(badgeStyle().width).toBeGreaterThan(badgeStyle().height as number);
  });

  it('is round for one digit and grows for more', () => {
    expect(countBadgeWidth('3', 18)).toBe(18);
    expect(countBadgeWidth('10', 18)).toBeGreaterThan(countBadgeWidth('3', 18));
    expect(countBadgeWidth('99+', 18)).toBeGreaterThan(countBadgeWidth('10', 18));
  });

  it('stops counting past ninety-nine', () => {
    renderBadge(240);

    expect(screen.getByText('99+', HIDDEN)).toBeTruthy();
  });

  it('draws nothing at zero', () => {
    renderBadge(0);

    expect(screen.UNSAFE_queryAllByType(Text)).toHaveLength(0);
  });

  it('does not grow with the system font, because its size is fixed', () => {
    renderBadge(12);

    expect(screen.getByText('12', HIDDEN).props.allowFontScaling).toBe(false);
  });
});

describe('where it is used', () => {
  const fs = require('fs') as { readFileSync(p: string, e: string): string };
  const path = require('path') as { join(...s: string[]): string };
  const read = (...parts: string[]) => fs.readFileSync(path.join(process.cwd(), 'src', ...parts), 'utf8');

  it('carries every unread count on the bell and both Messages tabs', () => {
    expect(read('components', 'NotificationBell.tsx')).toContain('<CountBadge');
    expect(read('app', '(tabs)', '_layout.tsx')).toContain('<CountBadge');
    expect(read('components', 'ScrollEndNavigationMenu.tsx')).toContain('<CountBadge');
  });
});
