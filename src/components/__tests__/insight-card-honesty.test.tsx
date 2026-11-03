/**
 * The item analytics sheet says only what is measured — Android UAT, 3 Nov 2026.
 *
 * "Zoe hair saloon" showed TOTAL VIEWS 0 "↑ 18% vs last week", CONVERSION RATE
 * "84% High audience intent", and "Health Score: 44% (action_required)" in
 * green. The 18% and "High audience intent" were fixed text, 84% was the
 * fallback for a field nothing sets, and the type panels swapped a real 0 for
 * 89 helpful votes, 6 offers, 7 applications or 19 candidates (`value || 89`).
 * The views, saves and messages on this sheet were the workspace's
 * placeholder zeros for most kinds of item.
 *
 * The sheet now opens the item's real analytics (views, enquiries and saves,
 * with an honest comparison), shows the facts the item carries, and names its
 * health status in words with a colour to match.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ router: { push: (...args: unknown[]) => mockPush(...args) } }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

import { InsightCard } from '../creator/InsightCard';
import { analyticsRouteFor } from '@/lib/creator/editor-route';
import type { UnifiedContentItem } from '@/types/creator';

const HIDDEN = { includeHiddenElements: true } as const;

function provider(overrides: Partial<UnifiedContentItem> = {}): UnifiedContentItem {
  return {
    id: 'p1',
    contentType: 'Provider',
    title: 'Zoe hair saloon',
    views: 0,
    bookmarks: 0,
    messagesCount: 0,
    unreadMessagesCount: 0,
    healthScore: 44,
    healthStatus: 'action_required',
    healthRecommendations: [],
    ...overrides,
  } as UnifiedContentItem;
}

beforeEach(() => mockPush.mockClear());

describe('the item analytics sheet', () => {
  it('invents no comparison, rate or audience claim', () => {
    render(<InsightCard item={provider()} visible onClose={jest.fn()} />);

    expect(screen.queryByText(/18%/, HIDDEN)).toBeNull();
    expect(screen.queryByText(/84%/, HIDDEN)).toBeNull();
    expect(screen.queryByText(/High audience intent/, HIDDEN)).toBeNull();
  });

  it('never turns a real zero into a made-up figure', () => {
    render(<InsightCard item={provider({ contentType: 'Guide', helpfulVotes: 0 } as never)} visible onClose={jest.fn()} />);
    expect(screen.queryByText(/89/, HIDDEN)).toBeNull();
    expect(screen.queryByText(/6 min read/, HIDDEN)).toBeNull();
  });

  it('names the health status in words', () => {
    render(<InsightCard item={provider()} visible onClose={jest.fn()} />);

    expect(screen.getByText(/44% · Action required/, HIDDEN)).toBeTruthy();
    expect(screen.queryByText(/action_required/, HIDDEN)).toBeNull();
  });

  it("opens the item's real analytics", () => {
    const onClose = jest.fn();
    render(<InsightCard item={provider()} visible onClose={onClose} />);

    fireEvent.press(screen.getByText('See full analytics', HIDDEN));

    expect(onClose).toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith('/analytics/provider');
  });

  it('survives an item arriving after it first rendered empty', () => {
    const { rerender } = render(<InsightCard item={null} visible={false} onClose={jest.fn()} />);

    expect(() => rerender(<InsightCard item={provider()} visible onClose={jest.fn()} />)).not.toThrow();
  });
});

describe('which items have an analytics screen', () => {
  const item = (contentType: string) => ({ id: 'x', contentType } as UnifiedContentItem);

  it('maps each kind to its subject', () => {
    expect(analyticsRouteFor(item('Marketplace'))).toBe('/analytics/content/listing/x');
    expect(analyticsRouteFor(item('Housing'))).toBe('/analytics/content/housing/x');
    // A provider's figures are its owner's dashboard; an organisation has its
    // own screen. Neither is a per-item subject on the client.
    expect(analyticsRouteFor(item('Provider'))).toBe('/analytics/provider');
    expect(analyticsRouteFor(item('Organization'))).toBe('/analytics/organization/x');
  });
});

describe('the author card', () => {
  it('derives no guide count or helpful votes from the follower count', () => {
    const fs = require('fs');
    const path = require('path');
    const card: string = fs.readFileSync(path.join(process.cwd(), 'src', 'components', 'AuthorExpertise.tsx'), 'utf8');

    expect(card).not.toContain('followerCount > 100 ? 5 : 1');
    expect(card).not.toContain('followerCount * 3');
  });
});
