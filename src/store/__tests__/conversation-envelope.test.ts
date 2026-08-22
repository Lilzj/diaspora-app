// ─────────────────────────────────────────────────────────────────────────────
// The inbox reads the platform's envelope, not the envelope's wrapper
//
// ── The crash this pins ──────────────────────────────────────────────────────
//
// `loadConversations` did `set({ conversations: res.data.data })`.
// `GET /conversations` answers the platform's cursor envelope:
//
//   { data: { items, nextCursor, hasMore, totalUnread, unappliedFilters } }
//
// so `conversations` became the **envelope object** rather than the array.
// `selectTotalUnread` calls `.filter` on it, from `TabLayout`, which renders on
// every tab — so the app died on launch with
// `TypeError: undefined is not a function` for **any member who had at least
// one conversation**.
//
// ── Why nothing caught it ────────────────────────────────────────────────────
//
// Under Metro the inbox comes from fixtures, which are already arrays. Every
// unit test fed the store an array directly. The runtime probe called
// `GET /conversations` and asserted a 200 — the route was never the problem.
// And the walkthrough member had an empty inbox, so the release build launched
// fine until a conversation was seeded for them.
//
// A member with an empty inbox and a member with one conversation take
// different branches, and only one of them had ever been run.
// ─────────────────────────────────────────────────────────────────────────────

import { selectTotalUnread, useConversationStore } from '../conversation';
import { apiClient } from '@/lib/apiClient';
import type { Conversation } from '@/types/conversation';

jest.mock('@/lib/apiClient', () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));

const mockGet = apiClient.get as jest.Mock;

/** One row, shaped as the route serves it. */
function conversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    conversationId: '01a02695-8fd2-7955-a18f-3c5b7364219d',
    unreadCount: 3,
    isArchived: false,
    isMuted: false,
    isPinned: false,
    participants: [],
    ...overrides,
  } as Conversation;
}

beforeEach(() => {
  mockGet.mockReset();
  useConversationStore.setState({ conversations: [], requests: [] });
});

describe('the inbox survives a member who actually has conversations', () => {
  it('reads the cursor envelope the platform serves', async () => {
    // The exact shape `GET /conversations` returns, keys and all.
    mockGet.mockResolvedValue({
      data: {
        data: {
          items: [conversation()],
          nextCursor: null,
          hasMore: false,
          totalUnread: 3,
          unappliedFilters: [],
        },
      },
    });

    await useConversationStore.getState().loadConversations();

    const { conversations } = useConversationStore.getState();

    expect(Array.isArray(conversations)).toBe(true);
    expect(conversations).toHaveLength(1);
  });

  it('lets the tab bar count unread without throwing', () => {
    // The actual crash, reproduced at the call site. `selectTotalUnread` is
    // called from `TabLayout`, so anything it cannot handle takes the whole app
    // down on launch rather than degrading one screen.
    useConversationStore.setState({ conversations: [conversation(), conversation({ unreadCount: 2 })] });

    expect(() => selectTotalUnread(useConversationStore.getState().conversations)).not.toThrow();
    expect(selectTotalUnread(useConversationStore.getState().conversations)).toBe(5);
  });

  it('still works when a route answers a bare array', async () => {
    // `readPage` accepts both, so a route that changes shape — or one that
    // never used the envelope — cannot reintroduce the crash.
    mockGet.mockResolvedValue({ data: { data: [conversation()] } });

    await useConversationStore.getState().loadConversations();

    expect(useConversationStore.getState().conversations).toHaveLength(1);
  });

  it('leaves the list an array when the request fails', async () => {
    mockGet.mockRejectedValue(new Error('offline'));

    await useConversationStore.getState().loadConversations();

    const { conversations, conversationsError } = useConversationStore.getState();

    // The failure path must not leave a non-array behind either: the tab bar
    // renders whether or not the inbox loaded.
    expect(Array.isArray(conversations)).toBe(true);
    expect(conversationsError).toBeTruthy();
    expect(() => selectTotalUnread(conversations)).not.toThrow();
  });

  it('reads the same envelope for message requests', async () => {
    // The identical bug, one function down. It would have crashed the requests
    // screen the moment a member received one.
    mockGet.mockResolvedValue({
      data: { data: { items: [{ requestId: 'r1' }], nextCursor: null, hasMore: false } },
    });

    await useConversationStore.getState().loadRequests();

    expect(Array.isArray(useConversationStore.getState().requests)).toBe(true);
    expect(useConversationStore.getState().requests).toHaveLength(1);
  });
});

