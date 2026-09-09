// ─────────────────────────────────────────────────────────────────────────────
// Who a conversation is with
//
// Both the header and the list row read
//
//     participants.find((p) => !p.isCurrentUser)?.displayName || 'Unknown'
//
// **Not every conversation has another person in it.** Messaging an
// organisation addresses the organisation, which is not a user and so is not a
// participant — so the screen said "Unknown" with a "?" for an avatar, above a
// context card that was displaying the organisation's name at that moment.
//
// Found by opening one. The conversation always knew what it was about.
// ─────────────────────────────────────────────────────────────────────────────

import {
  conversationInitials,
  conversationSubtitle,
  conversationTitle,
  otherParticipant,
} from '../conversation-title';
import type { Conversation, ConversationParticipant } from '@/types/conversation';

function participant(overrides: Partial<ConversationParticipant> = {}): ConversationParticipant {
  return {
    userId: 'u-1',
    displayName: 'Aline Ramgoolam',
    isCurrentUser: false,
    trust: { isVerified: true },
    ...overrides,
  } as ConversationParticipant;
}

function conversation(
  overrides: Partial<Pick<Conversation, 'participants' | 'context'>> = {}
): Pick<Conversation, 'participants' | 'context'> {
  return {
    participants: [participant({ userId: 'me', isCurrentUser: true }), participant()],
    context: {
      type: 'MarketplaceListing',
      entityId: 'l-1',
      entityTitle: 'Hand-woven vacoas basket set',
      entitySubtitle: 'Seller: Aline',
      snapshotAt: '2026-09-09T10:00:00Z',
    },
    ...overrides,
  } as Pick<Conversation, 'participants' | 'context'>;
}

/** Messaging an organisation: nobody on the other side is a user. */
function withOrganisation(): Pick<Conversation, 'participants' | 'context'> {
  return conversation({
    participants: [participant({ userId: 'me', isCurrentUser: true })],
    context: {
      type: 'Organization',
      entityId: 'org-1',
      entityTitle: 'Curepipe Community Trust',
      entitySubtitle: 'Hometown association',
      snapshotAt: '2026-09-09T10:00:00Z',
    },
  } as Partial<Pick<Conversation, 'participants' | 'context'>>);
}

describe('what to call a conversation', () => {
  it('names the other person when there is one', () => {
    expect(conversationTitle(conversation())).toBe('Aline Ramgoolam');
  });

  it('names an organisation by what the conversation is about', () => {
    // **The defect.** No other participant, so the header said "Unknown"
    // directly above a card showing this exact name.
    expect(conversationTitle(withOrganisation())).toBe('Curepipe Community Trust');
  });

  it('prefers the person over the subject when both are there', () => {
    // A marketplace conversation is about a listing and with its seller. The
    // seller is who you are talking to.
    expect(conversationTitle(conversation())).not.toBe('Hand-woven vacoas basket set');
  });

  it('says Unknown only when there is genuinely nothing to go on', () => {
    const empty = conversation({
      participants: [participant({ userId: 'me', isCurrentUser: true })],
      context: { ...conversation().context, entityTitle: '' },
    } as Partial<Pick<Conversation, 'participants' | 'context'>>);

    expect(conversationTitle(empty)).toBe('Unknown');
  });
});

describe('the line under the name', () => {
  it('is nothing when a person is there, because that row carries presence', () => {
    expect(conversationSubtitle(conversation())).toBeNull();
  });

  it('says what the organisation is, which it has instead of presence', () => {
    expect(conversationSubtitle(withOrganisation())).toBe('Hometown association');
  });

  it('is nothing when the subject has no subtitle', () => {
    const bare = conversation({
      participants: [participant({ userId: 'me', isCurrentUser: true })],
      context: { ...withOrganisation().context, entitySubtitle: undefined },
    } as Partial<Pick<Conversation, 'participants' | 'context'>>);

    expect(conversationSubtitle(bare)).toBeNull();
  });
});

describe('the avatar', () => {
  it('takes initials from the person', () => {
    expect(conversationInitials(conversation())).toBe('AR');
  });

  it('takes them from the organisation rather than showing a question mark', () => {
    expect(conversationInitials(withOrganisation())).toBe('CC');
  });

  it('falls back to a question mark only with nothing to initial', () => {
    const empty = conversation({
      participants: [participant({ userId: 'me', isCurrentUser: true })],
      context: { ...conversation().context, entityTitle: '' },
    } as Partial<Pick<Conversation, 'participants' | 'context'>>);

    expect(conversationInitials(empty)).toBe('?');
  });
});

describe('finding the other person', () => {
  it('skips the current user', () => {
    expect(otherParticipant(conversation())?.userId).toBe('u-1');
  });

  it('is undefined when the counterparty is not a person', () => {
    // What the two screens were reading, and why they said "Unknown".
    expect(otherParticipant(withOrganisation())).toBeUndefined();
  });
});
