// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — one card, drawn a row at a time (FARCH-004, 27 Nov 2026)
//
// Two creator lists that page sit inside one `CreatorCard`: every earning on
// the revenue screen, and everyone a member invited. A list that pages is a
// FlashList, and a FlashList draws each row in a cell of its own, so there is
// no element left to wrap the rows in a card. Each row draws its slice of the
// card instead: the sides always, the top edge and its corners on the first
// row, the bottom edge and its corners on whatever closes the card (the last
// row, or the "Load more" under it). Laid end to end the slices are the card
// `CreatorCard` draws: the same surface, border and radius.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { View } from 'react-native';
import { useTheme } from '@/design-system';

export function CreatorCardSlice({
  first = false,
  last = false,
  children,
}: {
  /** Opens the card: its top edge and corners. */
  first?: boolean;
  /** Closes the card: its bottom edge and corners. */
  last?: boolean;
  children: React.ReactNode;
}) {
  const { tokens } = useTheme();

  return (
    <View
      style={{
        backgroundColor: tokens.color.surface.card,
        borderColor: tokens.color.border.default,
      }}
      className={`border-x ${first ? 'border-t rounded-t-2xl' : ''} ${last ? 'border-b rounded-b-2xl' : ''}`}
    >
      {children}
    </View>
  );
}
