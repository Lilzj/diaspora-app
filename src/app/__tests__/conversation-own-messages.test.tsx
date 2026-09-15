/**
 * A member's own messages on the conversation screen — 15 Sep 2026.
 *
 * In the two-account walkthrough, Aisha's messages to David showed on the left
 * of her own screen, in his colours, with a "?" avatar and no ticks: the screen
 * compared senders with `'user-current'`, the fixtures' member id. This renders
 * the screen with the conversation as the server sends it — real user ids, the
 * member marked `isCurrentUser`, and no `senderName` on any message.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { ThemeProvider } from '@/design-system';
import { useConversationStore } from '@/store/conversation';
import type { Conversation, Message } from '@/types/conversation';

jest.mock('@/lib/conversation-hub', () => ({
  ConversationHub: {
    markRead: jest.fn(() => Promise.resolve()),
    joinConversation: jest.fn(() => Promise.resolve(true)),
    leaveConversation: jest.fn(() => Promise.resolve()),
    onConnectionStateChange: jest.fn(() => () => {}),
    sendMessage: jest.fn(() => Promise.resolve()),
    emitTypingStarted: jest.fn(),
    emitTypingEnded: jest.fn(),
    openConversation: jest.fn(),
  },
}));
jest.mock('@/store/auth', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({ user: { userId: '01a0576f-2c1d-7f00-8000-0000000000a1', fullName: 'Aisha Okonkwo' } }),
}));
jest.mock('@/providers/notification-provider', () => ({
  useNotification: () => ({ showAlert: jest.fn() }),
}));
jest.mock('@/components/ReportModal', () => ({ ReportModal: () => null }));
jest.mock('@/lib/apiClient', () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

// Every row, rendered. The screen opens the list at its last message, and a
// virtualised list with no layout in a test renders only from there — which let
// an assertion about the first message pass without that message on screen.
jest.mock('react-native/Libraries/Lists/FlatList', () => {
  const ReactActual = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  const List = ReactActual.forwardRef(
    (
      props: {
        data: unknown[];
        renderItem: (info: { item: unknown; index: number }) => React.ReactNode;
        keyExtractor: (item: unknown) => string;
        ListHeaderComponent?: React.ReactNode;
        ListFooterComponent?: React.ReactNode;
      },
      ref: unknown
    ) => {
      ReactActual.useImperativeHandle(ref, () => ({ scrollToEnd: () => {}, scrollToIndex: () => {} }));
      return ReactActual.createElement(
        View,
        null,
        props.ListHeaderComponent,
        props.data.map((item, index) =>
          ReactActual.createElement(View, { key: props.keyExtractor(item) }, props.renderItem({ item, index }))
        ),
        props.ListFooterComponent
      );
    }
  );
  return { __esModule: true, default: List };
});

const fs = require('fs') as {
  readFileSync(p: string, e: string): string;
  readdirSync(p: string, o: { withFileTypes: true }): { name: string; isDirectory(): boolean }[];
};
const path = require('path') as { join(...s: string[]): string; relative(a: string, b: string): string };

// eslint-disable-next-line import/first
import ConversationScreen from '../conversation/[id]';

const CONVERSATION = '01a0a1b2-0000-7000-8000-00000000c001';
const AISHA = '01a0576f-2c1d-7f00-8000-0000000000a1';
const DAVID = '01a05770-33f2-7600-8000-0000000000da';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

function conversation(): Conversation {
  return {
    conversationId: CONVERSATION,
    state: 'Active',
    context: {
      type: 'HousingListing',
      entityId: 'rose-hill-room',
      entityTitle: 'Single room in a shared house, Rose Hill',
      entitySubtitle: 'Host: Mensah Property Rentals',
      snapshotAt: '2026-09-14T10:40:00.000Z',
    },
    participants: [
      // The server's `isCurrentUser`, computed for Aisha.
      { userId: AISHA, displayName: 'Aisha Okonkwo', isCurrentUser: true, trust: { isVerified: true } },
      { userId: DAVID, displayName: 'David Mensah', isCurrentUser: false, trust: { isVerified: false } },
    ],
    unreadCount: 0,
    isPinned: false,
    isMuted: false,
    isArchived: false,
    isBlocked: false,
    createdAt: '2026-09-14T10:40:00.000Z',
    updatedAt: '2026-09-14T10:47:00.000Z',
  } as Conversation;
}

/** `MessageResponse`: a real sender id and, always, no sender name. */
function message(id: string, senderId: string, text: string, minute: number, extra: Partial<Message> = {}): Message {
  return {
    messageId: id,
    conversationId: CONVERSATION,
    senderId,
    senderName: null as unknown as string,
    type: 'text',
    text,
    delivery: { status: 'read', sentAt: `2026-09-14T10:${minute}:00.000Z` },
    createdAt: `2026-09-14T10:${minute}:00.000Z`,
    ...extra,
  };
}