describe('opening a conversation shows the messages it has', () => {
  it('reads messages from inside the envelope', async () => {
    // `GET /conversations/{id}` answers
    // `{ data: { conversation, messages, nextCursor, hasMore } }`.
    mockGet.mockResolvedValue({
      data: {
        data: {
          conversation: { conversationId: 'c1' },
          messages: [{ messageId: 'm1', conversationId: 'c1', text: 'Hello' }],
          nextCursor: null,
          hasMore: false,
        },
      },
    });

    await useConversationStore.getState().loadMessages('c1');

    // The read used to be `res.data.messages` — undefined, coerced to `[]` by
    // `|| []`, so a thread with messages rendered blank and looked empty rather
    // than broken.
    expect(useConversationStore.getState().messages['c1']).toHaveLength(1);
    expect(useConversationStore.getState().messages['c1'][0].text).toBe('Hello');
  });

  it('yields an empty thread, not a crash, when the payload has no messages', async () => {
    mockGet.mockResolvedValue({ data: { data: { conversation: { conversationId: 'c2' } } } });

    await useConversationStore.getState().loadMessages('c2');

    expect(useConversationStore.getState().messages['c2']).toEqual([]);
    expect(useConversationStore.getState().isLoadingMessages['c2']).toBe(false);
  });

  it('clears the loading flag when the request fails', async () => {
    mockGet.mockRejectedValue(new Error('offline'));

    await useConversationStore.getState().loadMessages('c3');

    // A stuck spinner is the other way this screen can lie about its state.
    expect(useConversationStore.getState().isLoadingMessages['c3']).toBe(false);
  });
});

describe('conversation message search returns rows, not the response body', () => {
  it('reads results from inside the envelope', async () => {
    // `POST /conversations/search` answers `{ data: { results, provider } }`.
    // The store read `res.data.results` — undefined — and assigned it to a list
    // the screen renders, so search could never show a hit.
    (apiClient.post as jest.Mock).mockResolvedValue({
      data: { data: { results: [{ conversationId: 'c1' }], provider: 'pg' } },
    });

    await useConversationStore.getState().searchMessages('seeded');

    const { searchResults, isSearching } = useConversationStore.getState();
    expect(Array.isArray(searchResults)).toBe(true);
    expect(searchResults).toHaveLength(1);
    expect(isSearching).toBe(false);
  });

  it('leaves an array behind when the payload has no results', async () => {
    (apiClient.post as jest.Mock).mockResolvedValue({ data: { data: { provider: 'pg' } } });

    await useConversationStore.getState().searchMessages('nothing');

    expect(useConversationStore.getState().searchResults).toEqual([]);
  });
});

describe('a conversation opened by deep link is found', () => {
  // The screen derives both its header and its does-this-exist check from
  // `conversations.find(...)` over the inbox list — and nothing on that screen
  // loads the inbox. Opening a conversation any way other than tapping its row
  // rendered "Conversation not found" for a conversation that exists and whose
  // messages had just been fetched successfully.
  //
  // Not a race. Nothing would ever have populated it.
  it('keeps the conversation the detail route already returned', async () => {
    mockGet.mockResolvedValue({
      data: {
        data: {
          conversation: { conversationId: 'c1', unreadCount: 0, participants: [] },
          messages: [{ messageId: 'm1', conversationId: 'c1', text: 'Hello' }],
        },
      },
    });

    await useConversationStore.getState().loadMessages('c1');

    const { conversations } = useConversationStore.getState();
    expect(conversations.map((c) => c.conversationId)).toContain('c1');
  });

  it('does not duplicate a conversation the inbox already had', async () => {
    useConversationStore.setState({
      conversations: [conversation({ conversationId: 'c1', unreadCount: 9 })],
    });

    mockGet.mockResolvedValue({
      data: {
        data: {
          conversation: { conversationId: 'c1', unreadCount: 0, participants: [] },
          messages: [],
        },
      },
    });

    await useConversationStore.getState().loadMessages('c1');

    const { conversations } = useConversationStore.getState();
    expect(conversations.filter((c) => c.conversationId === 'c1')).toHaveLength(1);
    // And the fresher copy wins, so the header does not show a stale unread count.
    expect(conversations[0].unreadCount).toBe(0);
  });

  it('leaves the list alone when the payload carries no conversation', async () => {
    useConversationStore.setState({ conversations: [conversation({ conversationId: 'other' })] });

    mockGet.mockResolvedValue({ data: { data: { messages: [] } } });

    await useConversationStore.getState().loadMessages('c1');

    expect(useConversationStore.getState().conversations.map((c) => c.conversationId)).toEqual([
      'other',
    ]);
  });
});
