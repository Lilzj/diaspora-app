// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Automation surfaces (Frontend Phase 18, §57 · §62)
//
// Component tests for the two properties that are only observable in a
// rendered tree:
//
//   **§62: never colour alone.** Every badge renders a *word*, and every
//   accessibility label is a sentence rather than an abbreviation. A test that
//   asserted on colour would be asserting on the thing §62 says not to rely on;
//   these assert on the text, which is what a member who cannot distinguish
//   amber from green actually reads.
//
//   **§57: a simulated record can never look real.** The marker is rendered by
//   the same component that renders the status, so a screen cannot draw one
//   without the other. That is a property of the component tree and is checked
//   here rather than by reading the source.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { render, screen } from '@testing-library/react-native';

import { ThemeProvider } from '@/design-system';
import {
  AutomationGapNotice,
  AutomationStatusBadge,
  DependencyList,
  RunStatusBadge,
  SimulationMarker,
  SupportBadge,
} from '@/components/automation';
import { AUTOMATION_GAPS } from '@/config/automation-gaps';
import {
  AUTOMATION_RUN_PRESENTATION,
  AUTOMATION_STATUS_PRESENTATION,
  type AutomationDependency,
  type AutomationRunStatus,
  type AutomationStatus,
} from '@/types/automation';

function renderWithTheme(node: React.ReactElement) {
  return render(<ThemeProvider>{node}</ThemeProvider>);
}

// ═════════════════════════════════════════════════════════════════════════════

describe('§62 · status is carried by words, not by colour', () => {
  const statuses: AutomationStatus[] = [
    'DRAFT',
    'ACTIVE',
    'PAUSED',
    'DISABLED',
    'EXPIRED',
    'NEEDS_ATTENTION',
  ];

  for (const status of statuses) {
    it(`${status} renders its label and its full accessibility sentence`, () => {
      renderWithTheme(<AutomationStatusBadge status={status} isSimulated={false} />);

      const presentation = AUTOMATION_STATUS_PRESENTATION[status];

      // The visible word.
      expect(screen.getByText(presentation.label)).toBeTruthy();
      // The spoken sentence — longer than the word, because a screen reader
      // user gets the meaning rather than the abbreviation.
      expect(screen.getByLabelText(presentation.accessibilityLabel)).toBeTruthy();
    });
  }

  const runStatuses: AutomationRunStatus[] = [
    'RUNNING',
    'COMPLETED',
    'PARTIALLY_COMPLETED',
    'FAILED',
    'SKIPPED',
    'CANCELLED',
    'TIMED_OUT',
  ];

  for (const status of runStatuses) {
    it(`run status ${status} renders its label and sentence`, () => {
      renderWithTheme(<RunStatusBadge status={status} isSimulated={false} />);

      const presentation = AUTOMATION_RUN_PRESENTATION[status];
      expect(screen.getByText(presentation.label)).toBeTruthy();
      expect(screen.getByLabelText(presentation.accessibilityLabel)).toBeTruthy();
    });
  }

  it('every status presentation has a label, a description and a spoken sentence', () => {
    for (const presentation of Object.values(AUTOMATION_STATUS_PRESENTATION)) {
      expect(presentation.label.length).toBeGreaterThan(0);
      expect(presentation.description.length).toBeGreaterThan(0);
      // The spoken form must carry more than the badge, or it adds nothing.
      expect(presentation.accessibilityLabel.length).toBeGreaterThanOrEqual(
        presentation.label.length
      );
    }
  });

  it('SKIPPED never reads as a failure', () => {
    // §36: a skipped run is the system working — the trigger fired and a
    // condition said no. Wording it as a failure teaches members to distrust
    // the feature.
    const presentation = AUTOMATION_RUN_PRESENTATION.SKIPPED;

    expect(presentation.tone).not.toBe('critical');
    expect(presentation.description).not.toMatch(/fail|error|wrong/i);
  });
});

// ═════════════════════════════════════════════════════════════════════════════

describe('§57 · a simulated record cannot be drawn without its marker', () => {
  it('the status badge renders the marker when the record is simulated', () => {
    renderWithTheme(<AutomationStatusBadge status="ACTIVE" isSimulated />);

    expect(screen.getByText('Active')).toBeTruthy();
    // Drawn by the same component that draws the word, so a screen cannot
    // render one without the other.
    expect(screen.getByTestId('automation-simulation-marker')).toBeTruthy();
    expect(screen.getByText('Simulated')).toBeTruthy();
  });

  it('the status badge omits the marker when the record is real', () => {
    renderWithTheme(<AutomationStatusBadge status="ACTIVE" isSimulated={false} />);

    expect(screen.queryByTestId('automation-simulation-marker')).toBeNull();
  });

  it('a run badge behaves the same way', () => {
    renderWithTheme(<RunStatusBadge status="COMPLETED" isSimulated />);

    expect(screen.getByTestId('automation-simulation-marker')).toBeTruthy();
  });

  it('the marker says in words that it did not really happen', () => {
    renderWithTheme(<SimulationMarker subject="This run" />);

    expect(
      screen.getByLabelText('This run is simulated. It did not really happen.')
    ).toBeTruthy();
  });
});

