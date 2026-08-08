import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useNotification } from '@/providers/notification-provider';
import { BulkActionType } from '@/types/creator';
import { useCreatorWorkspaceStore } from '@/store/creator-workspace';
import { useContentManagementStore } from '@/store/content-management';

export const BulkActionToolbar: React.FC = () => {
  const { selectedItemIds, clearSelection } = useCreatorWorkspaceStore();
  const { executeBulkAction } = useContentManagementStore();
  const { showAlert, showToast } = useNotification();

  if (selectedItemIds.length === 0) return null;

  const handleAction = (action: BulkActionType, label: string) => {
    showAlert({
      type: action === 'delete' ? 'error' : 'warning',
      title: `Confirm Bulk ${label}`,
      message: `Perform "${label}" on ${selectedItemIds.length} selected items?`,
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Proceed',
          style: action === 'delete' ? 'destructive' : 'default',
          onPress: () => {
            const res = executeBulkAction(action, selectedItemIds);
            showToast({ type: 'success', title: 'Bulk Action Completed', message: `Updated ${res.count} items.` });
            clearSelection();
          },
        },
      ],
    });
  };

  return (
    <View className="absolute bottom-6 left-6 right-6 bg-neutral-900 rounded-3xl p-4 shadow-2xl flex-row items-center justify-between border border-neutral-700">
      <View className="flex-row items-center mr-2">
        <View className="w-7 h-7 rounded-full bg-primary-500 items-center justify-center mr-2">
          <Text className="text-white font-black text-xs">{selectedItemIds.length}</Text>
        </View>
        <Text className="text-xs font-bold text-white">Selected</Text>
      </View>

      <View className="flex-row gap-1.5 flex-wrap justify-end flex-1">
        <TouchableOpacity
          onPress={() => handleAction('archive', 'Archive')}
          className="bg-neutral-800 border border-neutral-700 px-2.5 py-1.5 rounded-xl"
        >
          <Text className="text-[10px] font-black text-neutral-200">📦 Archive</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => handleAction('pause', 'Pause')}
          className="bg-neutral-800 border border-neutral-700 px-2.5 py-1.5 rounded-xl"
        >
          <Text className="text-[10px] font-black text-neutral-200">⏸️ Pause</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => handleAction('renew', 'Renew')}
          className="bg-primary-500 px-2.5 py-1.5 rounded-xl"
        >
          <Text className="text-[10px] font-black text-white">🚀 Renew</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => handleAction('delete', 'Delete')}
          className="bg-rose-900/60 border border-rose-700 px-2.5 py-1.5 rounded-xl"
        >
          <Text className="text-[10px] font-black text-rose-300">🗑️ Delete</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={clearSelection} className="bg-neutral-700 p-1.5 rounded-xl">
          <Text className="text-neutral-300 text-xs font-black">✕</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};
