/**
 * A row a FlashList hands the next item (FARCH-004, 27 Nov 2026).
 *
 * FlashList does not mount a new row for each item. It hands a row that has
 * scrolled away the item scrolling in, and whatever the row was holding goes
 * with it. These are the rows that held something: a photograph that failed, a
 * voice note playing, a notification swiped open. Each test re-renders one row
 * with a different item, which is what recycling does to it, and checks that
 * nothing of the first item reaches the second.
 */
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Image } from 'expo-image';
import { ThemeProvider } from '@/design-system';
import { ListingPhoto } from '../ListingPhoto';
import { MessageBubble } from '../conversation/MessageBubble';
import { NotificationItem } from '../NotificationItem';
import type { Message } from '@/types/conversation';

const mockReset = jest.fn();
jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => {
  const ReactActual = jest.requireActual('react');
  const Swipeable = ReactActual.forwardRef(
    ({ children }: { children: React.ReactNode }, ref: React.Ref<unknown>) => {
      ReactActual.useImperativeHandle(ref, () => ({
        reset: mockReset,
        close: jest.fn(),
        openLeft: jest.fn(),
        openRight: jest.fn(),
      }));
      return children;
    }
  );
  return { __esModule: true, default: Swipeable };
});

const wrap = (node: React.ReactElement) => render(<ThemeProvider>{node}</ThemeProvider>);

describe('a listing photograph', () => {
  const FIRST = 'https://media.example/first.jpg';
  const SECOND = 'https://media.example/second.jpg';

  it('goes blank, not to the last listing’s picture, while a recycled row loads', () => {
    wrap(<ListingPhoto uri={FIRST} style={{ width: 100, height: 100 }} />);
    expect(screen.UNSAFE_getByType(Image).props.recyclingKey).toBe(FIRST);
  });

  it('gives the next listing’s photograph its own chance to load', () => {
    const { rerender } = wrap(<ListingPhoto uri={FIRST} style={{ width: 100, height: 100 }} />);
    act(() => {
      screen.UNSAFE_getByType(Image).props.onError?.({ error: 'HTTP 404' });
    });
    expect(screen.getByLabelText('Photo unavailable')).toBeTruthy();

    // The same row, handed the next listing.
    rerender(
      <ThemeProvider>
        <ListingPhoto uri={SECOND} style={{ width: 100, height: 100 }} />
      </ThemeProvider>
    );

    expect(screen.queryByLabelText('Photo unavailable')).toBeNull();
    expect(screen.UNSAFE_getByType(Image).props.source).toEqual({ uri: SECOND });
  });
});

describe('a voice note', () => {
  const voice = (messageId: string) =>
    ({
      messageId,
      conversationId: 'c1',
      senderId: 'u2',
      senderName: 'David',
      type: 'voice',
      attachment: { attachmentId: `a-${messageId}`, type: 'voice', uploadState: 'completed', createdAt: '2026-11-27T10:00:00Z' },
      delivery: { status: 'delivered' },
      createdAt: '2026-11-27T10:00:00Z',
    }) as unknown as Message;

  it('does not carry "playing" onto the next voice note', () => {
    const { rerender } = wrap(<MessageBubble message={voice('m1')} isCurrentUser={false} />);
    fireEvent.press(screen.getByText('▶'));
    expect(screen.getByText('⏸')).toBeTruthy();

    rerender(
      <ThemeProvider>
        <MessageBubble message={voice('m2')} isCurrentUser={false} />
      </ThemeProvider>
    );

    expect(screen.getByText('▶')).toBeTruthy();
    expect(screen.queryByText('⏸')).toBeNull();
  });
});

describe('a notification', () => {
  const row = (id: string, title: string) => (
    <ThemeProvider>
      <NotificationItem
        id={id}
        title={title}
        body="Body"
        category="system"
        isRead
        createdAt="2026-11-27T10:00:00Z"
        onDelete={jest.fn()}
      />
    </ThemeProvider>
  );

  beforeEach(() => mockReset.mockClear());

  it('arrives closed when the row is handed another notification', () => {
    const { rerender } = render(row('n1', 'First'));
    const onMount = mockReset.mock.calls.length;

    rerender(row('n2', 'Second'));
    expect(mockReset.mock.calls.length).toBe(onMount + 1);
    expect(screen.getByText('Second')).toBeTruthy();
  });

  it('is left as it is when the same notification redraws', () => {
    const { rerender } = render(row('n1', 'First'));
    const before = mockReset.mock.calls.length;

    rerender(row('n1', 'First, edited'));
    expect(mockReset.mock.calls.length).toBe(before);
  });
});
