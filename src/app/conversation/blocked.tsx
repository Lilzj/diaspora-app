/**
 * Blocked Users Screen
 */

import React, { useState } from 'react';
import { useNotification } from '@/providers/notification-provider';
import { View, Text, FlatList, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/components/ScreenHeader';
import { ConversationHub } from '@/lib/conversation-hub';
import { mockBlockedUsers } from '@/mocks/conversation-data';
import type { BlockedUser } from '@/types/conversation';

export default function BlockedUsersScreen() {
  const { showAlert } = useNotification();
  const [blocked, setBlocked] = useState<BlockedUser[]>(mockBlockedUsers);

  const handleUnblock = (user: BlockedUser) => {
    showAlert({ type: 'warning', title: `Unblock ${user.displayName}?`, message: 'They will be able to message you again.', buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unblock',
          onPress: async () => {
            await ConversationHub.unblock(user.userId);
            setBlocked((prev) => prev.filter((u) => u.userId !== user.userId));
          },
        },
      ] });
  };

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-surface-background">
      <ScreenHeader title="Blocked Users" showBack />

      {blocked.length === 0 ? (
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-5xl mb-6">🔓</Text>
          <Text className="text-lg font-bold text-content-strong text-center">No blocked users</Text>
          <Text className="text-sm text-content-muted text-center mt-2">
            Users you block will appear here.
          </Text>
        </View>
      ) : (
        <FlatList
          data={blocked}
          keyExtractor={(item) => item.userId}
          contentContainerStyle={{ padding: 16 }}
          renderItem={({ item }) => (
            <View className="bg-surface-card border border-subtle rounded-2xl px-4 py-4 mb-3 flex-row items-center">
              <View className="w-12 h-12 rounded-full bg-subtle items-center justify-center mr-3">
                <Text className="text-content-muted font-bold text-base">🚫</Text>
              </View>
              <View className="flex-1">
                <Text className="text-sm font-bold text-content-primary">{item.displayName}</Text>
                {item.reason && (
                  <Text className="text-[11px] text-content-muted mt-0.5">Reason: {item.reason}</Text>
                )}
                <Text className="text-[10px] text-content-faint mt-0.5">
                  Blocked {new Date(item.blockedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => handleUnblock(item)}
                className="bg-surface-muted border border-subtle px-3 py-2 rounded-xl"
                activeOpacity={0.7}
              >
                <Text className="text-xs font-bold text-content-secondary">Unblock</Text>
              </TouchableOpacity>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}
