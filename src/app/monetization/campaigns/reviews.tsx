// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — the advertising review queue (MON-GAP-006, reviewer half)
//
// ── Why this screen did not exist ───────────────────────────────────────────
//
// MON-GAP-006 is titled "Sponsored content review and approval" and only the
// advertiser's half was ever built. `GET /campaigns/reviews/queue` and
// `POST /campaigns/reviews/{id}` have been served since B16 shipped and no
// client called either, so nothing could move a campaign out of `PendingReview`
// — the register said `connected` and the approve → deliver path had no way to
// run at all.
//
// ── Staff-ness is the server's answer, not this screen's ────────────────────
//
// The client's `FinancialPermissions` models a member's *tier*, and reviewing is
// a *role*. Rather than invent a client-side role check the platform does not
// expose — and risk drawing a button the server refuses, or hiding one it would
// allow — this screen asks and reads the answer. A 403 is not an error state
// here; it is the correct response to somebody who is not a reviewer, and it is
// rendered as such. §62: authorization is decided server-side.
//
// ── One decision, and a rejection has to say why ────────────────────────────
//
// The server refuses a rejection with no note. That is the right way round: an
// advertiser told only "no" has nothing to answer, and `/campaigns/{id}/appeal`
// exists precisely so they can. The reject control is therefore disabled until a
// reason is typed, which makes the server's rule visible before it is hit.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/components/ScreenHeader';
import { ScrollEndScrollView } from '@/components/ScrollEndNavigationMenu';
import { MonetizationEmpty, MonetizationSection } from '@/components/monetization';
import { useTheme } from '@/design-system';
import { usePricing } from '@/providers/pricing-provider';
import { useCampaignReviewQueue, useDecideCampaign } from '@/hooks/monetization-gaps';
import type { Campaign } from '@/types/monetization-gaps';

