// ─────────────────────────────────────────────────────────────────────────────
// Who wrote a message — 15 Sep 2026
//
// In the two-account walkthrough, everything Aisha sent to David sat on the left
// of her own screen, in his colours, with a "?" avatar and no ticks. The thread
// compared senders with `'user-current'`, the fixtures' member id, and the
// server sends real user ids. These tests pin the rules that replaced it, using
// the two walkthrough members' shapes.
// ─────────────────────────────────────────────────────────────────────────────

import {
  authorName,
  currentUserIdIn,
  initialsOf,
  isOwnMessage,
  sameUser,
  withAuthors,
} from '@/lib/conversation-identity';
import type { ConversationParticipant, Message } from '@/types/conversation';

const AISHA = '01a0576f-2c1d-7f00-8000-0000000000a1';
const DAVID = '01a05770-33f2-7600-8000-0000000000da';
const SYSTEM = '00000000-0000-0000-0000-000000000000';

const trust = { isVerified: true } as ConversationParticipant['trust'];

/** Aisha's view of her conversation with David: the server marks her as the current user. */
const participants: ConversationParticipant[] = [
  { userId: AISHA, displayName: 'Aisha Okonkwo', trust, isCurrentUser: true },
  { userId: DAVID, displayName: 'David Mensah', trust, isCurrentUser: false },
];

function message(overrides: Partial<Message> = {}): Message {
  return {
    messageId: 'm1',
    conversationId: 'c1',
    senderId: AISHA,
    // What `MessageResponse` sends: no name, ever.
    senderName: null as unknown as string,
    type: 'text',
    text: 'Is the room still available?',
    delivery: { status: 'sent' },
    createdAt: '2026-09-14T10:45:00.000Z',
    ...overrides,
  };
}

describe('the same person', () => {
  it('matches ids regardless of casing, and never matches a blank or the system sender', () => {
    expect(sameUser(AISHA, AISHA.toUpperCase())).toBe(true);
    expect(sameUser(AISHA, DAVID)).toBe(false);
    expect(sameUser('', '')).toBe(false);
    expect(sameUser(SYSTEM, SYSTEM)).toBe(false);
    expect(sameUser(undefined, AISHA)).toBe(false);
  });
});

describe('who the member is in a conversation', () => {
  it('takes the participant the server marked, before the signed-in account', () => {
    expect(currentUserIdIn({ participants }, 'someone-else')).toBe(AISHA);
  });

  it('falls back to the signed-in account for a conversation not loaded yet', () => {
    expect(currentUserIdIn(undefined, DAVID)).toBe(DAVID);
    expect(currentUserIdIn(undefined, null)).toBeNull();
  });
});

describe('whose message it is', () => {
  it('is the member’s when they sent it — the comparison the thread used to get wrong', () => {
    expect(isOwnMessage(message(), AISHA)).toBe(true);
    expect(isOwnMessage(message({ senderId: DAVID }), AISHA)).toBe(false);
  });

  it('never matched a real member against the fixtures’ id', () => {
    expect(isOwnMessage(message(), 'user-current')).toBe(false);
  });

  it('counts a pending bubble as the member’s own, and a system message as nobody’s', () => {
    expect(isOwnMessage(message({ senderId: '', isOptimistic: true }), AISHA)).toBe(true);
    expect(isOwnMessage(message({ senderId: SYSTEM }), SYSTEM)).toBe(false);
  });
});

describe('naming authors', () => {
  it('calls the member "You" and names the other person from the participants', () => {
    expect(authorName(AISHA, participants, AISHA)).toBe('You');
    expect(authorName(DAVID, participants, AISHA)).toBe('David Mensah');
    expect(authorName('stranger', participants, AISHA)).toBe('');
  });

  it('gives initials, and nothing rather than "?" for no name', () => {
    expect(initialsOf('David Mensah')).toBe('DM');
    expect(initialsOf('  aisha  okonkwo ')).toBe('AO');
    expect(initialsOf('')).toBe('');
    expect(initialsOf(null)).toBe('');
  });

  it('names the author and the quoted author the server left null', () => {
    const reply = message({
      senderId: DAVID,
      replyTo: { messageId: 'm0', senderId: AISHA, senderName: null as unknown as string, previewText: 'Is the room still available?' },
    });

    const named = withAuthors(reply, participants, AISHA);
    expect(named.senderName).toBe('David Mensah');
    // `ReplyBubble` fell back to "You" for every reply — right here only by accident.
    expect(named.replyTo?.senderName).toBe('You');

    const answer = withAuthors(
      message({ replyTo: { messageId: 'm2', senderId: DAVID, senderName: '', previewText: 'Yes, it is.' } }),
      participants,
      AISHA
    );
    expect(answer.senderName).toBe('You');
    expect(answer.replyTo?.senderName).toBe('David Mensah');
  });

  it('keeps a name the message carries for somebody the conversation does not list', () => {
    expect(withAuthors(message({ senderId: 'stranger', senderName: 'Guest' }), participants, AISHA).senderName).toBe('Guest');
  });
});
