// ─────────────────────────────────────────────────────────────────────────────
// What the hub does with live events about the member themself — 15 Sep 2026
//
// The server fans typing signals and read receipts out to the whole
// conversation group, the member included, and names nobody. Two things went
// wrong on the phones once the socket stayed up:
//
//   * opening a thread sent the member's own read receipt back to them, which
//     marked their own last message "read" with two green ticks;
//   * a member's own typing, and an unnamed typist, would read as somebody else
//     — " is typing..." with no name in front of it.
// ─────────────────────────────────────────────────────────────────────────────

import { useConversationStore } from '@/store/conversation';
import { useTypingStore } from '@/store/typing';
import type { Conversation, ReadReceiptEvent, TypingEvent } from '@/types/conversation';

type Handler<T> = (event: T) => void;

const handlers: {
  read?: Handler<ReadReceiptEvent>;
  typing?: Handler<TypingEvent>;
  created?: Handler<{ conversationId: string }>;
} = {};

jest.mock('@/lib/realtime', () => ({
  conversationGroup: (id: string) => `conversation:${id}`,
  getRealtimeClient: () => ({
    connect: jest.fn(async () => {}),
    onMessage: () => () => {},
    onTyping: (handler: Handler<TypingEvent>) => {
      handlers.typing = handler;
      return () => {};
    },
    onPresence: () => () => {},
    onReadReceipt: (handler: Handler<ReadReceiptEvent>) => {
      handlers.read = handler;
      return () => {};
    },
    onDelivery: () => () => {},
    onConversationCreated: (handler: Handler<{ conversationId: string }>) => {
      handlers.created = handler;
      return () => {};
    },
    disconnect: jest.fn(),
  }),
}));

jest.mock('@/store/auth', () => ({
  useAuthStore: { getState: () => ({ user: { userId: '01a0576f-2c1d-7f00-8000-0000000000a1', fullName: 'Aisha Okonkwo' } }) },
}));

jest.mock('@/lib/apiClient', () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

jest.mock('@/providers/notification-provider', () => ({ showAlertOutsideReact: jest.fn() }));

// eslint-disable-next-line import/first
import { ConversationHub } from '@/lib/conversation-hub';

const CONVERSATION = '01a0a1b2-0000-7000-8000-00000000c001';
const AISHA = '01a0576f-2c1d-7f00-8000-0000000000a1';
const DAVID = '01a05770-33f2-7600-8000-0000000000da';

beforeAll(async () => {
  jest.useFakeTimers();
  await ConversationHub.initialize(AISHA);
});

afterAll(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
});

beforeEach(() => {
  useTypingStore.setState({ typing: {} });
  useConversationStore.setState({
    conversations: [
      {
        conversationId: CONVERSATION,
        participants: [
          { userId: AISHA, displayName: 'Aisha Okonkwo', isCurrentUser: true, trust: { isVerified: true } },
          { userId: DAVID, displayName: 'David Mensah', isCurrentUser: false, trust: { isVerified: true } },
        ],
      } as Conversation,
    ],
    messages: {
      [CONVERSATION]: [
        {
          messageId: 'a1',
          conversationId: CONVERSATION,
          senderId: AISHA,
          senderName: '',
          type: 'text',
          text: 'How much?',
          delivery: { status: 'sent' },
          createdAt: '2026-09-14T16:12:47.000Z',
        },
      ],
    },
  });
});

describe('read receipts', () => {
  const status = () => useConversationStore.getState().messages[CONVERSATION][0].delivery.status;

  it('ignores the member’s own read, which reaches their own device too', () => {
    handlers.read?.({ conversationId: CONVERSATION, messageId: 'a1', readByUserId: AISHA, readAt: '2026-09-15T08:00:00.000Z' });
    expect(status()).toBe('sent');
  });

  it('marks the member’s message read when the other person read it', () => {
    handlers.read?.({ conversationId: CONVERSATION, messageId: 'a1', readByUserId: DAVID, readAt: '2026-09-15T08:00:00.000Z' });
    expect(status()).toBe('read');
  });
});

describe('typing', () => {
  const label = () => useTypingStore.getState().getTypingLabel(CONVERSATION);
  const signal = (userId: string): TypingEvent => ({
    eventType: 'TypingStarted',
    conversationId: CONVERSATION,
    userId,
    userName: '',
    timestamp: '2026-09-15T08:00:00.000Z',
  });

  it('never tells the member that they are typing', () => {
    handlers.typing?.(signal(AISHA));
    expect(label()).toBeNull();
  });

  it('names the other person from the conversation, since the signal carries no name', () => {
    handlers.typing?.(signal(DAVID));
    expect(label()).toBe('David Mensah is typing...');
  });
});

// 6 Nov 2026: the frame was dropped, and an open inbox never showed a
// conversation started with the member — "I'm interested" on a job, say.
describe('a new conversation', () => {
  it('reads the inbox again when the conversation is not in it', () => {
    const loadConversations = jest.fn(async () => {});
    useConversationStore.setState({ loadConversations });

    handlers.created?.({ conversationId: '01a0a1b2-0000-7000-8000-00000000c002' });

    expect(loadConversations).toHaveBeenCalledTimes(1);
  });

  it('leaves the inbox alone when it already has the conversation', () => {
    const loadConversations = jest.fn(async () => {});
    useConversationStore.setState({ loadConversations });

    handlers.created?.({ conversationId: CONVERSATION });

    expect(loadConversations).not.toHaveBeenCalled();
  });
});
