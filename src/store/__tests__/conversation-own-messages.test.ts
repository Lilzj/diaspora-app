// ─────────────────────────────────────────────────────────────────────────────
// A member's own messages, from send to confirmation — 15 Sep 2026
//
// The pending bubble a send creates was stamped `senderId: 'user-current'` and
// `senderName: 'Joshua M.'` on every member's device. And the server sends
// `MessageReceived` back to the sender, echoing the pending bubble's `localId`:
// the store appended that echo as a new message — twice on screen whenever it
// beat the send's response — and counted the member's own message as unread.
// ─────────────────────────────────────────────────────────────────────────────

import { useConversationStore } from '../conversation';
import type { Conversation, Message } from '@/types/conversation';

jest.mock('@/lib/apiClient', () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));

const CONVERSATION = '01a0a1b2-0000-7000-8000-00000000c001';
const AISHA = '01a0576f-2c1d-7f00-8000-0000000000a1';
const DAVID = '01a05770-33f2-7600-8000-0000000000da';

function conversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    conversationId: CONVERSATION,
    state: 'Active',
    unreadCount: 0,
    isArchived: false,
    isMuted: false,
    isPinned: false,
    isBlocked: false,
    participants: [
      { userId: AISHA, displayName: 'Aisha Okonkwo', isCurrentUser: true, trust: { isVerified: true } },
      { userId: DAVID, displayName: 'David Mensah', isCurrentUser: false, trust: { isVerified: true } },
    ],
    createdAt: '2026-09-14T10:40:00.000Z',
    updatedAt: '2026-09-14T10:40:00.000Z',
    ...overrides,
  } as Conversation;
}

function fromServer(overrides: Partial<Message> = {}): Message {
  return {
    messageId: '01a0a1b2-0000-7000-8000-00000000e001',
    conversationId: CONVERSATION,
    senderId: DAVID,
    senderName: '',
    type: 'text',
    text: 'Yes, the room is still available.',
    delivery: { status: 'sent' },
    createdAt: '2026-09-14T10:46:00.000Z',
    ...overrides,
  };
}

const thread = () => useConversationStore.getState().messages[CONVERSATION] ?? [];
const row = () => useConversationStore.getState().conversations[0];

beforeEach(() => {
  useConversationStore.setState({
    conversations: [conversation()],
    messages: {
      [CONVERSATION]: [fromServer({ messageId: 'm-david-1', text: 'Yes, the room is still available.' })],
    },
    newMessageConversationId: null,
  });
});

describe('the pending bubble', () => {
  it('carries the member who is sending, not a fixture', () => {
    useConversationStore.getState().addOptimisticMessage(CONVERSATION, {
      text: 'Can I view it on Saturday?',
      localId: 'local-1',
      senderId: AISHA,
      senderName: 'Aisha Okonkwo',
    });

    const pending = thread()[1];
    expect(pending).toMatchObject({ senderId: AISHA, senderName: 'Aisha Okonkwo', isOptimistic: true });
    expect(JSON.stringify(thread())).not.toMatch(/user-current|Joshua M\./);
  });

  it('quotes the message it replies to from the thread', () => {
    useConversationStore.getState().addOptimisticMessage(CONVERSATION, {
      text: 'Great',
      replyToMessageId: 'm-david-1',
      localId: 'local-2',
      senderId: AISHA,
      senderName: 'Aisha Okonkwo',
    });

    expect(thread()[1].replyTo).toMatchObject({
      messageId: 'm-david-1',
      senderId: DAVID,
      previewText: 'Yes, the room is still available.',
    });
  });
});

describe('the server echoing the member’s own message', () => {
  function send() {
    useConversationStore.getState().addOptimisticMessage(CONVERSATION, {
      text: 'Can I view it on Saturday?',
      localId: 'local-3',
      senderId: AISHA,
      senderName: 'Aisha Okonkwo',
    });
  }

  const confirmed = fromServer({
    messageId: 'm-aisha-1',
    senderId: AISHA,
    text: 'Can I view it on Saturday?',
    localId: 'local-3',
  });

  it('takes the pending bubble’s place when the echo arrives first, and does not count as unread', () => {
    send();
    useConversationStore.getState().receiveMessage(confirmed, AISHA);

    expect(thread().map((m) => m.messageId)).toEqual(['m-david-1', 'm-aisha-1']);
    expect(row().unreadCount).toBe(0);
    expect(useConversationStore.getState().newMessageConversationId).toBeNull();

    // The send's own response, landing after the echo, leaves one row.
    useConversationStore.getState().confirmOptimisticMessage('local-3', confirmed);
    expect(thread().map((m) => m.messageId)).toEqual(['m-david-1', 'm-aisha-1']);
  });

  it('is ignored when it arrives after the response already confirmed the bubble', () => {
    send();
    useConversationStore.getState().confirmOptimisticMessage('local-3', confirmed);
    useConversationStore.getState().receiveMessage(confirmed, AISHA);

    expect(thread().map((m) => m.messageId)).toEqual(['m-david-1', 'm-aisha-1']);
    expect(thread()[1].isOptimistic).toBe(false);
    expect(row().unreadCount).toBe(0);
  });

  it('does not count the member’s message from another device as unread either', () => {
    useConversationStore.getState().receiveMessage(
      fromServer({ messageId: 'm-aisha-web', senderId: AISHA, text: 'Sent from my laptop' }),
      AISHA
    );

    expect(row().unreadCount).toBe(0);
  });
});

describe('the other person’s message', () => {
  it('is appended and counted as unread', () => {
    useConversationStore.getState().receiveMessage(fromServer({ messageId: 'm-david-2', text: 'Saturday works.' }), AISHA);

    expect(thread().map((m) => m.messageId)).toEqual(['m-david-1', 'm-david-2']);
    expect(row().unreadCount).toBe(1);
    expect(useConversationStore.getState().newMessageConversationId).toBe(CONVERSATION);
  });
});