function ReviewRow({ campaign }: { campaign: Campaign }) {
  const { tokens } = useTheme();
  const pricing = usePricing();
  const decide = useDecideCampaign();

  const [note, setNote] = useState('');
  const [decided, setDecided] = useState<'approve' | 'reject' | null>(null);

  const canReject = note.trim().length > 0 && !decide.isPending;

  if (decided) {
    return (
      <View
        accessible
        accessibilityRole="text"
        accessibilityLabel={`${campaign.name} was ${decided === 'approve' ? 'approved' : 'rejected'}.`}
        style={{ backgroundColor: tokens.color.surface.card, borderColor: tokens.color.border.default }}
        className="rounded-2xl border p-4"
      >
        <Text style={{ color: tokens.color.text.primary }} className="text-sm font-black">
          {campaign.name}
        </Text>
        <Text style={{ color: tokens.color.text.secondary }} className="text-xs font-semibold mt-1">
          {decided === 'approve' ? 'Approved.' : 'Rejected.'} It has left the queue.
        </Text>
      </View>
    );
  }

  return (
    <View
      style={{ backgroundColor: tokens.color.surface.card, borderColor: tokens.color.border.default }}
      className="rounded-2xl border p-4"
    >
      <View className="flex-row items-start justify-between">
        <Text
          style={{ color: tokens.color.text.primary }}
          className="text-sm font-black tracking-tight flex-1 pr-3"
        >
          {campaign.name}
        </Text>
        <Text style={{ color: tokens.color.text.primary }} className="text-sm font-black">
          {pricing.format(campaign.budget)}
        </Text>
      </View>

      {/* What a reviewer is actually judging: the words that will be shown. */}
      <View
        style={{ backgroundColor: tokens.color.surface.background }}
        className="rounded-xl p-3 mt-3"
      >
        <Text style={{ color: tokens.color.text.primary }} className="text-xs font-bold">
          {campaign.creative.headline}
        </Text>
        <Text
          style={{ color: tokens.color.text.secondary }}
          className="text-[11px] font-medium mt-1 leading-relaxed"
        >
          {campaign.creative.body}
        </Text>
      </View>

      <TextInput
        testID={`review-note-${campaign.campaignId}`}
        placeholder="Reason — required to reject"
        value={note}
        onChangeText={setNote}
        multiline
        style={{ color: tokens.color.text.primary }}
        placeholderTextColor={tokens.color.text.placeholder}
        className="border border-subtle rounded-2xl bg-surface-background px-3 py-2 mt-3 text-xs font-medium min-h-14"
        accessibilityLabel={`Reason for the decision on ${campaign.name}`}
      />

      <View className="flex-row items-center mt-3" style={{ gap: 16 }}>
        <TouchableOpacity
          testID={`approve-${campaign.campaignId}`}
          disabled={decide.isPending}
          onPress={async () => {
            try {
              await decide.mutateAsync({
                campaignId: campaign.campaignId,
                decision: 'approve',
                note: note.trim() || undefined,
              });
              setDecided('approve');
            } catch {
              // The mutation carries the message; the row stays so it can be retried.
            }
          }}
          accessibilityRole="button"
          accessibilityLabel={`Approve ${campaign.name}`}
          className="py-2 active:opacity-75"
        >
          <Text className="text-xs font-black text-primary-500">Approve</Text>
        </TouchableOpacity>

        <TouchableOpacity
          testID={`reject-${campaign.campaignId}`}
          disabled={!canReject}
          onPress={async () => {
            try {
              await decide.mutateAsync({
                campaignId: campaign.campaignId,
                decision: 'reject',
                note: note.trim(),
              });
              setDecided('reject');
            } catch {
              // Same: the reason typed is not thrown away by a failed request.
            }
          }}
          accessibilityRole="button"
          accessibilityLabel={`Reject ${campaign.name}`}
          accessibilityState={{ disabled: !canReject }}
          className="py-2 active:opacity-75"
        >
          <Text className={`text-xs font-black ${canReject ? 'text-error-default' : 'text-content-muted'}`}>
            Reject
          </Text>
        </TouchableOpacity>
      </View>

      {!canReject && note.trim().length === 0 ? (
        <Text style={{ color: tokens.color.text.placeholder }} className="text-[10px] font-semibold mt-1">
          A rejection needs a reason. The advertiser is shown it, and can answer it.
        </Text>
      ) : null}

      {decide.error ? (
        <Text accessibilityRole="alert" className="text-[11px] font-semibold text-error-default mt-2">
          {(decide.error as { message?: string }).message ?? 'That did not go through.'}
        </Text>
      ) : null}
    </View>
  );
}

export default function CampaignReviewsScreen() {
  const insets = useSafeAreaInsets();
  const queue = useCampaignReviewQueue();

  const isForbidden = (queue.error as { kind?: string } | null)?.kind === 'forbidden';

  return (
    <View className="flex-1 bg-surface-background">
      <ScreenHeader title="Review queue" />

      <ScrollEndScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 32 }}
      >
        {isForbidden ? (
          <MonetizationEmpty
            icon="shield-outline"
            title="This is the reviewers’ queue"
            message="Your account does not review advertising. Nothing here is hidden from you by mistake — the platform decides who reviews, and it has answered."
          />
        ) : queue.isError ? (
          <MonetizationEmpty
            icon="cloud-offline-outline"
            title="The queue did not load"
            message={queue.error?.message ?? 'Try again in a moment.'}
          />
        ) : queue.campaigns.length === 0 && !queue.isLoading ? (
          <MonetizationEmpty
            icon="checkmark-done-outline"
            title="Nothing waiting"
            message="Every campaign that has been paid for has had a decision."
          />
        ) : (
          <MonetizationSection title="Waiting on a decision">
            <View style={{ gap: 12 }}>
              {queue.campaigns.map((campaign) => (
                <ReviewRow key={campaign.campaignId} campaign={campaign} />
              ))}
            </View>
          </MonetizationSection>
        )}
      </ScrollEndScrollView>
    </View>
  );
}
