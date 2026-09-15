// ─────────────────────────────────────────────────────────────────────────────
// The typing line — 15 Sep 2026
//
// The live typing signal carries a user id and no name. The store printed
// `${userName} is typing...`, so an unnamed typist read " is typing..." with
// nothing in front of it. The hub now names them from the conversation's
// participants; this pins what happens when it cannot.
// ─────────────────────────────────────────────────────────────────────────────

import { useTypingStore } from '../typing';

const CONVERSATION = 'c1';

beforeEach(() => {
  // The store clears a typist after five seconds on a real timer.
  jest.useFakeTimers();
  useTypingStore.setState({ typing: {} });
});

afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
});

describe('who is typing', () => {
  it('names the typist when the conversation does', () => {
    useTypingStore.getState().setTyping(CONVERSATION, 'david', 'David Mensah');
    expect(useTypingStore.getState().getTypingLabel(CONVERSATION)).toBe('David Mensah is typing...');
  });

  it('never prints a blank where a name should be', () => {
    useTypingStore.getState().setTyping(CONVERSATION, 'someone', '');
    expect(useTypingStore.getState().getTypingLabel(CONVERSATION)).toBe('Typing...');

    useTypingStore.getState().setTyping(CONVERSATION, 'david', 'David Mensah');
    expect(useTypingStore.getState().getTypingLabel(CONVERSATION)).toBe('2 people are typing...');
  });
});
