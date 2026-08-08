import React from 'react';
import { View, Text, FlatList, TouchableOpacity, Alert } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/components/ScreenHeader';
import { NotificationItem } from '@/components/NotificationItem';
import { EmptyState } from '@/components/EmptyState';
import { useNotificationStore, NotificationItemData } from '@/store/notifications';

import { useNotification } from '@/providers/notification-provider';
import { useQueryClient } from '@tanstack/react-query';
import { followNotificationRoute, isFinancialNotification } from '@/lib/notification-routes';
import { invalidateAfterMoneyMoved } from '@/hooks/financial';

export default function NotificationsScreen() {
  const { notifications, markAsRead, markAllAsRead, deleteNotification, deleteAll } =
    useNotificationStore();
  const { showAlert, showToast } = useNotification();
  const queryClient = useQueryClient();

  const handlePressNotification = (item: NotificationItemData) => {
    // Mark as read
    markAsRead(item.id);

    /*
      B15's billing notifications deep-link into the wallet surface —
      `/wallet/payments/{id}`, `/wallet/receipts/{ref}` and three more — and
      those routes now exist, so they resolve directly.

      A route this build cannot render is refused rather than pushed. A
      deployment can be ahead of the app in the store, and PSR-1.1 states the
      required degradation: the notification falls back to the inbox, which is
      where the member already is. Crashing on a tap would be the alternative.
    */
    if (item.targetRoute) {
      const navigated = followNotificationRoute(item.targetRoute);

      // A financial notification means something moved. Whether or not the
      // route resolved, the cached balance and statement are now stale.
      if (isFinancialNotification(item.categoryKey)) {
        invalidateAfterMoneyMoved(queryClient);
      }

      if (!navigated) {
        showToast({
          type: 'info',
          title: 'Nothing to open',
          message: 'This notification does not link anywhere in this version of the app.',
        });
      }
    }
  };

  const handleConfirmDeleteAll = () => {
    showAlert({
      type: 'warning',
      title: 'Delete All Notifications',
      message: 'Are you sure you want to delete all notifications? This action cannot be undone.',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete All', style: 'destructive', onPress: deleteAll },
      ],
    });
  };

  return (
    <SafeAreaView className="flex-1 bg-neutral-50" edges={['top', 'left', 'right']}>
      <ScreenHeader
        title="Notifications"
        showBack
        rightAction={
          <TouchableOpacity
            onPress={() => router.push('/settings/notifications')}
            className="w-12 h-12 items-center justify-center"
          >
            <Text className="text-lg">⚙️</Text>
          </TouchableOpacity>
        }
      />

      {notifications.length > 0 && (
        <View className="flex-row justify-between items-center px-6 py-3.5 border-b border-neutral-100 bg-white">
          <TouchableOpacity onPress={markAllAsRead} activeOpacity={0.7}>
            <Text className="text-xs font-bold text-primary-500 uppercase tracking-wider">
              Mark all as read
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleConfirmDeleteAll} activeOpacity={0.7}>
            <Text className="text-xs font-bold text-neutral-400 uppercase tracking-wider">
              Delete all
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {notifications.length === 0 ? (
        <EmptyState
          icon="🔔"
          title="No notifications"
          description="You're all caught up! We'll let you know when something happens."
        />
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: 40 }}
          renderItem={({ item, index }) => (
            <NotificationItem
              title={item.title}
              body={item.body}
              category={item.category}
              isRead={item.isRead}
              createdAt={item.createdAt}
              onPress={() => handlePressNotification(item)}
              onDelete={() => deleteNotification(item.id)}
              shouldPeek={index === 0 && !item.isRead} // Peek the first unread item to teach swipe
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}
