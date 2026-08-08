// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Notification deep-link tests (Frontend Phase 5)
//
// The property under test is a refusal. A deployment can be ahead of the app in
// the store and send a `targetRoute` this build has never heard of; pushing it
// crashes expo-router. PSR-1.1 states the required behaviour: the notification
// falls back to the inbox.
//
// Also asserted: the five routes B15's billing templates deep-link to all
// resolve, because those names were declared by the backend before these
// screens existed.
// ─────────────────────────────────────────────────────────────────────────────

import { router } from 'expo-router';
import {
  followNotificationRoute,
  isFinancialNotification,
  isResolvableRoute,
} from '../notification-routes';

beforeEach(() => {
  jest.clearAllMocks();
});

describe("the backend's declared billing deep links all resolve", () => {
  it.each([
    ['/wallet', 'billing.wallet.status'],
    ['/wallet/payments/pi-3f81q', 'billing.payment.failed · billing.refund.issued'],
    ['/wallet/subscription', 'billing.subscription.activated · .ended'],
    ['/wallet/placements/pl-0001', 'billing.placement.activated · .ended'],
    ['/wallet/receipts/DN-84K2P', 'billing.donation.receipt · .contribution.receipt'],
  ])('resolves %s (%s)', (route) => {
    expect(isResolvableRoute(route)).toBe(true);
    expect(followNotificationRoute(route)).toBe(true);
    expect(router.push).toHaveBeenCalledWith(route);
  });
});

describe('refusals', () => {
  it('refuses a route this build has no screen for', () => {
    expect(isResolvableRoute('/wallet-v2/statement')).toBe(false);
    expect(followNotificationRoute('/wallet-v2/statement')).toBe(false);
    expect(router.push).not.toHaveBeenCalled();
  });

  it('refuses a route from a future backend phase', () => {
    expect(followNotificationRoute('/escrow/disputes/abc')).toBe(false);
    expect(router.push).not.toHaveBeenCalled();
  });

  it('refuses anything that is not an absolute path', () => {
    for (const route of ['wallet', 'https://example.com/wallet', '//evil.example', '']) {
      expect(isResolvableRoute(route)).toBe(false);
    }
    // A protocol-relative URL starts with `/` but is not a route. It fails the
    // prefix check, which is why the allow-list is a list rather than a regex
    // for "starts with a slash".
    expect(followNotificationRoute('//evil.example')).toBe(false);
    expect(router.push).not.toHaveBeenCalled();
  });

  it('refuses a missing route', () => {
    expect(isResolvableRoute(undefined)).toBe(false);
    expect(isResolvableRoute(null)).toBe(false);
    expect(followNotificationRoute(undefined)).toBe(false);
  });

  it('does not match a prefix as a substring of a longer segment', () => {
    // `/wallet` must not license `/walletsomething`.
    expect(isResolvableRoute('/walletsomething')).toBe(false);
  });

  it('swallows a router throw rather than crashing on a notification tap', () => {
    (router.push as jest.Mock).mockImplementationOnce(() => {
      throw new Error('No route named "/wallet/unknown-child"');
    });

    expect(followNotificationRoute('/wallet/unknown-child')).toBe(false);
  });
});

describe('isFinancialNotification', () => {
  it('recognises B15’s category', () => {
    expect(isFinancialNotification('billing')).toBe(true);
  });

  it('does not treat other categories as financial', () => {
    for (const category of ['security', 'marketplace', 'trust', undefined, null]) {
      expect(isFinancialNotification(category)).toBe(false);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Community Life — Frontend Phase 12
//
// COMMUNITY-LIFE-GAP-019: B13 emits none of these types yet. The routing table
// is the client half, written now so that the day a deployment starts sending
// them they resolve rather than falling back to the inbox.
// ─────────────────────────────────────────────────────────────────────────────

import {
  COMMUNITY_NOTIFICATION_TYPES,
  communityNotificationRoute,
  isCommunityNotification,
} from '../notification-routes';

describe('Community Life notification routing', () => {
  it('registers the sixteen types the gap register proposes', () => {
    expect(COMMUNITY_NOTIFICATION_TYPES).toHaveLength(16);
    expect(COMMUNITY_NOTIFICATION_TYPES).toEqual(
      expect.arrayContaining([
        'membership.approved',
        'membership.rejected',
        'membership.renewal.due',
        'membership.expired',
        'event.reminder',
        'event.series.reminder',
        'event.occurrence.cancelled',
        'donation.receipt',
        'campaign.update',
        'campaign.milestone',
        'volunteer.application.decided',
        'volunteer.assignment.created',
        'poll.closing',
        'poll.result',
        'organization.announcement',
        'neighborhood.event',
      ])
    );
  });

  it('routes every registered type to a resolvable path', () => {
    for (const type of COMMUNITY_NOTIFICATION_TYPES) {
      const route = communityNotificationRoute(type, 'subject-1');
      expect(route).toBeTruthy();
      expect(isResolvableRoute(route)).toBe(true);
    }
  });

  it('falls back to a list screen rather than building a broken deep link', () => {
    // A payload missing its subject id must not produce `/campaign/undefined`.
    for (const type of COMMUNITY_NOTIFICATION_TYPES) {
      const route = communityNotificationRoute(type, null);
      expect(route).toBeTruthy();
      expect(route).not.toMatch(/undefined|null/);
      expect(isResolvableRoute(route)).toBe(true);
    }
  });

  it('sends a donation receipt to the wallet, not to a community screen', () => {
    // §38: there is one receipts surface on this platform and it is Phase 5's.
    expect(communityNotificationRoute('donation.receipt', 'RCP-123')).toBe('/wallet/receipts/RCP-123');
  });

  it('returns null for a type it does not own', () => {
    expect(communityNotificationRoute('billing.payment.failed', 'x')).toBeNull();
    expect(communityNotificationRoute(undefined)).toBeNull();
    expect(communityNotificationRoute(null)).toBeNull();
  });

  it('recognises a community notification by category or by type', () => {
    expect(isCommunityNotification('community')).toBe(true);
    expect(isCommunityNotification(null, 'poll.closing')).toBe(true);
    expect(isCommunityNotification('billing', 'billing.payment.failed')).toBe(false);
    expect(isCommunityNotification(null, null)).toBe(false);
  });
});
