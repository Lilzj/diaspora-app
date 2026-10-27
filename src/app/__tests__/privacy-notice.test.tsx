/**
 * The privacy notice discloses the rewards checks before either is switched on
 * — 27 Oct 2026 (D-13).
 *
 * D-13 is "signals flag, staff decide; disclosed in the privacy notice". Two
 * server switches wait on this page: `Identity:EnableSharedDeviceSignal` (a
 * device another account uses holds points and a referral for review) and
 * `Trust:EnableRiskAssessment` (a fraud-like rejected verification together
 * with upheld reports pauses publishing and holds points). Each sentence below
 * is something the code does, so a change to either check that this page no
 * longer describes should fail here first.
 */
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '@/design-system';

import PrivacyPolicyScreen from '../legal/privacy';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

function renderNotice() {
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider>
        <PrivacyPolicyScreen />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

describe('the privacy notice', () => {
  it('says what the device identifier is, and that it is not a hardware id', () => {
    renderNotice();

    expect(screen.getByText(/identifier it made up at random the first time it ran on that device/)).toBeTruthy();
    expect(screen.getByText(/not read from your device’s hardware, and other apps cannot see it/)).toBeTruthy();
  });

  it('names fairness as a purpose', () => {
    renderNotice();

    expect(screen.getByText(/To keep rewards fair/)).toBeTruthy();
  });

  it('has a section on the checks', () => {
    renderNotice();

    // Headings are numbered by `LegalDocument`, so this one reads "5. Checks …".
    expect(screen.getByRole('header', { name: /Checks that keep rewards fair/ })).toBeTruthy();
  });

  it('describes the shared-device check: a hold, a count, never who', () => {
    renderNotice();

    const shared = screen.getByText(/already used by another Diaspora account/);
    expect(shared.props.children).toMatch(/hold your reward points/);
    expect(shared.props.children).toMatch(/joined through someone’s referral, that referral waits/);
    expect(shared.props.children).toMatch(/only record how many other accounts use the device/);
  });

  it('describes the risk check: both signals, what pauses', () => {
    renderNotice();

    const risk = screen.getByText(/reject a verification because the evidence looked false/);
    // Both together: either alone is Medium on the server and pauses nothing.
    expect(risk.props.children).toMatch(/, and reports against three different things you published are upheld within a week/);
    expect(risk.props.children).toMatch(/guides and job, housing and marketplace listings/);
  });

  it('says a person reviews every hold, and where to ask', () => {
    renderNotice();

    expect(screen.getByText(/A person reviews every hold/)).toBeTruthy();
    expect(screen.getByText(/Settings → Appeals/)).toBeTruthy();
  });

  it('says how long the evidence is kept', () => {
    renderNotice();

    expect(screen.getByText(/for 30 days, then it is deleted/)).toBeTruthy();
  });

  it('carries the date of this change', () => {
    renderNotice();

    expect(screen.getByText('Last updated 27 October 2026')).toBeTruthy();
  });
});
