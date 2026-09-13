// ─────────────────────────────────────────────────────────────────────────────
// The bell says how many are waiting — 13 Sep 2026
//
// Reported from the device: "users don't know they have a notification because
// nothing is showing on the bell icon when they log in."
//
// `useUnreadNotificationCount` had existed since the inbox was wired to the real
// route, reading a served `GET /notifications/unread-count`, with **zero
// consumers**. The hook was right and nothing called it — the commonest defect
// in this codebase, and the reason these tests pin the call site and not only
// the arithmetic.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '@/design-system';

import {
  NotificationBell,
  unreadAccessibilityLabel,
  unreadBadgeLabel,
} from '../NotificationBell';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

const mockCount = jest.fn();

jest.mock('@/hooks/notifications', () => ({
  useUnreadNotificationCount: () => mockCount(),
}));

function renderBell(state: { total: number; isLoading?: boolean }) {
  mockCount.mockReturnValue({
    total: state.total,
    hasNew: state.total > 0,
    isLoading: state.isLoading ?? false,
  });

  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider>
        <NotificationBell />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

afterEach(() => {
  mockCount.mockReset();
});

// The badge is deliberately hidden from the accessibility tree — the count is
// already in the button's own label, and announcing it twice is noise. Testing
// Library skips hidden elements by default, so every badge query here has to opt
// back in, including the ones asserting absence: without it they would pass for
// a badge that rendered and was merely hidden.
const HIDDEN = { includeHiddenElements: true } as const;

describe('what the badge shows', () => {
  it('shows the number when something is waiting', () => {
    renderBell({ total: 3 });

    expect(screen.getByText('3', HIDDEN)).toBeTruthy();
  });

  it('shows nothing at zero', () => {
    // A "0" badge is noise, and noise is what teaches somebody to stop looking
    // at the badge that says 3.
    renderBell({ total: 0 });

    expect(screen.queryByText('0', HIDDEN)).toBeNull();
  });

  it('claims nothing while the platform has not answered', () => {
    // Unanswered is not none — the same rule the empty states were rebuilt on.
    renderBell({ total: 7, isLoading: true });

    expect(screen.queryByText('7', HIDDEN)).toBeNull();
  });

  it('stops counting past ninety-nine', () => {
    renderBell({ total: 240 });

    expect(screen.getByText('99+', HIDDEN)).toBeTruthy();
  });
});

describe('the badge label', () => {
  it('counts up to the cap and then says "a lot"', () => {
    expect(unreadBadgeLabel(1)).toBe('1');
    expect(unreadBadgeLabel(99)).toBe('99');
    expect(unreadBadgeLabel(100)).toBe('99+');
  });
});

describe('what a screen reader hears', () => {
  it('carries the count, because a badge is invisible to it', () => {
    expect(unreadAccessibilityLabel(0)).toBe('Notifications');
    expect(unreadAccessibilityLabel(1)).toBe('Notifications, 1 unread');
    expect(unreadAccessibilityLabel(4)).toBe('Notifications, 4 unread');
  });

  it('never says "1 unreads"', () => {
    expect(unreadAccessibilityLabel(1)).not.toContain('unreads');
  });

  it('is on the bell itself', () => {
    renderBell({ total: 2 });

    expect(screen.getByLabelText('Notifications, 2 unread')).toBeTruthy();
  });
});

describe('the home screen', () => {
  const fs = require('fs') as { readFileSync(p: string, e: string): string };
  const path = require('path') as { join(...s: string[]): string };

  it('renders the bell component rather than a bare link', () => {
    // The hook existed for a day with nothing calling it. Pinning the call site
    // is the half that would have caught that.
    const home = fs.readFileSync(
      path.join(process.cwd(), 'src', 'app', '(tabs)', 'index.tsx'),
      'utf8'
    );

    expect(home).toContain('<NotificationBell />');
  });
});
