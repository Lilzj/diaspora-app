/**
 * The alert card's trust panel.
 *
 * Nothing covered this component before, which is how it kept a confidence
 * percentage nobody could derive, a confirm button wired to a system that moved
 * none of the numbers beside it, and an urgency lookup that would have crashed
 * the render the moment it met a real post.
 *
 * The assertions here are the ones a screenshot cannot make: that no computed
 * percentage comes back, that the copy states one count rather than two tiers,
 * that the control posts the reaction B6 corroborates with, and that the
 * viewer's own state comes off the wire rather than out of `useState`.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';

import { ThemeProvider } from '@/design-system';
import { UpdateCard } from '../UpdateCard';
import type { UpdateSummary } from '@/types/update';
import type { AuthorSummary } from '@/types/social';

const mockReact = jest.fn().mockResolvedValue(undefined);
let mockCapabilities: unknown = {
  reactions: [
    { key: 'like', label: 'Like', glyph: '👍', sentiment: 'positive', appliesTo: ['Post'] },
    {
      key: 'confirmed',
      label: 'I can confirm this',
      glyph: '✅',
      sentiment: 'corroborating',
      appliesTo: ['Post'],
    },
  ],
};

jest.mock('@/hooks/community-social', () => ({
  useCommunityCapabilities: () => ({ capabilities: mockCapabilities }),
  useReact: () => ({ react: mockReact, isPending: false }),
}));

jest.mock('@/providers/notification-provider', () => ({
  useNotification: () => ({ showAlert: jest.fn() }),
}));

const AUTHOR = {
  userId: 'author-1',
  name: 'Ada',
  avatarUrl: null,
  reputationLevel: 'Newcomer',
} as unknown as AuthorSummary;

function anUpdate(overrides: Partial<UpdateSummary> = {}): UpdateSummary {
  return {
    updateId: 'post-1',
    title: 'Police checkpoint on the coast road',
    description: 'Two officers stopping traffic heading north.',
    category: 'Police',
    urgency: 'urgent',
    location: { areaName: 'Grand Baie', cityName: 'Port Louis' },
    publishedAt: new Date(Date.now() - 60_000).toISOString(),
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    confirmationCount: 2,
    verifiedResidentConfirmationCount: 1,
    requiredConfirmations: 7,
    commentCount: 0,
    verificationStatus: 'unverified',
    status: 'active',
    authorId: 'author-1',
    ...overrides,
  };
}

function renderCard(update: UpdateSummary) {
  return render(
    <ThemeProvider>
      <UpdateCard update={update} author={AUTHOR} />
    </ThemeProvider>
  );
}

beforeEach(() => {
  mockReact.mockClear();
  mockCapabilities = {
    reactions: [
      { key: 'like', label: 'Like', glyph: '👍', sentiment: 'positive', appliesTo: ['Post'] },
      {
        key: 'confirmed',
        label: 'I can confirm this',
        glyph: '✅',
        sentiment: 'corroborating',
        appliesTo: ['Post'],
      },
    ],
  };
});

describe('the confidence figure that was never measured', () => {
  /**
   * The panel used to render `min(65 + verified * 8 + confirmations * 2, 99)`
   * as "% Confidence" over a safety alert. A share of readers needs a count of
   * readers and this summary carries none, so the honest panel shows no
   * percentage at all.
   */
  it('states no percentage anywhere on the card', () => {
    renderCard(anUpdate({ confirmationCount: 14, verifiedResidentConfirmationCount: 3 }));

    expect(screen.queryByText(/%/)).toBeNull();
    expect(screen.queryByText(/confidence/i)).toBeNull();
  });

  it('renders the platform’s own verdict rather than a score', () => {
    renderCard(anUpdate({ verificationStatus: 'communityVerified' }));

    expect(screen.getByText(/community verified/i)).toBeTruthy();
  });

  /**
   * B6 deliberately lets disputes outrank corroboration — a post that is both
   * heavily confirmed and heavily disputed is the case a reader most needs
   * warned about. The card could not express it: `isVerified` tested only for
   * `CommunityVerified`, so a disputed alert read "Pending verification".
   */
  it('shows a disputed alert as disputed', () => {
    renderCard(anUpdate({ verificationStatus: 'disputed', confirmationCount: 30 }));

    expect(screen.getByText(/disputed/i)).toBeTruthy();
  });
});

describe('one count, not two tiers', () => {
  it('never splits confirmers into residents and everyone else', () => {
    renderCard(anUpdate({ confirmationCount: 14, verifiedResidentConfirmationCount: 3 }));

    expect(screen.queryByText(/local resident/i)).toBeNull();
    expect(screen.getByText(/Confirmed by 14 members/)).toBeTruthy();
  });

  it('says how many more are needed, from the threshold the server sent', () => {
    renderCard(anUpdate({ confirmationCount: 2, requiredConfirmations: 7 }));

    expect(screen.getByText(/5 more confirmations needed/)).toBeTruthy();
  });

  it('does not ask for more once the platform has verified it', () => {
    renderCard(
      anUpdate({
        verificationStatus: 'communityVerified',
        confirmationCount: 7,
        requiredConfirmations: 7,
      })
    );

    expect(screen.queryByText(/more confirmations needed/)).toBeNull();
  });

  it('reads as empty rather than as zero confirmations', () => {
    renderCard(anUpdate({ confirmationCount: 0 }));

    expect(screen.getByText(/No one has confirmed this yet/)).toBeTruthy();
  });
});

