// ─────────────────────────────────────────────────────────────────────────────
// Handing a community over — 12 Sep 2026
//
// "…ask them if they want to exit the community as the owner and then they can
// assign one of the moderators as the new owner, and that new owner will also
// get a notification in the app and mail also for them to either accept or
// reject the invitation, because a community might have grown so large that you
// cannot just delete them."
//
// ── One screen, two people ──────────────────────────────────────────────────
//
// This is the route the `communities.ownership.offered` notification opens, so
// the person arriving here is usually **not** the owner — they are the moderator
// being asked. The same URL therefore has to answer two different questions:
//
//   The owner:  "who can I hand this to?"        → the member list, filtered to
//                                                  those who could hold it.
//   The asked:  "do I want this?"                → the offer, and two answers.
//
// Both are rendered when both apply, because an owner can be mid-offer and also
// have been offered a different community — the offers list is not scoped to
// this community, and saying so is cheaper than filtering it and being wrong.
//
// ── Accepting is not a tap that goes nowhere ────────────────────────────────
//
// Accepting moves the roles: the previous owner steps down to administrator and
// the new one is appointed. Everything the app believes about who may do what
// here is stale the instant it succeeds, which is why `useDecideCommunityOwnership`
// invalidates the membership set and not just this list.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollEndScrollView } from '@/components/ScrollEndNavigationMenu';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/design-system';
import { ScreenHeader } from '@/components/ScreenHeader';
import { CommunityRoleBadge, CommunityUnavailablePanel, rolesForDisplay } from '@/components/community-directory';
import { useBottomInset } from '@/components/layout/bottom-inset';
import { useNotification } from '@/providers/notification-provider';
import { canPerform } from '@/lib/community/access';
import type { CommunityMember, CommunityOwnershipOffer } from '@/types/community-directory';
import {
  useCommunity,
  useCommunityCapabilities,
  useCommunityMembers,
  useDecideCommunityOwnership,
  useMyCommunityOwnershipOffers,
  useOfferCommunityOwnership,
  useWithdrawCommunityOwnershipOffer,
} from '@/hooks/communities';
import { backOr } from '@/lib/navigation';

const MAX_MESSAGE = 500;

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * Who a community can be handed to.
 *
 * The platform decides for real — this only keeps the list to people it would
 * plausibly accept, so an owner is not offered a name the server will refuse.
 * Owners cannot be offered it (they hold it) and neither can you.
 */
function couldHoldIt(member: CommunityMember): boolean {
  if (member.isYou) return false;
  if (member.roles.includes('Owner')) return false;
  return member.roles.includes('Moderator') || member.roles.includes('Administrator');
}

