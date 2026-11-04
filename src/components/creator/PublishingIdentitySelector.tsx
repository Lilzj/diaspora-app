import React from 'react';
import { View, Text, TouchableOpacity, Modal, Image, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNotification } from '@/providers/notification-provider';
import { useTheme } from '@/design-system';
import { usePublishingIdentityStore } from '@/store/publishing-identity';
import { useCreatorWorkspaceStore } from '@/store/creator-workspace';

export const PublishingIdentitySelector: React.FC = () => {
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();
  const { showToast } = useNotification();
  const { activeIdentity, identities, isSelectorOpen, setIsSelectorOpen, setActiveIdentity } =
    usePublishingIdentityStore();
  const { setIdentityFilter } = useCreatorWorkspaceStore();

  /**
   * Choosing an identity filters the workspace. It does **not** decide who your
   * next post is published as.
   *
   * The toast used to say *"Identity Switched — Now operating as: {name}"*,
   * which reads as a mode change that persists into publishing: a member who
   * selected their organisation and then opened the guide or listing composer
   * would reasonably expect it to be posted by that organisation. Nothing
   * carries it there. `activeIdentity` has no reader outside this component —
   * every create screen sends its own author fields — so the only effect of a
   * selection is the `setIdentityFilter` call on the line above.
   *
   * The capability is real where it is actually wired: `CreatePostRequest` has
   * `publishAsOrganizationId`, and the organisation Posts tab uses it. Bringing
   * that to the listing composers is a feature; claiming it here was not.
   */
  const handleSelectIdentity = (identity: (typeof identities)[0]) => {
    setActiveIdentity(identity);
    setIdentityFilter(identity.id === 'user-me' ? 'all' : identity.id);
    setIsSelectorOpen(false);
    showToast({
      type: 'info',
      title: 'Workspace filtered',
      message: `Showing content published by ${identity.name}. New posts are still published as you — Diaspora cannot post as an organisation from here yet.`,
    });
  };

  return (
    <>
      {/*
        ── The pill's colour, twice wrong ────────────────────────────────────

        It was `bg-surface-inverse` — the app's near-black, meant for inverted
        surfaces — with `text-content-inverse` on it. Legible, but the only
        near-black element on the screen, reading as a different product.

        Re-toning it to `bg-surface-muted` fixed that and broke something worse.
        `primary[50]` is a **palette** value: the same cream in both schemes.
        `text-content-primary` is **semantic**: it flips to near-white in dark.
        Cream and near-white, so the member's own publishing identity became the
        least readable thing on the screen — in the one place where being sure
        who you are about to publish as actually matters.

        Caught in the dark capture, not by any static check: both tokens are
        correct, and only the pairing is wrong. The rule, which the sheet's
        `TabGapNote` also follows: **never pair a fixed palette value with a
        scheme-aware one.** The surface is semantic and moves; the brand stays
        on the border and the label, where a fixed value against a moving
        surface is the safe direction.
      */}
      <TouchableOpacity
        onPress={() => setIsSelectorOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`Publishing as ${activeIdentity.name}. Change publishing identity.`}
        className="bg-surface-elevated border border-primary-500 px-3.5 py-2 rounded-2xl flex-row items-center justify-between"
      >
        <View className="flex-row items-center flex-1 mr-2">
          <Image source={{ uri: activeIdentity.avatar }} className="w-6 h-6 rounded-full mr-2 bg-surface-muted" />
          <View className="flex-1">
            <Text
              style={{ color: tokens.color.text.brand }}
              className="text-[9px] font-extrabold uppercase tracking-wider"
            >
              Publishing As
            </Text>
            <View className="flex-row items-center">
              <Text className="text-xs font-black text-content-primary" numberOfLines={1}>
                {activeIdentity.name}
              </Text>
              {activeIdentity.verified && <Text className="text-[10px] text-success-default ml-1">✓</Text>}
            </View>
          </View>
        </View>
        <Text style={{ color: tokens.color.text.brand }} className="text-xs font-bold">▼</Text>
      </TouchableOpacity>

      {/* Identity Switcher Bottom Sheet Modal */}
      <Modal visible={isSelectorOpen} transparent animationType="slide" onRequestClose={() => setIsSelectorOpen(false)}
        statusBarTranslucent
        navigationBarTranslucent>
        <TouchableOpacity activeOpacity={1} onPress={() => setIsSelectorOpen(false)} className="flex-1 bg-black/60 justify-end">
          <TouchableOpacity
            activeOpacity={1}
            style={{ paddingBottom: Math.max(insets.bottom + 16, 28) }}
            className="bg-surface-card rounded-t-3xl p-6 shadow-2xl"
          >
            <View className="w-12 h-1.5 bg-subtle rounded-full self-center mb-4" />
            
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
                      isSelected ? 'border-primary-500 bg-surface-muted' : 'border-subtle bg-surface-card'
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
                        <Text className="text-[8px] font-black text-primary-500 bg-surface-muted px-1.5 py-0.2 rounded mt-1 self-start">
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