// ═════════════════════════════════════════════════════════════════════════════

describe('§70 · support status is a separate, visible answer', () => {
  it('renders a word for each support level', () => {
    for (const support of ['CONNECTED', 'PARTIAL', 'DEVELOPMENT', 'BACKEND_GAP'] as const) {
      const { unmount } = renderWithTheme(<SupportBadge support={support} />);
      expect(screen.getByTestId(`automation-support-${support}`)).toBeTruthy();
      unmount();
    }
  });

  it('a backend gap does not read as the member’s fault', () => {
    renderWithTheme(<SupportBadge support="BACKEND_GAP" />);

    // §77: a backend gap must not be disguised as a frontend defect, and the
    // member-facing half of that is the wording.
    const badge = screen.getByTestId('automation-support-BACKEND_GAP');
    expect(badge.props.accessibilityLabel).toMatch(/Your setup is saved/);
    expect(badge.props.accessibilityLabel).not.toMatch(/error|fail|invalid/i);
  });
});

// ═════════════════════════════════════════════════════════════════════════════

describe('§55 · the gap notice names its gap and blames nobody', () => {
  it('renders the gap id, selectably', () => {
    renderWithTheme(<AutomationGapNotice gapKey="savedSearches" />);

    expect(screen.getByTestId('automation-gap-notice-savedSearches')).toBeTruthy();
    expect(screen.getByText(AUTOMATION_GAPS.savedSearches.id)).toBeTruthy();
  });

  it('says there is nothing for the member to fix', () => {
    renderWithTheme(<AutomationGapNotice gapKey="savedSearches" />);

    expect(screen.getByText(/nothing for you to fix/)).toBeTruthy();
  });

  it('renders nothing for another phase’s gap key', () => {
    // Every phase's notice looks its key up in its *own* register. Passing
    // Phase 16's key here must render nothing rather than an empty box — which
    // is what stops one phase's gap being closed and another's notice silently
    // disappearing.
    renderWithTheme(<AutomationGapNotice gapKey="oauthExchange" />);

    expect(screen.queryByTestId('automation-gap-notice-oauthExchange')).toBeNull();
  });

  it('renders nothing for an unknown key', () => {
    renderWithTheme(<AutomationGapNotice gapKey="notARealKey" />);

    expect(screen.queryByTestId('automation-gap-notice-notARealKey')).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════

describe('§55 · §62 · the dependency list distinguishes its three states in words', () => {
  const dependencies: AutomationDependency[] = [
    {
      kind: 'trigger',
      label: 'A new job is posted',
      state: 'met',
      detail: 'Ready to use.',
      actionLabel: null,
      actionRoute: null,
      gapId: null,
      blocksActivation: false,
    },
    {
      kind: 'integration',
      label: 'Calendar',
      state: 'missing',
      detail: 'Connect a calendar so events can be added to it.',
      actionLabel: 'Connect a calendar',
      actionRoute: '/settings/integrations/calendar',
      gapId: null,
      blocksActivation: false,
    },
    {
      kind: 'action',
      label: 'Tell the community',
      state: 'gap',
      detail: 'Diaspora cannot do this automatically yet.',
      actionLabel: null,
      actionRoute: null,
      gapId: 'FRONTEND-PHASE18-GAP-024',
      blocksActivation: false,
    },
  ];

  it('announces each state as a word before the label', () => {
    renderWithTheme(<DependencyList dependencies={dependencies} />);

    // §62: the list has to be comprehensible without the icons, which are the
    // only visual difference between the three states.
    expect(screen.getByLabelText(/^Ready\. A new job is posted/)).toBeTruthy();
    expect(screen.getByLabelText(/^Needs your attention\. Calendar/)).toBeTruthy();
    expect(screen.getByLabelText(/^Coming later\. Tell the community/)).toBeTruthy();
  });

  it('offers a route only where the member can act', () => {
    renderWithTheme(<DependencyList dependencies={dependencies} onNavigate={() => {}} />);

    expect(screen.getByText('Connect a calendar →')).toBeTruthy();
    // A gap gets no button, because there is nothing the member can do. §77.
    expect(screen.queryByText(/Tell the community →/)).toBeNull();
  });

  it('renders a gap id so it can be looked up', () => {
    renderWithTheme(<DependencyList dependencies={dependencies} />);

    expect(screen.getByText('FRONTEND-PHASE18-GAP-024')).toBeTruthy();
  });

  it('can hide the dependencies that are already fine', () => {
    renderWithTheme(<DependencyList dependencies={dependencies} onlyProblems />);

    expect(screen.queryByLabelText(/^Ready\./)).toBeNull();
    expect(screen.getByLabelText(/^Needs your attention\./)).toBeTruthy();
  });

  it('renders nothing when there is nothing to report', () => {
    renderWithTheme(<DependencyList dependencies={[]} />);

    expect(screen.queryByTestId('automation-dependency-list')).toBeNull();
  });
});
