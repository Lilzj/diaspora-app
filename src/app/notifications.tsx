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
import {
  followNotificationRoute,
  isFinancialNotification,
  isMultiCommunityNotification,
} from '@/lib/notification-routes';
import { invalidateAfterMoneyMoved } from '@/hooks/financial';

// Frontend Phase 13 — Multi-Community Expansion (§26, §48, GAP-013).
//
// §26 forbids a second notification system and this phase builds none. What it adds
// to the inbox is two things, and it is honest about the difference between them:
//
//   **Real, working today.** A community notification whose `targetRoute` points
//   into `/community/*` now resolves, and the `[slug]` layout restores the community
//   context on arrival. That is §48's "notification filtering must respect active
//   community" met at the *navigation* end, which is the end the client owns.
//
//   **Not possible yet, and said so.** Filtering the inbox *by* community needs a
//   `communityId` on the notification payload, which no certified contract carries —
//   GAP-013. So there is no community filter chip here. A chip that filtered nothing
//   would be worse than no chip, and building one would mean inventing the field.
//
// The band below therefore routes to the community notification *preferences*, where
// the member can change what reaches them at all, rather than pretending the inbox
// can be sliced by community today.
import { invalidateForMembershipChange } from '@/hooks/communities';
import { getCommunityFeatureFlags } from '@/config/multi-community-gaps';
import { MultiCommunityGapNotice } from '@/components/community-directory';
import { useBottomInset } from '@/components/layout/bottom-inset';

export default function NotificationsScreen() {
  // The guard rail: the phone's gesture area plus breathing room.
  const bottomInset = useBottomInset();

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

      // A membership or role notification means the server's answer to "what may
      // this member do here" has changed. §61's targeted invalidation, not a cache
      // clear — and the reason it matters is that a revoked role must stop being
      // effective without waiting for a stale time to expire.
      if (isMultiCommunityNotification(item.categoryKey, item.targetRoute ?? undefined)) {
        invalidateForMembershipChange(queryClient);
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
    <SafeAreaView className="flex-1 bg-surface-background" edges={['top', 'left', 'right']}>
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
        <View className="flex-row justify-between items-center px-6 py-3.5 border-b border-faint bg-surface-card">
          <TouchableOpacity onPress={markAllAsRead} activeOpacity={0.7}>
            <Text className="text-xs font-bold text-primary-500 uppercase tracking-wider">
              Mark all as read
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleConfirmDeleteAll} activeOpacity={0.7}>
            <Text className="text-xs font-bold text-content-faint uppercase tracking-wider">
              Delete all
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {getCommunityFeatureFlags().multiCommunityEnabled ? (
        <View className="px-4 pb-3">
          <TouchableOpacity
            accessible
            accessibilityRole="button"
            accessibilityLabel="Choose which communities each kind of notification covers"
            onPress={() => router.push('/community/settings')}
            activeOpacity={0.8}
            className="flex-row items-center bg-surface-card rounded-2xl border border-faint p-3"
          >
            <Text className="text-base mr-2.5">🌍</Text>
            <View className="flex-1">
              <Text className="text-xs font-bold text-content-strong">Notifications by community</Text>
              <Text className="text-[10px] font-semibold text-content-muted mt-0.5">
                Choose which communities each kind of notification covers
              </Text>
            </View>
            <Text className="text-content-faint">›</Text>
          </TouchableOpacity>

          {/* GAP-013. Said plainly rather than papered over with a filter chip
              that could not work. */}
          <View className="mt-2">
            <MultiCommunityGapNotice
              gapKey="communityNotificationContext"
              compact
              detail="Notifications do not yet say which community they are about, so this list cannot be filtered by community. Tapping a community notification still takes you to the right community."
            />
          </View>
        </View>
      ) : null}

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
          contentContainerStyle={{ paddingBottom: bottomInset }}
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
