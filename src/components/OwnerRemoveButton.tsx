// ─────────────────────────────────────────────────────────────────────────────
// "Remove listing", for the owner, on the screen where they see their listing
//
// Added 13 Oct 2026 at the owner's request. Only jobs offered this on their own
// page; marketplace, housing and guides could be removed only from the Creator
// workspace, and businesses, events, organisations and updates not at all.
//
// Asks before acting, says what happened, and goes back — the item is gone, so
// the screen showing it has nothing left to show.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity } from 'react-native';

import { useNotification } from '@/providers/notification-provider';
import { backOr } from '@/lib/navigation';

interface OwnerRemoveButtonProps {
  /** What the member calls it: "listing", "event", "update", "guide". */
  noun: string;
  /** The server call. Throws on failure. */
  onRemove: () => Promise<unknown>;
  /** Where to go afterwards when there is no screen to go back to. */
  fallback?: string;
}

export function OwnerRemoveButton({ noun, onRemove, fallback = '/(tabs)' }: OwnerRemoveButtonProps) {
  const { showAlert, showToast } = useNotification();
  const [isRemoving, setIsRemoving] = useState(false);

  const remove = async () => {
    setIsRemoving(true);
    try {
      await onRemove();
      showToast({ type: 'success', title: 'Removed', message: `Your ${noun} has been removed from Diaspora.` });
      backOr(fallback);
    } catch {
      showAlert({
        type: 'error',
        title: `Could not remove this ${noun}`,
        message: 'Nothing was changed. Please try again in a moment.',
      });
    } finally {
      setIsRemoving(false);
    }
  };

  const confirm = () =>
    showAlert({
      type: 'warning',
      title: `Remove this ${noun}?`,
      message: `It will no longer be visible to anyone on Diaspora.`,
      buttons: [
        { text: 'Keep it', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => void remove() },
      ],
    });

  return (
    <TouchableOpacity
      onPress={confirm}
      disabled={isRemoving}
      accessibilityRole="button"
      accessibilityLabel={`Remove this ${noun}`}
      className="items-center py-4 mb-4"
    >
      {isRemoving ? (
        <ActivityIndicator color="#DC2626" />
      ) : (
        <Text className="text-sm font-bold text-error-default">Remove this {noun}</Text>
      )}
    </TouchableOpacity>
  );
}
