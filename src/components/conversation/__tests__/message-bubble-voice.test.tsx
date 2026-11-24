// ─────────────────────────────────────────────────────────────────────────────
// A voice note's bubble, from the attachment the route sends
//
// `MessageAttachmentResponse` gives a voice note its length and no waveform.
// The bubble drew `waveformData`, which no route sends, and otherwise twenty
// `Math.random()` bars computed during render: a waveform that was not the
// note's own, and that changed shape whenever the bubble re-rendered. Pressing
// play re-renders it (RMD-009).
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '@/design-system';
import { MessageBubble } from '../MessageBubble';
import type { Message } from '@/types/conversation';

/** A voice message as `MessageResponse` sends one: a length, and no waveform. */
const VOICE: Message = {
  messageId: 'm-voice',
  conversationId: 'c1',
  senderId: 'user-david',
  senderName: 'David Mensah',
  type: 'voice',
  attachment: {
    attachmentId: 'a-voice',
    type: 'voice',
    uploadState: 'completed',
    mediaAssetId: 'asset-voice',
    mimeType: 'audio/m4a',
    sizeBytes: 89_600,
    durationSeconds: 28,
    createdAt: '2026-11-20T10:00:00.000Z',
  },
  delivery: { status: 'read' },
  createdAt: '2026-11-20T10:00:00.000Z',
};

function trackHeights(): unknown[] {
  return screen
    .getByTestId('voice-track')
    .children.map((bar) => (typeof bar === 'string' ? bar : StyleSheet.flatten(bar.props.style)?.height));
}

describe('a voice note draws a track that is not a made-up waveform', () => {
  let random: jest.SpyInstance;

  beforeEach(() => {
    // Every call a different number for the first 97, so a track computed during
    // render cannot come out the same twice.
    let calls = 0;
    random = jest.spyOn(Math, 'random').mockImplementation(() => {
      calls += 1;
      return (calls % 97) / 97;
    });
  });

  afterEach(() => {
    random.mockRestore();
  });

  it('draws twenty bars of one height, and the same bars after play is pressed', () => {
    render(
      <ThemeProvider>
        <MessageBubble message={VOICE} isCurrentUser={false} />
      </ThemeProvider>
    );

    const before = trackHeights();
    expect(before).toHaveLength(20);
    expect(new Set(before).size).toBe(1);

    fireEvent.press(screen.getByText('▶'));
    expect(screen.getByText('⏸')).toBeTruthy();
    expect(trackHeights()).toEqual(before);
  });

  it('says how long the note is', () => {
    render(
      <ThemeProvider>
        <MessageBubble message={VOICE} isCurrentUser={false} />
      </ThemeProvider>
    );

    expect(screen.getByText('0:28')).toBeTruthy();
  });
});
