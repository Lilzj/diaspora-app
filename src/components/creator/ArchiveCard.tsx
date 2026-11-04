import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useNotification } from '@/providers/notification-provider';
import { ArchivedItem } from '@/types/creator';
import { useContentManagementStore } from '@/store/content-management';
import { canPerform, performWorkspaceAction } from '@/lib/creator/workspace-actions';
import { ContentTypeChip } from './ContentTypeChip';

interface ArchiveCardProps {
  item: ArchivedItem;
}

export const ArchiveCard: React.FC<ArchiveCardProps> = ({ item }) => {
  const { restoreItem, deletePermanently, loadContent } = useContentManagementStore();
  const { showAlert, showToast } = useNotification();

  // ── Both controls are real now ─────────────────────────────────────────
  //
  // The note here used to read: *"Restore has no route to call (`/restore`
  // exists per module, but for a Guid this card does not hold)"* — which named
  // the blocker exactly. The archive list is read from
  // `GET /{module}/…?status=Archived` rather than from `mockArchivedItems`, so
  // the card holds the Guid, and `POST /{module}/{id}/restore` and
  // `DELETE /{module}/{id}` are both callable.
  //
  // The local row still moves only **after** the server agrees. An optimistic
  // restore that had to be undone would be the same false report in a shorter
  // window.

  const handleRestore = async () => {
    const result = await performWorkspaceAction('restore', item.contentType, item.id);
    if (result.outcome === 'done') {
      restoreItem(item.id);
      loadContent();
      showToast({ type: 'success', title: 'Restored', message: `"${item.title}" is back in your workspace.` });
      return;
    }
    showToast({ type: 'error', title: 'Not restored', message: result.reason });
  };

  const handleDeletePermanent = () => {
    showAlert({
      type: 'warning',
      title: 'Delete permanently?',
      message: `"${item.title}" will be deleted. This cannot be undone.`,
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const result = await performWorkspaceAction('delete', item.contentType, item.id);
            if (result.outcome === 'done') {
              deletePermanently(item.id);
              loadContent();
              showToast({ type: 'success', title: 'Deleted', message: `"${item.title}" has been deleted.` });
              return;
            }
            showToast({ type: 'error', title: 'Not deleted', message: result.reason });
          },
        },
      ],
    });
  };

  return (
    <View className="bg-surface-card border border-subtle rounded-3xl p-4 mb-3 shadow-sm opacity-90">
      <View className="flex-row justify-between items-start mb-2">
        <View className="flex-row items-center gap-2">
          <ContentTypeChip type={item.contentType} size="sm" />
          <View className="bg-surface-muted border border-subtle px-2 py-0.5 rounded-full">
            <Text className="text-[9px] font-black text-content-tertiary uppercase">Reason: {item.archiveReason}</Text>
          </View>
        </View>

        <Text className="text-[9px] text-content-faint font-semibold">{item.archiveDate}</Text>
      </View>

      <Text className="text-sm font-bold text-content-strong leading-snug my-1">{item.title}</Text>

      <Text className="text-[10px] text-content-faint font-semibold mb-3">
        Original Identity: {item.publishingIdentityName}
      </Text>

      <View className="flex-row justify-between items-center pt-2.5 border-t border-faint">
        {/* Withheld rather than offered-and-explained where the module has no
            route — an `Update` and a `Provider` are archivable in this client's
            type union and in nothing else. */}
        {canPerform('restore', item.contentType) ? (
          <TouchableOpacity
            onPress={handleRestore}
            className="bg-surface-muted border border-subtle px-3.5 py-1.5 rounded-xl"
            accessibilityRole="button"
            accessibilityLabel={`Restore ${item.title}`}
          >
            <Text className="text-xs font-black text-success-default">↺ Restore Content</Text>
          </TouchableOpacity>
        ) : (
          <Text className="text-[10px] font-semibold text-content-faint">
            Restore this from the item itself
          </Text>
        )}

        {canPerform('delete', item.contentType) ? (
          <TouchableOpacity
            onPress={handleDeletePermanent}
            className="bg-surface-muted border border-subtle px-3.5 py-1.5 rounded-xl"
            accessibilityRole="button"
            accessibilityLabel={`Delete ${item.title} permanently`}
          >
            {/* "Delete Permanently" came off when nothing was deleted. The route
                is wired, so the label says what it does again. */}
            <Text className="text-xs font-black text-error-default">🗑️ Delete permanently</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
};
