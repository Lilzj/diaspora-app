// ─────────────────────────────────────────────────────────────────────────────
// A missing piece must not take the page with it — 12 Sep 2026
//
// Reported from the emulator: the Community Life hub rendered as one sentence,
// "The Community Life hub summary — Diaspora cannot do this yet", and nothing
// else. Behind that sentence were nine destinations — Membership, Events,
// Recurring, Going to, Fundraising, Volunteer, Polls, Organisations, Impact —
// every one of them served by a real route with a real screen.
//
// The cause was one branch in `CommunityScreen`: `isEnabled` is
// `areCommunityGapsEnabled()`, false in every release build, and the hub names a
// gap (`communityHubSummary`) that genuinely is not served — the aggregate does
// not exist. Both true, and together they replaced the whole page.
//
// It "kept coming off and on" because a `preview` build sets
// `EXPO_PUBLIC_ENABLE_GAP_PREVIEW=1` and shows the page, and a `production`
// build does not and shows the dead end. The same pair of builds hid the
// communities gate before Phase 5.
//
// The distinction the component was missing: a screen that *is* a gap has
// nothing to draw, and a screen with a gap *in* it has everything else.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Text } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '@/design-system';

import { CommunityScreen } from '../community/CommunityScreen';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

/** A destination the member can actually reach, standing in for the hub's nine. */
const DESTINATION = 'Fundraising';

function renderScreen(props: Partial<React.ComponentProps<typeof CommunityScreen>> = {}) {
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider>
        <CommunityScreen
          title="Community Life"
          gapKey="communityHubSummary"
          // What a release build passes: the simulated adapter is not compiled in.
          isEnabled={false}
          {...props}
        >
          <Text>{DESTINATION}</Text>
        </CommunityScreen>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

describe('a screen whose gap covers only part of it', () => {
  it('still renders what works', () => {
    renderScreen({ gapCovers: 'part' });

    expect(screen.getByText(DESTINATION)).toBeTruthy();
  });

  it('still says which part is missing', () => {
    // The notice is the point. Rendering the destinations *and* quietly dropping
    // the explanation would be the opposite mistake — a member wondering why the
    // rails are empty with nothing telling them.
    renderScreen({ gapCovers: 'part' });

    // The label differs by build — "Not available yet" for a member, "Preview ·
    // not connected" under __DEV__, which is what Jest runs as. Either proves
    // the notice survived; asserting only the release wording would pass for the
    // wrong reason here and fail for the right one on a device.
    expect(screen.queryByText(/Not available yet|Preview . not connected/i)).toBeTruthy();
  });

  it('uses the screen’s own sentence, not the generic one', () => {
    // `detail` was read only in a preview build, so a screen's explanation was
    // dropped in the only build a real member ever sees the notice in.
    renderScreen({ gapCovers: 'part', gapDetail: 'Everything they link to is real.' });

    expect(screen.queryByText('Everything they link to is real.')).toBeTruthy();
  });
});

describe('a screen that is the gap', () => {
  it('is replaced by the explanation, because there is nothing else on it', () => {
    renderScreen({ gapCovers: 'screen' });

    expect(screen.queryByText(DESTINATION)).toBeNull();
  });

  it('is the default, so no existing screen changes behaviour', () => {
    // Thirty-odd screens pass no `gapCovers`. Had the default gone the other
    // way, every one of them would have started rendering an empty body under a
    // notice instead of the explanation they were written to show.
    renderScreen();

    expect(screen.queryByText(DESTINATION)).toBeNull();
  });
});

describe('a build that can reach the data', () => {
  it('renders the content whatever the gap covers', () => {
    renderScreen({ isEnabled: true, gapCovers: 'screen' });

    expect(screen.getByText(DESTINATION)).toBeTruthy();
  });
});
