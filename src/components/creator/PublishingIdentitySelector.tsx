import React from 'react';
import { View, Text, TouchableOpacity, Modal, Image, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNotification } from '@/providers/notification-provider';
import { usePublishingIdentityStore } from '@/store/publishing-identity';
import { useCreatorWorkspaceStore } from '@/store/creator-workspace';

export const PublishingIdentitySelector: React.FC = () => {
  const insets = useSafeAreaInsets();
  const { showToast } = useNotification();
  const { activeIdentity, identities, isSelectorOpen, setIsSelectorOpen, setActiveIdentity } =
    usePublishingIdentityStore();
  const { setIdentityFilter } = useCreatorWorkspaceStore();

  const handleSelectIdentity = (identity: (typeof identities)[0]) => {
    setActiveIdentity(identity);
    setIdentityFilter(identity.id === 'user-me' ? 'all' : identity.id);
    setIsSelectorOpen(false);
    showToast({ type: 'success', title: 'Identity Switched', message: `Now operating as: ${identity.name}` });
  };

  return (
    <>
      {/* Top Header Selector Pill */}
      <TouchableOpacity
        onPress={() => setIsSelectorOpen(true)}
        className="bg-neutral-900 border border-neutral-700 px-3.5 py-2 rounded-2xl flex-row items-center justify-between"
      >
        <View className="flex-row items-center flex-1 mr-2">
          <Image source={{ uri: activeIdentity.avatar }} className="w-6 h-6 rounded-full mr-2 bg-neutral-700" />
          <View className="flex-1">
            <Text className="text-[9px] text-content-faint font-extrabold uppercase tracking-wider">Publishing As</Text>
            <View className="flex-row items-center">
              <Text className="text-xs font-black text-white" numberOfLines={1}>
                {activeIdentity.name}
              </Text>
              {activeIdentity.verified && <Text className="text-[10px] text-success-default ml-1">✓</Text>}
            </View>
          </View>
        </View>
        <Text className="text-content-faint text-xs font-bold">▼</Text>
      </TouchableOpacity>

      {/* Identity Switcher Bottom Sheet Modal */}
      <Modal visible={isSelectorOpen} transparent animationType="slide" onRequestClose={() => setIsSelectorOpen(false)}>
        <TouchableOpacity activeOpacity={1} onPress={() => setIsSelectorOpen(false)} className="flex-1 bg-black/60 justify-end">
          <TouchableOpacity
            activeOpacity={1}
            style={{ paddingBottom: Math.max(insets.bottom + 16, 28) }}
            className="bg-surface-card rounded-t-3xl p-6 shadow-2xl"
          >
            <View className="w-12 h-1.5 bg-neutral-250 rounded-full self-center mb-4" />
            
            <View className="flex-row justify-between items-center pb-4 border-b border-faint mb-4">
              <View className="flex-1 mr-2">
                <Text className="text-base font-black text-content-primary tracking-tight">Switch Publishing Identity</Text>
                <Text className="text-xs text-content-muted">Select which profile or organization to publish content as</Text>
              </View>
              <TouchableOpacity onPress={() => setIsSelectorOpen(false)} className="bg-surface-muted p-2 rounded-full">
                <Text className="text-xs font-black text-content-tertiary">✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView className="max-h-[380px]" showsVerticalScrollIndicator={false}>
              {identities.map((identity) => {
                const isSelected = activeIdentity.id === identity.id;
                return (
                  <TouchableOpacity
                    key={identity.id}
                    onPress={() => handleSelectIdentity(identity)}
                    className={`flex-row items-center p-3.5 mb-2.5 rounded-2xl border ${
                      isSelected ? 'border-primary-500 bg-primary-50/20' : 'border-subtle bg-surface-card'
                    }`}
                  >
                    <Image source={{ uri: identity.avatar }} className="w-10 h-10 rounded-full mr-3 bg-surface-muted" />
                    <View className="flex-1">
                      <View className="flex-row items-center">
                        <Text className="text-xs font-black text-content-primary mr-1">{identity.name}</Text>
                        {identity.verified && <Text className="text-xs text-success-default">✓</Text>}
                      </View>
                      <Text className="text-[10px] text-content-muted font-semibold">{identity.handle} · {identity.followerCount} followers</Text>
                      {identity.badgeText && (
                        <Text className="text-[8px] font-black text-primary-500 bg-primary-50 px-1.5 py-0.2 rounded mt-1 self-start">
                          {identity.badgeText}
                        </Text>
                      )}
                    </View>
                    {isSelected && <Text className="text-primary-500 font-black text-lg">✓</Text>}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </>
  );
};
