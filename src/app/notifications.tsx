import React from 'react';
import { View, Text, FlatList, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/components/ScreenHeader';
import { NotificationItem } from '@/components/NotificationItem';
import { EmptyState } from '@/components/EmptyState';
import { mockNotifications } from '@/mocks/data';

export default function NotificationsScreen() {
  return (
    <SafeAreaView className="flex-1 bg-neutral-50">
      <ScreenHeader
        title="Notifications"
        showBack
        rightAction={
          <TouchableOpacity onPress={() => router.push('/settings/notifications')} className="w-12 h-12 items-center justify-center">
            <Text className="text-lg">⚙️</Text>
          </TouchableOpacity>
        }
      />

      {mockNotifications.length === 0 ? (
        <EmptyState
          icon="🔔"
          title="No notifications"
          description="You're all caught up! We'll let you know when something happens."
        />
      ) : (
        <FlatList
          data={mockNotifications}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <NotificationItem
              title={item.title}
              body={item.body}
              category={item.category}
              isRead={item.isRead}
              createdAt={item.createdAt}
              onPress={() => {}}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}
