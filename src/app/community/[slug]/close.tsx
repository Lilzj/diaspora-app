// ─────────────────────────────────────────────────────────────────────────────
// Asking Diaspora to close a community — 12 Sep 2026
//
// The product decision, in the owner's words: "only the community owner can
// delete a community, but then it will follow some rules… it will take 30 days
// before this can be deleted and till then all activities in the community will
// continue going on the normal way, and they need to provide a reason, this will
// be reviewed by the diaspora admins".
//
// So this screen **performs nothing**. Nothing it can do closes a community.
// Tapping the button opens a request, and three separate things then have to
// happen before anything is archived: the thirty days pass, a Diaspora
// administrator approves, and the platform's own sweep closes it. Any one of
// them not happening leaves the community exactly as it is.
//
// That matters for what the screen is allowed to say. A screen that says
// "Community deleted" after a 200 would be lying about all three. It says what
// actually happened — a request is open, and here is the earliest date anything
// could change.
//
// ── Who sees it ─────────────────────────────────────────────────────────────
//
// `canRequestDeletion`, from the server's capability set, which is true for the
// owner of a community that is not already archived and false for everybody
// else. Not `roles.includes('Owner')` — §62 makes the backend authoritative, and
// a role list is display.
//
// ── Why "hand it over instead" is on this screen and not only in the email ───
//
// Because a large community is the case this whole feature exists for. An owner
// who wants out of a community with four thousand members usually wants out of
// the *job*, not the community — and the moment they are looking at a thirty-day
// wait is the moment to say so.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { ActivityIndicator, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollEndScrollView } from '@/components/ScrollEndNavigationMenu';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/design-system';
import { ScreenHeader } from '@/components/ScreenHeader';
import { CommunityUnavailablePanel } from '@/components/community-directory';
import { useBottomInset } from '@/components/layout/bottom-inset';
import { useNotification } from '@/providers/notification-provider';
import { canPerform } from '@/lib/community/access';
import { daysLeftLabel, daysUntil } from '@/lib/community/closure';
import {
  useCommunity,
  useCommunityCapabilities,
  useCommunityDeletionRequest,
  useRequestCommunityDeletion,
  useWithdrawCommunityDeletion,
} from '@/hooks/communities';

/** The platform's own bounds, echoed so the field can say so before the server does. */
const MIN_REASON = 10;
const MAX_REASON = 1000;

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
}


