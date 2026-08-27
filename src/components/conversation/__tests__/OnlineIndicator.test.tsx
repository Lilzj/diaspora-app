/**
 * OnlineIndicator — a dot is a claim, and it needs evidence
 *
 * ── The defect these tests are the memory of ─────────────────────────────────
 *
 * `const status = presence?.status ?? 'offline'` turned an absent entry into a
 * grey dot, and a grey dot says *this person is not here*. Nobody had said so.
 *
 * Absence has two causes and neither is offline. The member may not have been
 * seen yet — presence arrives over the hub as it changes. Or the deployment may
 * not serve presence at all: `RealtimeHandshake.PresenceEnabled` gates it, and
 * with the flag off `lib/realtime.ts` never dispatches, so the store stays empty
 * for ever and every contact read as permanently offline.
 *
 * Gating the dispatch was not enough on its own — that stops the store filling,
 * and this component was rendering a claim from an empty store.
 */

import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';
import { ThemeProvider } from '@/design-system';

import { OnlineIndicator } from '@/components/conversation/OnlineIndicator';
import { usePresenceStore } from '@/store/presence';

const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

/**
 * What the indicator itself rendered, or null when it rendered nothing.
 *
 * `toJSON()` describes the whole tree including the providers, which always
 * render — so asserting it is null never passes and says nothing about the
 * component. The providers' children are the component's output.
 */
function indicatorOutput(tree: ReturnType<ReturnType<typeof render>['toJSON']>): unknown {
  if (!tree || Array.isArray(tree)) return tree ?? null;
  return tree.children ?? null;
}

function renderIndicator(userId: string, showLabel = true) {
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider>
        <OnlineIndicator userId={userId} showLabel={showLabel} />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

beforeEach(() => {
  usePresenceStore.setState({ presence: {} });
});

describe('when nothing is known about a member', () => {
  it('renders nothing at all', () => {
    // Not a grey dot. Not "Offline". Nothing — because nothing is what the
    // platform has said.
    //
    // Asserted on the provider's children rather than on `toJSON()`: the
    // wrappers always render, so the tree is never null and the first version of
    // this test failed for that reason rather than for the component's.
    const { toJSON } = renderIndicator('nobody-has-mentioned-this-user');

    expect(indicatorOutput(toJSON())).toBeNull();
  });

  it('does not say Offline', () => {
    renderIndicator('nobody-has-mentioned-this-user');

    expect(screen.queryByText('Offline')).toBeNull();
  });
});

describe('when the hub has reported presence', () => {
  it('renders the dot', () => {
    usePresenceStore.getState().setPresence('user-1', 'online', undefined);

    const { toJSON } = renderIndicator('user-1');

    expect(indicatorOutput(toJSON())).not.toBeNull();
  });

  it('says what the hub actually reported', () => {
    usePresenceStore.getState().setPresence('user-1', 'online', undefined);

    renderIndicator('user-1');

    expect(screen.getByText('Active now')).toBeTruthy();
  });

  it('renders an offline member, because that was reported rather than assumed', () => {
    // The distinction the whole file turns on: "reported offline" is a fact and
    // renders; "no entry" is not and does not.
    usePresenceStore
      .getState()
      .setPresence('user-1', 'offline', new Date(Date.now() - 3600_000).toISOString());

    const { toJSON } = renderIndicator('user-1');

    expect(indicatorOutput(toJSON())).not.toBeNull();
  });
});

describe('the store itself', () => {
  it('offers no label for a member it has never heard of', () => {
    // It used to answer 'Offline' here, which is where the component's default
    // came from in the first place.
    expect(usePresenceStore.getState().getStatusLabel('a-stranger')).toBeNull();
  });
});