describe('the control writes to the count it displays', () => {
  it('posts the corroborating reaction, not a trust contribution', async () => {
    renderCard(anUpdate());

    fireEvent.press(screen.getByRole('button', { name: /I can confirm this/i }));

    // `confirmed` is what moves `confirmationCount` and re-evaluates the
    // threshold. The button used to post to `/trust/contributions/confirmations`,
    // which moves neither.
    await waitFor(() => expect(mockReact).toHaveBeenCalledWith('confirmed'));
  });

  /**
   * The reaction catalogue is server-owned data. A deployment that renames its
   * corroborating reaction must not silently lose the control, and one that
   * offers none must not show a button that posts a key the server rejects.
   */
  it('follows the catalogue rather than the name "confirmed"', async () => {
    mockCapabilities = {
      reactions: [
        {
          key: 'can-vouch',
          label: 'I can vouch for this',
          glyph: '✅',
          sentiment: 'corroborating',
          appliesTo: ['Post'],
        },
      ],
    };

    renderCard(anUpdate());

    fireEvent.press(screen.getByRole('button', { name: /I can vouch for this/i }));
    await waitFor(() => expect(mockReact).toHaveBeenCalledWith('can-vouch'));
  });

  it('renders no control when the deployment corroborates with nothing', () => {
    mockCapabilities = {
      reactions: [
        { key: 'like', label: 'Like', glyph: '👍', sentiment: 'positive', appliesTo: ['Post'] },
      ],
    };

    renderCard(anUpdate());

    expect(screen.queryByRole('button', { name: /confirm/i })).toBeNull();
  });

  /**
   * The control was gated behind TrustedContributor and above. B6 asks only for
   * authentication and a post you did not write, so the gate hid the platform's
   * own capability from most of the members holding it.
   */
  it('offers the control without asking the member’s reputation level', () => {
    renderCard(anUpdate());

    expect(screen.getByRole('button', { name: /I can confirm this/i })).toBeTruthy();
  });
});

describe('the viewer’s own state', () => {
  /**
   * This lived in `useState`, so it reset on remount and told a member they had
   * never confirmed something they had. The wire carries the answer.
   */
  it('comes from the wire, so it survives a remount', () => {
    const update = anUpdate({
      reactions: { totalCount: 3, counts: [], myReactionKey: 'confirmed' },
    });

    const { unmount } = renderCard(update);
    expect(screen.getByRole('button', { name: /you confirmed this/i })).toBeTruthy();

    unmount();
    renderCard(update);
    expect(screen.getByRole('button', { name: /you confirmed this/i })).toBeTruthy();
  });

  it('refuses a second press once the wire says the member confirmed', () => {
    renderCard(
      anUpdate({ reactions: { totalCount: 3, counts: [], myReactionKey: 'confirmed' } })
    );

    const control = screen.getByRole('button', { name: /you confirmed this/i });
    expect(control.props.accessibilityState).toMatchObject({ disabled: true, selected: true });

    fireEvent.press(control);
    expect(mockReact).not.toHaveBeenCalled();
  });

  it('does not mistake another reaction for a confirmation', () => {
    renderCard(anUpdate({ reactions: { totalCount: 1, counts: [], myReactionKey: 'like' } }));

    expect(screen.getByRole('button', { name: /I can confirm this/i })).toBeTruthy();
  });
});

/**
 * The urgency map was keyed `Emergency`/`Urgent`/… and the wire sends
 * `emergency`/`urgent`/…, so every lookup returned `undefined` and the render
 * read a colour off it. That is a crash, not a wrong colour, and it would have
 * fired on the first real post this card ever met.
 */
describe('vocabulary the wire actually speaks', () => {
  it.each(['emergency', 'urgent', 'normal', 'low'] as const)(
    'renders a %s alert without crashing',
    (urgency) => {
      renderCard(anUpdate({ urgency }));
      expect(screen.getByText(/Police checkpoint/)).toBeTruthy();
    }
  );

  it('survives an urgency this build has never met', () => {
    renderCard(anUpdate({ urgency: 'catastrophic' as never }));
    expect(screen.getByText(/Police checkpoint/)).toBeTruthy();
  });

  it('survives a verification status this build has never met', () => {
    renderCard(anUpdate({ verificationStatus: 'quarantined' as never }));
    expect(screen.getByText(/Police checkpoint/)).toBeTruthy();
  });
});