export default function CommunityCloseScreen() {
  const bottomInset = useBottomInset();
  const { tokens } = useTheme();
  const { showAlert } = useNotification();
  const { slug } = useLocalSearchParams<{ slug: string }>();

  const community = useCommunity(slug);
  const capabilities = useCommunityCapabilities(community.data?.id);
  const mayAsk = canPerform('request-deletion', capabilities.data);

  // Asked only where somebody is entitled to the answer.
  const deletion = useCommunityDeletionRequest(slug, mayAsk);
  const request = useRequestCommunityDeletion(slug);
  const withdraw = useWithdrawCommunityDeletion(slug);

  const [reason, setReason] = useState('');
  const [showReasonError, setShowReasonError] = useState(false);

  const trimmed = reason.trim();
  const reasonIsUsable = trimmed.length >= MIN_REASON && trimmed.length <= MAX_REASON;

  const open = deletion.request?.status === 'AwaitingReview' || deletion.request?.status === 'Approved';

  const submit = () => {
    if (!reasonIsUsable) {
      setShowReasonError(true);
      return;
    }

    showAlert({
      type: 'question',
      title: 'Ask Diaspora to close this community?',
      message:
        'Nothing changes today. The community carries on as normal while Diaspora reviews this, and the earliest it could close is thirty days from now.',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send the request',
          style: 'destructive',
          onPress: () =>
            request.mutate(
              { reason: trimmed },
              {
                onSuccess: (created) => {
                  setReason('');
                  setShowReasonError(false);
                  showAlert({
                    type: 'success',
                    title: 'Diaspora has your request',
                    message: `Nothing has closed. The community keeps running while this is reviewed, and the earliest it could close is ${formatDate(created.effectiveAt)}.`,
                  });
                },
                onError: (error) =>
                  showAlert({
                    type: 'error',
                    title: 'That was not sent',
                    // The module writes its refusals for owners to read.
                    message: error instanceof Error ? error.message : 'Please try again.',
                  }),
              }
            ),
        },
      ],
    });
  };

  const cancelRequest = () =>
    showAlert({
      type: 'question',
      title: 'Withdraw this request?',
      message: 'The community stays open and Diaspora stops reviewing it. You can ask again later.',
      buttons: [
        { text: 'Keep the request', style: 'cancel' },
        {
          text: 'Withdraw it',
          onPress: () =>
            withdraw.mutate(undefined, {
              onSuccess: () =>
                showAlert({
                  type: 'success',
                  title: 'Withdrawn',
                  message: 'This community is no longer waiting to close.',
                }),
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
        <ScreenHeader onBack={() => router.back()} title="Close this community" />
        <CommunityUnavailablePanel reason="loading" subject="this community" />
      </SafeAreaView>
    );
  }

  if (!mayAsk) {
    // Hidden rather than disabled, as everywhere else: only the owner may ask,
    // and a greyed-out button teaches everyone else who the owner is.
    return (
      <SafeAreaView style={{ backgroundColor: tokens.color.surface.background }} className="flex-1">
        <ScreenHeader onBack={() => router.back()} title="Close this community" />
        <CommunityUnavailablePanel reason="forbidden" subject="closing this community" />
      </SafeAreaView>
    );
  }

  const record = community.data;

  return (
    <SafeAreaView style={{ backgroundColor: tokens.color.surface.background }} className="flex-1">
      <ScreenHeader onBack={() => router.back()} title="Close this community" />

      <ScrollEndScrollView
        contentContainerStyle={{ padding: 16, paddingTop: 0, paddingBottom: bottomInset }}
      >
        <Text style={{ color: tokens.color.text.primary }} className="text-base font-black mb-1">
          {record?.name}
        </Text>

        {deletion.isLoading ? (
          <ActivityIndicator color={tokens.color.primary[500]} style={{ marginTop: 24 }} />
        ) : open && deletion.request ? (
          // ── A request is already open ────────────────────────────────────
          <View className="mt-3">
            <View
              style={{
                backgroundColor: tokens.color.surface.card,
                borderColor: tokens.color.warning.default,
              }}
              className="rounded-2xl border p-4"
            >
              <View className="flex-row items-center mb-2">
                <Ionicons name="time-outline" size={18} color={tokens.color.warning.default} />
                <Text
                  accessibilityRole="header"
                  style={{ color: tokens.color.text.primary }}
                  className="text-sm font-black ml-2"
                >
                  {deletion.request.status === 'Approved'
                    ? 'Diaspora has approved this'
                    : 'Waiting for Diaspora'}
                </Text>
              </View>

              <Text
                style={{ color: tokens.color.text.secondary }}
                className="text-xs font-semibold leading-relaxed"
              >
                {deletion.request.status === 'Approved'
                  ? `This community will close on ${formatDate(deletion.request.effectiveAt)}. Until then everything here carries on as normal — members can post, join and take part.`
                  : `Asked on ${formatDate(deletion.request.requestedAt)}. The earliest it could close is ${formatDate(deletion.request.effectiveAt)}. Until a decision is made, everything here carries on as normal.`}
              </Text>

              {(() => {
                const left = daysUntil(deletion.request.effectiveAt);
                return left === null ? null : (
                  <Text
                    style={{ color: tokens.color.text.placeholder }}
                    className="text-[11px] font-bold mt-2"
                  >
                    {daysLeftLabel(left)}
                  </Text>
                );
              })()}

              <Text
                style={{ color: tokens.color.text.placeholder }}
                className="text-[11px] font-bold mt-3 mb-1"
              >
                The reason you gave
              </Text>
              <Text
                style={{ color: tokens.color.text.secondary }}
                className="text-xs font-semibold leading-relaxed"
              >
                {deletion.request.reason}
              </Text>
            </View>

            <TouchableOpacity
              accessible
              accessibilityRole="button"
              accessibilityLabel="Withdraw the request to close this community"
              disabled={withdraw.isPending}
              onPress={cancelRequest}
              style={{ borderColor: tokens.color.border.default }}
              className="rounded-2xl border px-4 py-3 mt-3 items-center"
            >
              {withdraw.isPending ? (
                <ActivityIndicator color={tokens.color.primary[500]} />
              ) : (
                <Text style={{ color: tokens.color.primary[600] }} className="text-sm font-black">
                  Withdraw this request
                </Text>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          // ── Nothing open: the form ───────────────────────────────────────
          <View className="mt-3">
            {deletion.request?.status === 'Rejected' ? (
              <View
                style={{
                  backgroundColor: tokens.color.surface.card,
                  borderColor: tokens.color.border.default,
                }}
                className="rounded-2xl border p-4 mb-4"
              >
                <Text style={{ color: tokens.color.text.primary }} className="text-sm font-black mb-1">
                  Diaspora decided not to close this community
                </Text>
                {deletion.request.decisionReason ? (
                  <Text
                    style={{ color: tokens.color.text.secondary }}
                    className="text-xs font-semibold leading-relaxed"
                  >
                    {deletion.request.decisionReason}
                  </Text>
                ) : null}
                <TouchableOpacity
                  accessible
                  accessibilityRole="button"
                  onPress={() => router.push(`/community/${slug}/ownership` as never)}
                  className="mt-3"
                >
                  <Text style={{ color: tokens.color.primary[600] }} className="text-xs font-black">
                    Hand the community to someone else instead →
                  </Text>
                </TouchableOpacity>
              </View>
            ) : null}

            <View
              style={{
                backgroundColor: tokens.color.neutral[100],
                borderColor: tokens.color.border.default,
              }}
              className="rounded-2xl border p-4"
            >
              <Text
                style={{ color: tokens.color.text.secondary }}
                className="text-xs font-semibold leading-relaxed"
              >
                Closing a community is not immediate and it is not only your decision.
                {'\n\n'}• Diaspora reviews every request.
                {'\n'}• Thirty days pass before anything can close.
                {'\n'}• Until then the community runs exactly as it does now — nobody is told it
                might close.
                {'\n'}• You can withdraw at any point in those thirty days.
                {'\n\n'}If Diaspora decides against closing it, you will be emailed the reason and
                offered the chance to hand the community to one of your moderators instead.
              </Text>
            </View>

            <TouchableOpacity
              accessible
              accessibilityRole="button"
              accessibilityLabel="Hand this community to someone else"
              onPress={() => router.push(`/community/${slug}/ownership` as never)}
              style={{ borderColor: tokens.color.border.default }}
              className="flex-row items-center rounded-2xl border px-4 py-3 mt-3"
            >
              <Ionicons name="swap-horizontal-outline" size={18} color={tokens.color.primary[600]} />
              <View className="flex-1 ml-3">
                <Text style={{ color: tokens.color.text.primary }} className="text-sm font-black">
                  Hand it over instead
                </Text>
                <Text style={{ color: tokens.color.text.secondary }} className="text-[11px] font-semibold">
                  Offer the community to a moderator or administrator. They choose whether to accept.
                </Text>
              </View>
            </TouchableOpacity>

            <Text
              style={{ color: tokens.color.text.primary }}
              className="text-xs font-bold mt-5 mb-1"
              nativeID="closure-reason"
            >
              Why should this community close? *
            </Text>
            <TextInput
              accessibilityLabel="Why this community should close, required"
              accessibilityLabelledBy="closure-reason"
              value={reason}
              onChangeText={(next) => {
                setReason(next);
                if (showReasonError) setShowReasonError(false);
              }}
              multiline
              numberOfLines={6}
              maxLength={MAX_REASON}
              placeholder="A Diaspora administrator reads this and decides. Say what has happened and what you have already tried."
              placeholderTextColor={tokens.color.text.placeholder}
              style={{
                backgroundColor: tokens.color.surface.card,
                borderColor: showReasonError
                  ? tokens.color.error.default
                  : tokens.color.border.default,
                color: tokens.color.text.primary,
                minHeight: 132,
                textAlignVertical: 'top',
              }}
              className="rounded-2xl border px-3 py-3 text-sm font-semibold"
            />

            <View className="flex-row justify-between mt-1">
              <Text
                accessibilityRole={showReasonError ? 'alert' : 'text'}
                style={{
                  color: showReasonError ? tokens.color.error.default : tokens.color.text.placeholder,
                }}
                className="text-[11px] font-bold flex-1 pr-2"
              >
                {showReasonError
                  ? `Write at least ${MIN_REASON} characters so the administrator has something to decide on.`
                  : 'A Diaspora administrator will read this.'}
              </Text>
              <Text
                style={{ color: tokens.color.text.placeholder }}
                className="text-[11px] font-bold"
              >
                {trimmed.length}/{MAX_REASON}
              </Text>
            </View>

            <TouchableOpacity
              accessible
              accessibilityRole="button"
              accessibilityLabel="Ask Diaspora to close this community"
              testID="community-close-submit"
              disabled={request.isPending}
              onPress={submit}
              style={{ backgroundColor: tokens.color.error.default, opacity: request.isPending ? 0.6 : 1 }}
              className="rounded-2xl px-4 py-3.5 mt-4 items-center"
            >
              {request.isPending ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text className="text-sm font-black" style={{ color: '#ffffff' }}>
                  Ask Diaspora to close this community
                </Text>
              )}
            </TouchableOpacity>

            <Text
              style={{ color: tokens.color.text.placeholder }}
              className="text-[11px] font-semibold text-center mt-2"
            >
              This does not close anything today.
            </Text>
          </View>
        )}

        {deletion.isError ? (
          <Text
            accessibilityRole="alert"
            style={{ color: tokens.color.error.default }}
            className="text-[11px] font-bold mt-3"
          >
            We could not read whether this community is already waiting to close. Check before asking
            again.
          </Text>
        ) : null}
      </ScrollEndScrollView>
    </SafeAreaView>
  );
}
