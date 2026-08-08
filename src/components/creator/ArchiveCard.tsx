import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useNotification } from '@/providers/notification-provider';
import { ArchivedItem } from '@/types/creator';
import { useContentManagementStore } from '@/store/content-management';
import { ContentTypeChip } from './ContentTypeChip';

interface ArchiveCardProps {
  item: ArchivedItem;
}

export const ArchiveCard: React.FC<ArchiveCardProps> = ({ item }) => {
  const { restoreItem, deletePermanently } = useContentManagementStore();
  const { showAlert, showToast } = useNotification();

  const handleRestore = () => {
    restoreItem(item.id);
    showToast({ type: 'success', title: 'Restored', message: `"${item.title}" restored back to your active workspace.` });
  };

  const handleDeletePermanent = () => {
    showAlert({
      type: 'error',
      title: 'Delete Permanently',
      message: `Are you sure you want to permanently delete "${item.title}"?`,
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Forever',
          style: 'destructive',
          onPress: () => {
            deletePermanently(item.id);
            showToast({ type: 'error', title: 'Deleted', message: 'Item deleted forever.' });
          },
        },
      ],
    });
  };

  return (
    <View className="bg-white border border-neutral-200 rounded-3xl p-4 mb-3 shadow-sm opacity-90">
      <View className="flex-row justify-between items-start mb-2">
        <View className="flex-row items-center gap-2">
          <ContentTypeChip type={item.contentType} size="sm" />
          <View className="bg-neutral-100 border border-neutral-250 px-2 py-0.5 rounded-full">
            <Text className="text-[9px] font-black text-neutral-600 uppercase">Reason: {item.archiveReason}</Text>
          </View>
        </View>

        <Text className="text-[9px] text-neutral-400 font-semibold">{item.archiveDate}</Text>
      </View>

      <Text className="text-sm font-bold text-neutral-800 leading-snug my-1">{item.title}</Text>

      <Text className="text-[10px] text-neutral-400 font-semibold mb-3">
        Original Identity: {item.publishingIdentityName}
      </Text>

      <View className="flex-row justify-between items-center pt-2.5 border-t border-neutral-100">
        <TouchableOpacity onPress={handleRestore} className="bg-emerald-50 border border-emerald-200 px-3.5 py-1.5 rounded-xl">
          <Text className="text-xs font-black text-emerald-700">↺ Restore Content</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={handleDeletePermanent} className="bg-rose-50 border border-rose-200 px-3.5 py-1.5 rounded-xl">
          <Text className="text-xs font-black text-rose-700">🗑️ Delete Permanently</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};