function renderThread(messages: Message[]) {
  useConversationStore.setState({
    conversations: [conversation()],
    messages: { [CONVERSATION]: messages },
    isLoadingMessages: { [CONVERSATION]: false },
    loadMessages: jest.fn(async () => {}),
    markConversationRead: jest.fn(),
  });

  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider>
        <ConversationScreen />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

beforeEach(() => {
  (useLocalSearchParams as jest.Mock).mockReturnValue({ id: CONVERSATION });
});

describe('the thread, as Aisha sees it', () => {
  it('puts her messages on her side, and names only David on his', () => {
    const header = renderThread([]);
    const initialsInHeader = screen.queryAllByText('DM').length;
    header.unmount();

    renderThread([
      message('m1', AISHA, 'Is the room still available?', 45),
      message('m2', DAVID, 'Yes, it is.', 46),
      message('m3', AISHA, 'Can I view it on Saturday?', 47),
    ]);

    expect(screen.getByText('Is the room still available?')).toBeTruthy();
    expect(screen.getByText('Can I view it on Saturday?')).toBeTruthy();

    // One avatar, on David's one message. Aisha's two used to carry "?" avatars
    // as though somebody else had written them.
    expect(screen.queryAllByText('DM')).toHaveLength(initialsInHeader + 1);
    expect(screen.queryByText('AO')).toBeNull();
    expect(screen.queryByText('?')).toBeNull();
  });

  it('labels a reply by who was actually quoted', () => {
    const plain = renderThread([message('m1', AISHA, 'Is the room still available?', 45)]);
    const namesWithoutReplies = screen.queryAllByText('David Mensah').length;
    plain.unmount();

    renderThread([
      message('m1', AISHA, 'Is the room still available?', 45),
      message('m2', DAVID, 'Yes, it is.', 46, {
        replyTo: { messageId: 'm1', senderId: AISHA, senderName: null as unknown as string, previewText: 'Is the room still available?' },
      }),
      message('m3', AISHA, 'Great, thank you', 47, {
        replyTo: { messageId: 'm2', senderId: DAVID, senderName: null as unknown as string, previewText: 'Yes, it is.' },
      }),
    ]);

    // Every reply said "You" before, including Aisha's reply to David.
    expect(screen.queryAllByText('David Mensah')).toHaveLength(namesWithoutReplies + 1);
    expect(screen.getAllByText('You')).toHaveLength(1);
    expect(screen.queryByText('Earlier message')).toBeNull();
  });

  it('offers Edit on her own message and not on David’s', () => {
    const own = renderThread([message('m1', AISHA, 'Is the room still available?', 45)]);
    fireEvent(screen.getByText('Is the room still available?'), 'longPress');
    expect(screen.queryByText('Edit Message')).toBeTruthy();
    own.unmount();

    renderThread([message('m2', DAVID, 'Yes, it is.', 46)]);
    fireEvent(screen.getByText('Yes, it is.'), 'longPress');
    expect(screen.queryByText('Edit Message')).toBeNull();
  });
});

describe('no screen or store decides identity by the fixtures’ id', () => {
  function sources(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        return entry.name === '__tests__' || entry.name === 'mocks' ? [] : sources(full);
      }
      return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
    });
  }

  it('finds no `user-current` literal outside the development fixtures', () => {
    const root = path.join(process.cwd(), 'src');
    const offenders = sources(root).filter((file) =>
      fs
        .readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '')
        .includes("'user-current'")
    );

    expect(offenders.map((file) => path.relative(root, file))).toEqual([]);
  });
});
