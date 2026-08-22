// ─────────────────────────────────────────────────────────────────────────────
// Bulk actions — the count was the fabrication
//
// `executeBulkAction` returns `{ success: true, count }` from a local zustand
// reducer over `mockCreatorContent`, and the toolbar reported that count as
// *"Bulk Action Completed — Updated N items."* A member who selected nine
// listings and pressed Archive was told nine listings had been archived. None
// had. The number was the most convincing part of the lie, because a fabricated
// success is easy to doubt and a fabricated *tally* reads like a receipt.
//
// **The platform has no bulk surface at all.** Not a route that takes a list of
// ids, not a command, not a handler — in any module. Archive and delete exist
// only one listing at a time (`POST /{module}/listings/{id}/archive`,
// `DELETE /{module}/listings/{id}`), pause does not exist as a concept, and
// renew does not exist anywhere (see `QuickActionsMenu.handleRenew`). So this
// is not "wire it up when the store migration lands" — three of these four
// verbs have nothing to be wired to, and the fourth would be a client-side
// loop issuing N requests with no partial-failure story.
//
// The toolbar therefore keeps selection — which is genuinely useful, and which
// the filter bar and cards already build on — and stops claiming the work was
// done.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useNotification } from '@/providers/notification-provider';
import { BulkActionType } from '@/types/creator';
import { useCreatorWorkspaceStore } from '@/store/creator-workspace';

export const BulkActionToolbar: React.FC = () => {
  const { selectedItemIds, clearSelection } = useCreatorWorkspaceStore();
  // `executeBulkAction` is no longer called from here — see the header. The
  // store action is left in place for any other caller; this toolbar simply
  // stops reporting its local tally as a result.
  const { showAlert } = useNotification();

  if (selectedItemIds.length === 0) return null;

  const handleAction = (action: BulkActionType, label: string) => {
    showAlert({
      type: 'info',
      title: `Diaspora cannot ${label.toLowerCase()} in bulk`,
      message:
        `There is no way to ${label.toLowerCase()} ${selectedItemIds.length} item${selectedItemIds.length === 1 ? '' : 's'} at once. Nothing will be sent. Open each listing to change it.`,
      buttons: [
        { text: 'OK', style: 'cancel' },
        {
          // Kept because the *selection* is still worth clearing, and because a
          // member who has just been told the action is unavailable most likely
          // wants the toolbar out of the way.
          text: 'Clear selection',
          onPress: () => clearSelection(),
        },
      ],
    });
  };

  return (
    <View className="absolute bottom-6 left-6 right-6 bg-surface-inverse rounded-3xl p-4 shadow-2xl flex-row items-center justify-between border border-line">
      <View className="flex-row items-center mr-2">
        <View className="w-7 h-7 rounded-full bg-primary-500 items-center justify-center mr-2">
          <Text className="text-content-inverse font-black text-xs">{selectedItemIds.length}</Text>
        </View>
        <Text className="text-xs font-bold text-content-inverse">Selected</Text>
      </View>

      <View className="flex-row gap-1.5 flex-wrap justify-end flex-1">
        <TouchableOpacity
          onPress={() => handleAction('archive', 'Archive')}
          className="bg-surface-inverse border border-line px-2.5 py-1.5 rounded-xl"
        >
          <Text className="text-[10px] font-black text-subtle">📦 Archive</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => handleAction('pause', 'Pause')}
          className="bg-surface-inverse border border-line px-2.5 py-1.5 rounded-xl"
        >
          <Text className="text-[10px] font-black text-subtle">⏸️ Pause</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => handleAction('renew', 'Renew')}
          className="bg-primary-500 px-2.5 py-1.5 rounded-xl"
        >
          <Text className="text-[10px] font-black text-content-inverse">🚀 Renew</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => handleAction('delete', 'Delete')}
          className="bg-rose-900/60 border border-rose-700 px-2.5 py-1.5 rounded-xl"
        >
          <Text className="text-[10px] font-black text-rose-300">🗑️ Delete</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={clearSelection} className="bg-surface-inverse p-1.5 rounded-xl">
          <Text className="text-content-faint text-xs font-black">✕</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};
