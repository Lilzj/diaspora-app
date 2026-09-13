// ─────────────────────────────────────────────────────────────────────────────
// The bell, and how many are waiting behind it — 13 Sep 2026
//
// Reported from the device: "users don't know they have a notification because
// nothing is showing on the bell icon when they log in."
//
// The count had been available the whole time. `useUnreadNotificationCount`
// reads `GET /notifications/unread-count`, a served route, and had **zero
// consumers** — the commonest defect in this codebase: right code, no caller.
// The bell was a link with nothing to say.
//
// ── What the badge is allowed to claim ──────────────────────────────────────
//
// Nothing, until the platform has answered. A badge is a statement about the
// member's inbox, so while the count is loading or the request failed there is
// no badge — not a zero, and not a dot. The same rule the rest of this session
// has been applying to empty states: unanswered is not none.
//
// Zero also draws nothing. A "0" badge is visual noise that trains people to
// ignore the thing that matters when it is a 3.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';

import { useTheme } from '@/design-system';
import { useUnreadNotificationCount } from '@/hooks/notifications';

/**
 * Above this the badge stops counting and starts saying "a lot".
 *
 * Three digits is already wider than the bell it sits on; the exact number
 * stops being information long before that, and the inbox itself has it.
 */
const MAX_SHOWN = 99;

export function unreadBadgeLabel(total: number): string {
  return total > MAX_SHOWN ? `${MAX_SHOWN}+` : String(total);
}

/**
 * How the bell reads to a screen reader.
 *
 * The count belongs in the label rather than only in the badge — a badge is
 * invisible to somebody who cannot see it, and "Notifications" alone would give
 * them no reason to open it.
 */
export function unreadAccessibilityLabel(total: number): string {
  if (total <= 0) return 'Notifications';
  if (total === 1) return 'Notifications, 1 unread';
  return `Notifications, ${total} unread`;
}

export function NotificationBell() {
  const { tokens } = useTheme();
  const { total, isLoading } = useUnreadNotificationCount();

  const show = !isLoading && total > 0;

  return (
    <TouchableOpacity
      accessible
      accessibilityRole="button"
      accessibilityLabel={unreadAccessibilityLabel(show ? total : 0)}
      onPress={() => router.push('/notifications')}
      className="p-2 active:opacity-60"
    >
      <Text className="text-xl">🔔</Text>

      {show ? (
        <View
          // `pointerEvents` none so the badge cannot eat the tap that opens the
          // inbox — the one thing a member does with a bell that has a number on
          // it.
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{
            position: 'absolute',
            top: 2,
            right: 0,
            minWidth: 18,
            height: 18,
            borderRadius: 9,
            backgroundColor: tokens.color.error.default,
            borderWidth: 1.5,
            borderColor: tokens.color.surface.background,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 4,
          }}
        >
          <Text
            numberOfLines={1}
            style={{ color: '#ffffff', fontSize: 10, fontWeight: '900', lineHeight: 13 }}
          >
            {unreadBadgeLabel(total)}
          </Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}
