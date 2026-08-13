import React, { useState } from 'react';
import { View, Text, Modal, TouchableOpacity, ScrollView, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNotification } from '@/providers/notification-provider';
import { CreatorOrganization } from '@/types/creator';

interface OrganizationDetailModalProps {
  organization: CreatorOrganization | null;
  visible: boolean;
  onClose: () => void;
}

export const OrganizationDetailModal: React.FC<OrganizationDetailModalProps> = ({
  organization,
  visible,
  onClose,
}) => {
  if (!organization) return null;

  const insets = useSafeAreaInsets();
  const { showToast, showAlert } = useNotification();
  const [activeSubTab, setActiveSubTab] = useState<'Timeline' | 'Posts' | 'Events' | 'Members' | 'Roles' | 'Settings'>('Timeline');

  const membersList = [
    { name: 'Joshua', role: 'Owner', avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80', status: 'Active' },
    { name: 'Amara Kone', role: 'Manager', avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&q=80', status: 'Active' },
    { name: 'Fatou Diop', role: 'Moderator', avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=150&q=80', status: 'Active' },
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity activeOpacity={1} onPress={onClose} className="flex-1 bg-black/60 justify-end">
        <TouchableOpacity
          activeOpacity={1}
          style={{ paddingBottom: Math.max(insets.bottom + 16, 28) }}
          className="bg-surface-card rounded-t-3xl p-6 max-h-[88%]"
        >
          {/* Drag Handle Indicator */}
          <View className="w-12 h-1.5 bg-neutral-200 rounded-full self-center mb-3" />

          {/* Header */}
          <View className="flex-row justify-between items-center pb-4 border-b border-faint mb-4">
            <View className="flex-row items-center flex-1 mr-2">
              <Image source={{ uri: organization.logo }} className="w-10 h-10 rounded-2xl mr-3 bg-surface-muted" />
              <View className="flex-1">
                <View className="flex-row items-center">
                  <Text className="text-sm font-black text-content-primary mr-1" numberOfLines={1}>
                    {organization.name}
                  </Text>
                  {organization.verified && <Text className="text-xs text-success-default">✓</Text>}
                </View>
                <Text className="text-[10px] text-content-muted font-semibold">{organization.category} · {organization.userRole.toUpperCase()} ROLE</Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} className="bg-surface-muted p-2 rounded-full">
              <Text className="text-xs font-black text-content-tertiary">✕</Text>
            </TouchableOpacity>
          </View>

          {/* Sub-tab navigation */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ flexDirection: 'row', alignItems: 'center' }}
            className="border-b border-faint pb-3 mb-4"
          >
            {['Timeline', 'Posts', 'Events', 'Members', 'Roles', 'Settings'].map((tab) => {
              const isActive = activeSubTab === tab;
              return (
                <TouchableOpacity
                  key={tab}
                  onPress={() => setActiveSubTab(tab as any)}
                  className={`px-3 py-1.5 rounded-xl mr-2 ${
                    isActive ? 'bg-primary-500' : 'bg-surface-background border border-subtle'
                  }`}
                >
                  <Text className={`text-xs font-bold ${isActive ? 'text-white' : 'text-content-tertiary'}`}>{tab}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <ScrollView showsVerticalScrollIndicator={false} className="flex-1">
            {/* Timeline Sub Tab */}
            {activeSubTab === 'Timeline' && (
              <View>
                <Text className="text-xs font-black text-content-faint uppercase tracking-widest mb-3">Organization Activity Feed</Text>
                <View className="bg-surface-background border border-subtle rounded-2xl p-4 mb-3">
                  <Text className="text-xs font-bold text-content-primary">🎉 Created Annual Gala Event</Text>
                  <Text className="text-[10px] text-content-muted mt-0.5">Published by Joshua · 2 hours ago</Text>
                </View>
                <View className="bg-surface-background border border-subtle rounded-2xl p-4 mb-3">
                  <Text className="text-xs font-bold text-content-primary">✓ Granted Moderator Permission to Fatou Diop</Text>
                  <Text className="text-[10px] text-content-muted mt-0.5">Role updated by Joshua · Yesterday</Text>
                </View>
              </View>
            )}

            {/* Posts Sub Tab */}
            {activeSubTab === 'Posts' && (
              <View>
                <View className="flex-row justify-between items-center mb-3">
                  <Text className="text-xs font-black text-content-faint uppercase tracking-widest">Published Posts ({organization.postsCount})</Text>
                  <TouchableOpacity onPress={() => showToast({ type: 'info', title: 'New Post', message: 'Open editor as Organization' })} className="bg-primary-500 px-3 py-1 rounded-xl">
                    <Text className="text-xs font-black text-white">+ New Post</Text>
                  </TouchableOpacity>
                </View>
                <View className="bg-surface-background border border-subtle rounded-2xl p-4 mb-3">
                  <Text className="text-xs font-bold text-content-primary">Quarterly Diaspora Housing Support Briefing</Text>
                  <Text className="text-[10px] text-content-muted mt-0.5">890 views · 14 comments</Text>
                </View>
              </View>
            )}

            {/* Events Sub Tab */}
            {activeSubTab === 'Events' && (
              <View>
                <View className="flex-row justify-between items-center mb-3">
                  <Text className="text-xs font-black text-content-faint uppercase tracking-widest">Organization Events ({organization.eventsCount})</Text>
                  <TouchableOpacity onPress={() => showToast({ type: 'info', title: 'New Event', message: 'Create Event as Organization' })} className="bg-primary-500 px-3 py-1 rounded-xl">
                    <Text className="text-xs font-black text-white">+ Host Event</Text>
                  </TouchableOpacity>
                </View>
                <View className="bg-surface-background border border-subtle rounded-2xl p-4 mb-3">
                  <Text className="text-xs font-bold text-content-primary">West African Gala 2026</Text>
                  <Text className="text-[10px] text-content-muted mt-0.5">Starts tomorrow · 310 registered attendees</Text>
                </View>
              </View>
            )}

            {/* Members Sub Tab */}
            {activeSubTab === 'Members' && (
              <View>
                <Text className="text-xs font-black text-content-faint uppercase tracking-widest mb-3">Active Members ({organization.membersCount})</Text>
                {membersList.map((m) => (
                  <View key={m.name} className="flex-row justify-between items-center bg-surface-background border border-subtle p-3 rounded-2xl mb-2">
                    <View className="flex-row items-center">
                      <Image source={{ uri: m.avatar }} className="w-8 h-8 rounded-full mr-2.5 bg-neutral-200" />
                      <View>
                        <Text className="text-xs font-bold text-content-primary">{m.name}</Text>
                        <Text className="text-[9px] text-content-muted">{m.role}</Text>
                      </View>
                    </View>
                    <TouchableOpacity onPress={() => showToast({ type: 'info', title: 'Manage Member', message: `Editing permissions for ${m.name}` })} className="bg-surface-card border border-neutral-250 px-2.5 py-1 rounded-xl">
                      <Text className="text-[9px] font-bold text-content-secondary">Permissions</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            {/* Roles & Permissions Sub Tab */}
            {activeSubTab === 'Roles' && (
              <View className="bg-surface-background border border-subtle rounded-2xl p-4 mb-3">
                <Text className="text-xs font-black text-content-primary uppercase mb-2">Your Granted Permissions</Text>
                {organization.permissions.map((p) => (
                  <View key={p} className="flex-row items-center py-1">
                    <Text className="text-xs text-success-default font-black mr-2">✓</Text>
                    <Text className="text-xs font-bold text-content-secondary">{p.replace('_', ' ').toUpperCase()}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Settings Sub Tab */}
            {activeSubTab === 'Settings' && (
              <View className="bg-surface-background border border-subtle rounded-2xl p-4 mb-3 space-y-3 gap-2">
                <Text className="text-xs font-black text-content-primary">Organization Settings</Text>
                <TouchableOpacity onPress={() => showToast({ type: 'info', title: 'Verification', message: 'Re-submit business proof' })} className="bg-surface-card border border-neutral-250 p-3 rounded-xl">
                  <Text className="text-xs font-bold text-content-strong">🛡️ Manage Organization Verification</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => showToast({ type: 'warning', title: 'Transfer Ownership', message: 'Specify new primary owner' })} className="bg-surface-card border border-neutral-250 p-3 rounded-xl">
                  <Text className="text-xs font-bold text-content-strong">👑 Transfer Ownership</Text>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};