export default function CommunityOwnershipScreen() {
  const bottomInset = useBottomInset();
  const { tokens } = useTheme();
  const { showAlert } = useNotification();
  const { slug } = useLocalSearchParams<{ slug: string }>();

  const community = useCommunity(slug);
  const capabilities = useCommunityCapabilities(community.data?.id);
  const mayHandOver = canPerform('transfer-ownership', capabilities.data);

  const members = useCommunityMembers(slug, mayHandOver);
  const offers = useMyCommunityOwnershipOffers();
  const offer = useOfferCommunityOwnership(slug);
  const withdrawOffer = useWithdrawCommunityOwnershipOffer(slug);
  const decide = useDecideCommunityOwnership();

  const [chosen, setChosen] = useState<CommunityMember | null>(null);
  const [message, setMessage] = useState('');

  const candidates = useMemo(() => members.members.filter(couldHoldIt), [members.members]);

  // Offers waiting on *this* member's answer, whichever community they are for.
  const waitingOnMe = useMemo(
    () => offers.offers.filter((o) => o.status === 'Offered'),
    [offers.offers]
  );

  const send = () => {
    if (!chosen) return;
    const name = chosen.displayName ?? 'this member';

    showAlert({
      type: 'question',
      title: `Offer this community to ${name}?`,
      message:
        'They decide. If they accept, they become the owner and you stay on as an administrator. If they decline or never answer, nothing changes.',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send the offer',
          onPress: () =>
            offer.mutate(
              { userId: chosen.userId, message: message.trim() || undefined },
              {
                onSuccess: (created) => {
                  setChosen(null);
                  setMessage('');
                  showAlert({
                    type: 'success',
                    title: 'Offer sent',
                    message: `${name} has been notified. The offer runs out on ${formatDate(created.expiresAt)} if they do not answer.`,
                  });
                },
                onError: (error) =>
                  showAlert({
                    type: 'error',
                    title: 'That was not sent',
                    message: error instanceof Error ? error.message : 'Please try again.',
                  }),
              }
            ),
        },
      ],
    });
  };

  const answer = (item: CommunityOwnershipOffer, accept: boolean) =>
    showAlert({
      type: 'question',
      title: accept ? `Take over ${item.communityName}?` : `Decline ${item.communityName}?`,
      message: accept
        ? 'You become the owner of this community. The person who offered it stays on as an administrator.'
        : 'The community stays with its current owner. They are told you declined.',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: accept ? 'Accept' : 'Decline',
          style: accept ? 'default' : 'destructive',
          onPress: () =>
            decide.mutate(
              { transferId: item.id, accept },
              {
                onSuccess: () =>
                  showAlert({
                    type: 'success',
                    title: accept ? 'It is yours' : 'Declined',
                    message: accept
                      ? `You are now the owner of ${item.communityName}.`
                      : 'The owner has been told.',
                  }),
                onError: (error) =>
                  showAlert({
                    type: 'error',
                    title: 'That did not go through',
                    message: error instanceof Error ? error.message : 'Please try again.',
                  }),
              }
            ),
        },
      ],
    });

  const takeBack = () =>
    showAlert({
      type: 'question',
      title: 'Take back this offer?',
      message: 'They will no longer be able to accept it.',
      buttons: [
        { text: 'Leave it open', style: 'cancel' },
        {
          text: 'Take it back',
          onPress: () =>
            withdrawOffer.mutate(undefined, {
              onSuccess: () =>
                showAlert({ type: 'success', title: 'Taken back', message: 'The offer is closed.' }),
              onError: (error) =>
                showAlert({
                  type: 'error',
                  title: 'That did not go through',
                  message: error instanceof Error ? error.message : 'Please try again.',
                }),
            }),
        },
      ],
    });

  if (community.isLoading || capabilities.isLoading) {
    return (
      <SafeAreaView style={{ backgroundColor: tokens.color.surface.background }} className="flex-1">
        <ScreenHeader onBack={() => backOr()} title="Hand this community over" />
        <CommunityUnavailablePanel reason="loading" subject="this community" />
      </SafeAreaView>
    );
  }

  // Neither the owner nor anybody who has been asked: there is nothing here.
  if (!mayHandOver && waitingOnMe.length === 0 && !offers.isLoading) {
    return (
      <SafeAreaView style={{ backgroundColor: tokens.color.surface.background }} className="flex-1">
        <ScreenHeader onBack={() => backOr()} title="Hand this community over" />
        <CommunityUnavailablePanel reason="forbidden" subject="handing this community over" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ backgroundColor: tokens.color.surface.background }} className="flex-1">
      <ScreenHeader onBack={() => backOr()} title="Hand this community over" />

      <ScrollEndScrollView
        contentContainerStyle={{ padding: 16, paddingTop: 0, paddingBottom: bottomInset }}
      >
        {/* ── Offers waiting on this member's answer ────────────────────── */}
        {waitingOnMe.length > 0 ? (
          <View className="mb-6">
            <Text
              accessibilityRole="header"
              style={{ color: tokens.color.text.primary }}
              className="text-sm font-black mb-2"
            >
              {waitingOnMe.length === 1 ? 'You have been asked to take over a community' : 'You have been asked to take over these communities'}
            </Text>

            {waitingOnMe.map((item) => (
              <View
                key={item.id}
                testID={`ownership-offer-${item.id}`}
                style={{
                  backgroundColor: tokens.color.surface.card,
                  borderColor: tokens.color.primary[500],
                }}
                className="rounded-2xl border p-4 mb-2"
              >
                <Text style={{ color: tokens.color.text.primary }} className="text-sm font-black">
                  {item.communityName}
                </Text>
                <Text
                  style={{ color: tokens.color.text.secondary }}
                  className="text-[11px] font-semibold mt-0.5"
                >
                  Offered by {item.offeredByName ?? 'its owner'} · answer by {formatDate(item.expiresAt)}
                </Text>

                {item.message ? (
                  <Text
                    style={{ color: tokens.color.text.secondary }}
                    className="text-xs font-semibold leading-relaxed mt-2"
                  >
                    “{item.message}”
                  </Text>
                ) : null}

                <View className="flex-row mt-3">
                  <TouchableOpacity
                    accessible
                    accessibilityRole="button"
                    accessibilityLabel={`Accept ${item.communityName}`}
                    disabled={decide.isPending}
                    onPress={() => answer(item, true)}
                    style={{ backgroundColor: tokens.color.primary[600], opacity: decide.isPending ? 0.6 : 1 }}
                    className="flex-1 rounded-xl px-4 py-2.5 items-center mr-2"
                  >
                    <Text className="text-xs font-black" style={{ color: '#ffffff' }}>
                      Accept
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    accessible
                    accessibilityRole="button"
                    accessibilityLabel={`Decline ${item.communityName}`}
                    disabled={decide.isPending}
                    onPress={() => answer(item, false)}
                    style={{ borderColor: tokens.color.border.default }}
                    className="flex-1 rounded-xl border px-4 py-2.5 items-center"
                  >
                    <Text style={{ color: tokens.color.text.secondary }} className="text-xs font-black">
                      Decline
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {/* ── The owner's side ──────────────────────────────────────────── */}
        {mayHandOver ? (
          <View>
            <Text
              style={{ color: tokens.color.text.secondary }}
              className="text-xs font-semibold leading-relaxed mb-3"
            >
              Choose a moderator or administrator to offer {community.data?.name ?? 'this community'}{' '}
              to. They are notified, and they decide — nothing changes until
              they accept. If they accept, you stay on as an administrator.
            </Text>

            {members.isLoading ? (
              <ActivityIndicator color={tokens.color.primary[500]} style={{ marginTop: 16 }} />
            ) : members.isError ? (
              <CommunityUnavailablePanel reason="error" subject="the members" compact />
            ) : candidates.length === 0 ? (
              <View
                style={{ backgroundColor: tokens.color.neutral[100] }}
                className="rounded-2xl p-4"
              >
                <Text
                  style={{ color: tokens.color.text.secondary }}
                  className="text-xs font-semibold leading-relaxed"
                >
                  There is nobody here who could take it on yet. A community can only be handed to
                  one of its moderators or administrators — give somebody one of those roles from the
                  members screen first.
                </Text>
                <TouchableOpacity
                  accessible
                  accessibilityRole="button"
                  onPress={() => router.push(`/community/${slug}/members` as never)}
                  className="mt-3"
                >
                  <Text style={{ color: tokens.color.primary[600] }} className="text-xs font-black">
                    Go to members →
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                {candidates.map((member) => {
                  const isChosen = chosen?.userId === member.userId;

                  return (
                    <TouchableOpacity
                      key={member.userId}
                      accessible
                      accessibilityRole="radio"
                      accessibilityState={{ selected: isChosen }}
                      accessibilityLabel={`Offer the community to ${member.displayName ?? 'this member'}`}
                      testID={`ownership-candidate-${member.userId}`}
                      onPress={() => setChosen(isChosen ? null : member)}
                      style={{
                        backgroundColor: tokens.color.surface.card,
                        borderColor: isChosen
                          ? tokens.color.primary[500]
                          : tokens.color.surface.border,
                      }}
                      className="flex-row items-center rounded-xl border px-3 py-3 mb-2"
                    >
                      <Ionicons
                        name={isChosen ? 'radio-button-on' : 'radio-button-off'}
                        size={18}
                        color={isChosen ? tokens.color.primary[600] : tokens.color.text.placeholder}
                      />

                      <View className="flex-1 ml-3">
                        <Text
                          style={{ color: tokens.color.text.primary }}
                          className="text-sm font-black"
                          numberOfLines={1}
                        >
                          {member.displayName ?? 'A member'}
                        </Text>
                        <View className="flex-row flex-wrap mt-1">
                          {rolesForDisplay(member.roles).map((role) => (
                            <View key={role} className="mr-1.5">
                              <CommunityRoleBadge role={role} size="xs" />
                            </View>
                          ))}
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })}

                {members.hasMore ? (
                  <TouchableOpacity
                    accessible
                    accessibilityRole="button"
                    onPress={members.loadMore}
                    className="items-center py-3"
                  >
                    {members.isFetchingMore ? (
                      <ActivityIndicator color={tokens.color.primary[500]} />
                    ) : (
                      <Text style={{ color: tokens.color.primary[600] }} className="text-xs font-black">
                        Show more members
                      </Text>
                    )}
                  </TouchableOpacity>
                ) : null}

                {chosen ? (
                  <View className="mt-3">
                    <Text
                      style={{ color: tokens.color.text.primary }}
                      className="text-xs font-bold mb-1"
                      nativeID="ownership-message"
                    >
                      A note for {chosen.displayName ?? 'them'} (optional)
                    </Text>
                    <TextInput
                      accessibilityLabel="A note to send with the offer, optional"
                      accessibilityLabelledBy="ownership-message"
                      value={message}
                      onChangeText={setMessage}
                      multiline
                      numberOfLines={4}
                      maxLength={MAX_MESSAGE}
                      placeholder="Why you are asking them, and anything they should know before they answer."
                      placeholderTextColor={tokens.color.text.placeholder}
                      style={{
                        backgroundColor: tokens.color.surface.card,
                        borderColor: tokens.color.border.default,
                        color: tokens.color.text.primary,
                        minHeight: 96,
                        textAlignVertical: 'top',
                      }}
                      className="rounded-2xl border px-3 py-3 text-sm font-semibold"
                    />

                    <TouchableOpacity
                      accessible
                      accessibilityRole="button"
                      accessibilityLabel="Send the offer"
                      testID="ownership-offer-submit"
                      disabled={offer.isPending}
                      onPress={send}
                      style={{
                        backgroundColor: tokens.color.primary[600],
                        opacity: offer.isPending ? 0.6 : 1,
                      }}
                      className="rounded-2xl px-4 py-3.5 mt-3 items-center"
                    >
                      {offer.isPending ? (
                        <ActivityIndicator color="#ffffff" />
                      ) : (
                        <Text className="text-sm font-black" style={{ color: '#ffffff' }}>
                          Offer it to {chosen.displayName ?? 'them'}
                        </Text>
                      )}
                    </TouchableOpacity>
                  </View>
                ) : null}

                <TouchableOpacity
                  accessible
                  accessibilityRole="button"
                  accessibilityLabel="Take back an offer that is already open"
                  disabled={withdrawOffer.isPending}
                  onPress={takeBack}
                  className="items-center py-4 mt-1"
                >
                  <Text style={{ color: tokens.color.text.secondary }} className="text-[11px] font-black">
                    Take back an offer I already made
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        ) : null}

        {offers.isError ? (
          <Text
            accessibilityRole="alert"
            style={{ color: tokens.color.error.default }}
            className="text-[11px] font-bold mt-3"
          >
            We could not read the offers waiting on you. This is not the same as there being none.
          </Text>
        ) : null}
      </ScrollEndScrollView>
    </SafeAreaView>
  );
}
