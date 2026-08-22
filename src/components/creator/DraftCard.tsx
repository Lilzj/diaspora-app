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

  // `store/creator-draft.ts` is seeded from `mockCreatorDrafts` and never
  // fetches, so every action on this card edits a fixture in memory. There is
  // also no drafts API to migrate onto later: the platform has **no unified
  // creator content or workspace listing route at all**, and no duplicate/clone
  // route anywhere in any module. So these three controls are not waiting on a
  // store migration the way the archive controls are — two of them are waiting
  // on a capability nobody has built.

  const handleSaveRename = () => {
    if (titleText.trim()) {
      renameDraft(draft.id, titleText.trim());
      showToast({
        type: 'info',
        title: 'Not saved',
        message: 'Renamed in this preview only. Diaspora cannot rename drafts yet.',
      });
    }
    setIsEditingTitle(false);
  };

  const handleDuplicate = () => {
    duplicateDraft(draft.id);
    showToast({
      type: 'info',
      title: 'Not saved',
      message: 'Diaspora cannot duplicate drafts yet. This copy will be gone when you come back.',
    });
  };

  const handleDelete = () => {
    showAlert({
      type: 'info',
      title: 'Diaspora cannot delete drafts',
      message: `"${draft.title}" will disappear from this preview until you reload, and nothing will be deleted.`,
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove here',
          onPress: () => {
            deleteDraft(draft.id);
            showToast({
              type: 'info',
              title: 'Not deleted',
              message: 'Removed from this preview only.',
            });
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
    <View className="bg-surface-card border border-subtle rounded-3xl p-4 mb-3 shadow-sm">
      <View className="flex-row justify-between items-start mb-2">
        <View className="flex-row items-center gap-2">
          <ContentTypeChip type={draft.draftType} size="sm" />
          <View className="bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full flex-row items-center">
            <View className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1" />
            <Text className="text-[9px] font-black text-emerald-700 uppercase">Autosaved</Text>
          </View>
        </View>

        <Text className="text-[9px] text-content-faint font-semibold">{draft.lastEdited}</Text>
      </View>

      {/* Editable Title */}
      {isEditingTitle ? (
        <View className="flex-row items-center my-1 gap-2">
          <TextInput
            value={titleText}
            onChangeText={setTitleText}
            className="flex-1 bg-surface-background border border-primary-500 rounded-xl px-3 py-1.5 text-xs font-bold text-content-primary"
            autoFocus
          />
          <TouchableOpacity onPress={handleSaveRename} className="bg-primary-500 px-3 py-1.5 rounded-xl">
            <Text className="text-xs font-black text-white">Save</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity onPress={() => setIsEditingTitle(true)}>
          <Text className="text-sm font-bold text-content-primary leading-snug my-1">
            {draft.title} <Text className="text-[10px] text-content-faint font-normal">✏️</Text>
          </Text>
        </TouchableOpacity>
      )}

      <Text className="text-xs text-content-muted leading-relaxed mb-3" numberOfLines={2}>
        {draft.excerpt}
      </Text>

      {/* Progress Bar */}
      <View className="mb-3">
        <View className="flex-row justify-between mb-1">
          <Text className="text-[9px] font-extrabold text-content-faint uppercase">Draft Progress</Text>
          <Text className="text-[9px] font-black text-primary-500">{draft.progressPercent}% · {draft.estimatedCompletion}</Text>
        </View>
        <View className="h-1.5 bg-surface-muted rounded-full overflow-hidden">
          <View className="h-full bg-primary-500 rounded-full" style={{ width: `${draft.progressPercent}%` }} />
        </View>
      </View>

      {/* Actions */}
      <View className="flex-row justify-between items-center pt-2.5 border-t border-faint">
        <TouchableOpacity onPress={handleResume} className="bg-primary-500 px-3.5 py-1.5 rounded-xl">
          <Text className="text-xs font-black text-white">Continue Draft →</Text>
        </TouchableOpacity>

        <View className="flex-row gap-1.5">
          <TouchableOpacity onPress={handleDuplicate} className="bg-surface-background border border-subtle px-2.5 py-1.5 rounded-xl">
            <Text className="text-xs font-black text-content-secondary">📄 Copy</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={handleDelete} className="bg-surface-background border border-subtle px-2.5 py-1.5 rounded-xl">
            <Text className="text-xs font-black text-error-default">🗑️</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};
