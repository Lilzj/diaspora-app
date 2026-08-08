import React, { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput } from 'react-native';
import { useNotification } from '@/providers/notification-provider';
import { CreatorDraft } from '@/types/creator';
import { useCreatorDraftStore } from '@/store/creator-draft';
import { ContentTypeChip } from './ContentTypeChip';
import { router } from 'expo-router';

interface DraftCardProps {
  draft: CreatorDraft;
}

export const DraftCard: React.FC<DraftCardProps> = ({ draft }) => {
  const { renameDraft, duplicateDraft, deleteDraft } = useCreatorDraftStore();
  const { showAlert, showToast } = useNotification();
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleText, setTitleText] = useState(draft.title);

  const handleSaveRename = () => {
    if (titleText.trim()) {
      renameDraft(draft.id, titleText.trim());
      showToast({ type: 'success', title: 'Renamed', message: 'Draft title updated.' });
    }
    setIsEditingTitle(false);
  };

  const handleDuplicate = () => {
    duplicateDraft(draft.id);
    showToast({ type: 'success', title: 'Draft Duplicated', message: `Copied "${draft.title}"` });
  };

  const handleDelete = () => {
    showAlert({
      type: 'error',
      title: 'Delete Draft',
      message: `Are you sure you want to delete draft "${draft.title}"?`,
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteDraft(draft.id);
            showToast({ type: 'error', title: 'Deleted', message: 'Draft removed.' });
          },
        },
      ],
    });
  };

  const handleResume = () => {
    if (draft.draftType === 'Guide') {
      router.push('/guide/create');
    } else if (draft.draftType === 'Update') {
      router.push('/update/create');
    } else if (draft.draftType === 'Housing') {
      router.push('/housing/create');
    } else {
      router.push('/(tabs)/post');
    }
  };

  return (
    <View className="bg-white border border-neutral-200 rounded-3xl p-4 mb-3 shadow-sm">
      <View className="flex-row justify-between items-start mb-2">
        <View className="flex-row items-center gap-2">
          <ContentTypeChip type={draft.draftType} size="sm" />
          <View className="bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full flex-row items-center">
            <View className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1" />
            <Text className="text-[9px] font-black text-emerald-700 uppercase">Autosaved</Text>
          </View>
        </View>

        <Text className="text-[9px] text-neutral-400 font-semibold">{draft.lastEdited}</Text>
      </View>

      {/* Editable Title */}
      {isEditingTitle ? (
        <View className="flex-row items-center my-1 gap-2">
          <TextInput
            value={titleText}
            onChangeText={setTitleText}
            className="flex-1 bg-neutral-50 border border-primary-500 rounded-xl px-3 py-1.5 text-xs font-bold text-neutral-900"
            autoFocus
          />
          <TouchableOpacity onPress={handleSaveRename} className="bg-primary-500 px-3 py-1.5 rounded-xl">
            <Text className="text-xs font-black text-white">Save</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity onPress={() => setIsEditingTitle(true)}>
          <Text className="text-sm font-bold text-neutral-900 leading-snug my-1">
            {draft.title} <Text className="text-[10px] text-neutral-400 font-normal">✏️</Text>
          </Text>
        </TouchableOpacity>
      )}

      <Text className="text-xs text-neutral-500 leading-relaxed mb-3" numberOfLines={2}>
        {draft.excerpt}
      </Text>

      {/* Progress Bar */}
      <View className="mb-3">
        <View className="flex-row justify-between mb-1">
          <Text className="text-[9px] font-extrabold text-neutral-400 uppercase">Draft Progress</Text>
          <Text className="text-[9px] font-black text-primary-500">{draft.progressPercent}% · {draft.estimatedCompletion}</Text>
        </View>
        <View className="h-1.5 bg-neutral-100 rounded-full overflow-hidden">
          <View className="h-full bg-primary-500 rounded-full" style={{ width: `${draft.progressPercent}%` }} />
        </View>
      </View>

      {/* Actions */}
      <View className="flex-row justify-between items-center pt-2.5 border-t border-neutral-100">
        <TouchableOpacity onPress={handleResume} className="bg-primary-500 px-3.5 py-1.5 rounded-xl">
          <Text className="text-xs font-black text-white">Continue Draft →</Text>
        </TouchableOpacity>

        <View className="flex-row gap-1.5">
          <TouchableOpacity onPress={handleDuplicate} className="bg-neutral-50 border border-neutral-200 px-2.5 py-1.5 rounded-xl">
            <Text className="text-xs font-black text-neutral-700">📄 Copy</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={handleDelete} className="bg-neutral-50 border border-neutral-200 px-2.5 py-1.5 rounded-xl">
            <Text className="text-xs font-black text-error-default">🗑️</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};
