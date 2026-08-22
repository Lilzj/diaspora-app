// ─────────────────────────────────────────────────────────────────────────────
// Provider alerts — a subscription the platform cannot take
//
// Six switches, one master and five per content type, under the promise:
// *"Configure which alerts you would like to receive when this provider
// publishes content."* Every one of them wrote to
// `store/provider-notifications.ts` — a plain zustand store with no `persist`
// middleware and no API layer behind it. The settings did not reach the server,
// and did not survive the app being closed either. A member who switched on
// housing alerts for a letting agent got no notification when that agent
// posted, and found the switch back off next time they opened the app. (The
// store even ships a fixture: provider `user-202` starts with alerts already
// enabled, so some members saw a subscription they had never made.)
//
// ── The capability does not exist ────────────────────────────────────────────
//
// Not as a route, not as a DTO, not as a domain concept:
//
//   * `/providers` maps eleven routes — list, featured, capabilities, get by id
//     and by slug, create, update, status, categories, reviews, bookmark.
//     **No subscribe or follow route.** `followerCount` and `isFollowing` on a
//     provider response are read-only projections sourced from Community.
//   * Community's follow surface (`POST /community/follows/{targetId}`) cannot
//     target one: `FollowTargetType` is `Member`, `Organization`, `Hashtag` —
//     **there is no Provider member** — and `FollowRequest` carries only
//     `targetType` and `muted`, with nothing to say which kinds of content
//     should notify you.
//   * Notification preferences do exist (`GET`/`PUT /notifications/preferences`)
//     but they are **global**: `categories`, `categoryChannels`, quiet hours,
//     digest frequency. Nothing in that request is scoped to a provider, so
//     writing this modal's state into it would turn "alert me about this
//     agent's housing posts" into "alert me about all housing on Diaspora" — a
//     different setting, silently applied to the member's whole account.
//
// There is therefore nothing honest to wire these switches to, and a switch
// that cannot be honoured is worse than no switch: it stops the member looking
// for another way to keep track. They are gone, and the sheet now says what the
// platform can actually do — bookmark the provider, which is a real route the
// profile screen already offers, and set notification preferences by category
// account-wide.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { View, Text, Modal, TouchableOpacity, StyleSheet, TouchableWithoutFeedback } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface ProviderNotificationModalProps {
  visible: boolean;
  onClose: () => void;
  providerId: string;
  providerName: string;
}

export function ProviderNotificationModal({
  visible,
  onClose,
  providerName,
}: ProviderNotificationModalProps) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent>
      <TouchableOpacity activeOpacity={1} onPress={onClose} style={styles.overlay}>
        <TouchableWithoutFeedback>
          <View 
            style={[styles.modalCard, { paddingBottom: Math.max(insets.bottom + 16, 28) }]} 
            className="bg-surface-card rounded-t-[32px] border-t border-x border-faint px-6 pt-6 shadow-2xl w-full"
          >
            {/* Drag Handle Indicator */}
            <View className="w-12 h-1 bg-subtle rounded-full mx-auto mb-4" />

            <View className="flex-row justify-between items-center mb-3">
              <Text className="text-base font-black text-content-primary tracking-tight flex-1">
                Alerts from {providerName}
              </Text>
              <TouchableOpacity onPress={onClose} className="p-1">
                <Ionicons name="close" size={20} color="#9CA3AF" />
              </TouchableOpacity>
            </View>

            {/*
              The plainest available sentence. "Coming soon" was considered and
              rejected: it is a promise with no date behind it, and a member
              deciding how to keep track of a letting agent's new listings needs
              to know the answer is no today, not that it might be yes later.
            */}
            <View className="bg-surface-background border border-faint rounded-2xl p-4 mb-4">
              <Text className="text-xs font-black text-content-strong mb-1.5">
                Diaspora cannot alert you about one provider
              </Text>
              <Text className="text-[11px] text-content-muted font-semibold leading-relaxed">
                There is no way to follow {providerName} and be notified when they post something new. This screen used to offer switches for it; they never worked, so they have been removed rather than left to look like they did.
              </Text>
            </View>

            <Text className="text-[10px] font-black text-content-muted uppercase tracking-widest mb-2 ml-1">
              What you can do instead
            </Text>

            <View className="bg-surface-card border border-faint rounded-2xl px-4 py-1 mb-4">
              <View className="py-3 border-b border-faint">
                <Text className="text-xs font-bold text-content-secondary">Bookmark this provider</Text>
                <Text className="text-[10px] text-content-faint font-semibold mt-0.5 leading-relaxed">
                  Saves them to your bookmarks so you can check back. Use the bookmark control on their profile.
                </Text>
              </View>
              <View className="py-3">
                <Text className="text-xs font-bold text-content-secondary">Turn on alerts by category</Text>
                <Text className="text-[10px] text-content-faint font-semibold mt-0.5 leading-relaxed">
                  Diaspora can notify you about housing, jobs or marketplace activity across the whole app — but not for one provider on their own.
                </Text>
              </View>
            </View>

            <TouchableOpacity
              onPress={() => {
                onClose();
                router.push('/settings/notifications');
              }}
              activeOpacity={0.8}
              className="w-full bg-primary-500 py-3 rounded-2xl items-center justify-center shadow-lg shadow-primary-500/10 mt-2 mb-2"
              style={{ height: 48 }}
            >
              <Text className="text-white font-black text-xs uppercase tracking-wider">
                Notification settings
              </Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={onClose} activeOpacity={0.8} className="w-full py-2 items-center mb-1">
              <Text className="text-content-faint font-black text-xs uppercase tracking-wider">Close</Text>
            </TouchableOpacity>
          </View>
        </TouchableWithoutFeedback>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    maxHeight: '90%',
  },
});
