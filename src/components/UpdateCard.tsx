// ─────────────────────────────────────────────────────────────────────────────
// The alert card's trust panel
//
// The panel is headed "Community trust scoring" and until now scored nothing.
// It rendered `min(65 + verified*8 + confirmations*2, 99)` as a percentage —
// a base of 65 out of nowhere and two weights out of nowhere — above a safety
// alert, in the same house style as a measurement.
//
// **The platform already computes this, and computes it better.** B6 holds
// `ConfirmationThresholds`: a scale that rises with urgency (an emergency needs
// ten confirmations, a normal post three), a dispute rule that deliberately
// outranks corroboration, and a `verificationStatus` recomputed on every
// reaction. All three arrive on the wire. The card's job is to render them.
//
// **The button wrote to a different system than the card read from.** It posted
// `POST /trust/contributions/confirmations`, which pays the author reputation
// and moves no count anywhere; every number beside it came from B6's
// `confirmationCount`, which only a corroborating *reaction* moves. So the
// count never changed on refresh, and no amount of pressing it could carry an
// alert to `communityVerified`. It now posts the corroborating reaction, and
// Trust picks the author's points up from that reaction through
// `CommunityCorroborationConsumer` — one press, both effects, one count.
//
// **There is no percentage here any more, and there should not be.** A share of
// readers needs a count of readers. B6 serves `viewCount` on the post detail and
// not on this summary, and a raw view count answers a different question from
// "how many of the people who could confirm did". Until something records that
// denominator, a figure with a % on it would be inventing one.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { useNotification } from '@/providers/notification-provider';
import { View, Text, Animated, Pressable, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import type { UpdateSummary } from '@/types/update';
import type { AuthorSummary } from '@/types/social';
import { UPDATE_CATEGORY_ICONS } from '@/types/update';
import { ReputationBadge } from './ReputationBadge';
import { useCommunityCapabilities, useReact } from '@/hooks/community-social';
import { corroboratingReactionFor, toReactionSummary } from '@/lib/community-social-api';
import { useThemeTokens } from '@/design-system';

interface UpdateCardProps {
  update: UpdateSummary;
  author: AuthorSummary;
}

/**
 * Literal hex rather than tokens because these are semantic constants that must
 * not follow a theme: an emergency is red in both schemes.
 *
 * Keyed in **the server's spelling**. They were keyed `Emergency`/`Urgent`/… and
 * the wire sends `emergency`/`urgent`/…, so every lookup missed and the render
 * read `.bg` off `undefined`. `labels.ts` fixed the same four values for the
 * post card and this copy was left behind.
 */
const ACCESSIBLE_URGENCY_STYLES: Record<
  string,
  { text: string; bg: string; border: string; label: string }
> = {
  emergency: { text: '#B91C1C', bg: '#FEF2F2', border: '#FEE2E2', label: '🚨 EMERGENCY' },
  urgent: { text: '#B45309', bg: '#FFFBEB', border: '#FEF3C7', label: '⚠️ URGENT' },
  normal: { text: '#1D4ED8', bg: '#EFF6FF', border: '#DBEAFE', label: 'NORMAL' },
  low: { text: '#374151', bg: '#F3F4F6', border: '#E5E7EB', label: 'LOW' },
};

/** How the platform's three verification states are worded and coloured. */
const VERIFICATION_PRESENTATION: Record<
  string,
  { label: string; className: string }
> = {
  communityVerified: { label: '✓ Community verified', className: 'text-success-default' },
  disputed: { label: '⚠️ Disputed by members', className: 'text-error-default' },
  unverified: { label: 'Not yet confirmed', className: 'text-content-muted' },
};

export function UpdateCard({ update, author }: UpdateCardProps) {
  const tokens = useThemeTokens();
  const { showAlert } = useNotification();
  const scaleVal = React.useRef(new Animated.Value(1)).current;

  // Which reaction this deployment corroborates with, asked for by meaning
  // rather than by name. Null means it offers none for posts, and the control
  // does not render — the alternative is a button that posts a key the server
  // has never heard of.
  const { capabilities } = useCommunityCapabilities();
  const corroboration = corroboratingReactionFor(capabilities, 'post');

  const { react, isPending: isConfirming } = useReact({
    contentType: 'post',
    contentId: update.updateId,
  });

  // Straight off the wire. These were `useState` seeded from the same props,
  // which meant a confirmation that the server refused still looked like it had
  // landed, and a confirmation that succeeded was forgotten on the next remount.
  const confirmations = update.confirmationCount ?? 0;
  const required = update.requiredConfirmations ?? 0;
  const stillNeeded = Math.max(0, required - confirmations);

  // `readReactionSummary` exists to reconcile the two names B6 uses for this
  // record — `summary` on a reaction response, `reactions` on a post. A summary
  // carries only the second, so the field is unambiguous and read directly.
  // Through `toReactionSummary`: the server names it `viewerReactions`, never `myReactionKey`.
  const viewerReaction = toReactionSummary(update.reactions)?.myReactionKey ?? null;
  const hasConfirmed = corroboration !== null && viewerReaction === corroboration.key;

  const handlePress = () => router.push(`/update/${update.updateId}`);

  const handlePressIn = () => {
    Animated.spring(scaleVal, {
      toValue: 0.98,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleVal, {
      toValue: 1,
      useNativeDriver: true,
    }).start();
  };

  const handleConfirmAlert = async (e?: { stopPropagation?: () => void }) => {
    // Optional, and guarded. This read `e.stopPropagation()` outright, so any
    // caller that invokes `onPress` without an event — which is what a press
    // through the testing library does — threw before reaching the confirm.
    e?.stopPropagation?.(); // keep the press off the card's navigation
    if (!corroboration || hasConfirmed || isConfirming) return;

    try {
      // The corroborating reaction is what moves `confirmationCount` and
      // re-evaluates the threshold, so the number beside this button is the
      // number the button changes. `useReact` invalidates the post on success —
      // the new count comes back from the server rather than being guessed here.
      await react(corroboration.key);

      showAlert({
        type: 'success',
        title: 'Confirmation recorded',
        message:
          'Thank you. Your confirmation counts towards this alert being community verified, and towards the author’s standing.',
        buttons: [{ text: 'OK' }],
      });
    } catch {
      showAlert({
        type: 'error',
        title: 'Not recorded',
        message: 'We could not record your confirmation just now. Please try again.',
        buttons: [{ text: 'OK' }],
      });
    }
  };

  const timeAgo = getRelativeTime(update.publishedAt);
  const expiresIn = getTimeUntil(update.expiresAt);
  const categoryIcon = UPDATE_CATEGORY_ICONS[update.category];

  // Both fall back rather than indexing blind: an urgency or a status this
  // build has not met is a label to soften, not a crash.
  const urgencyStyle =
    ACCESSIBLE_URGENCY_STYLES[update.urgency] ?? ACCESSIBLE_URGENCY_STYLES.normal;
  const verification =
    VERIFICATION_PRESENTATION[update.verificationStatus] ?? VERIFICATION_PRESENTATION.unverified;

  return (
    <Pressable
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={{ marginBottom: 12 }}
    >
      <Animated.View
        style={{
          transform: [{ scale: scaleVal }],
          backgroundColor: tokens.color.surface.card,
          borderRadius: 20,
          padding: 16,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.03,
          shadowRadius: 4,
          elevation: 1,
          borderWidth: 1,
          borderColor: tokens.color.neutral[100],
        }}
      >
        {/* Top Header: Urgency badge & Expiry time */}
        <View className="flex-row items-center justify-between mb-3">
          <View
            style={{
              backgroundColor: urgencyStyle.bg,
              borderColor: urgencyStyle.border,
              borderWidth: 1,
            }}
            className="px-2.5 py-0.5 rounded-full"
          >
            <Text
              style={{ color: urgencyStyle.text }}
              className="text-xs font-extrabold tracking-wider"
            >
              {urgencyStyle.label}
            </Text>
          </View>
          <Text className="text-xs text-content-faint font-extrabold">
            Expires {expiresIn}
          </Text>
        </View>

        {/* Title & Category Icon */}
        <View className="flex-row items-center mb-1.5">
          <Text className="text-lg mr-2">{categoryIcon}</Text>
          <Text className="font-extrabold text-content-primary text-base flex-1 leading-snug" numberOfLines={1}>
            {update.title}
          </Text>
        </View>

        {/* Description */}
        <Text className="text-sm text-content-muted mb-3 leading-relaxed" numberOfLines={2}>
          {update.description}
        </Text>

        {/* Location & Time */}
        <View className="flex-row items-center justify-between border-t border-faint pt-2.5 mb-3">
          <Text className="text-xs text-content-faint font-bold">
            📍 {update.location.areaName}
            {update.location.distanceKm != null && ` · ${update.location.distanceKm.toFixed(1)} km away`}
          </Text>
          <Text className="text-xs text-content-muted font-bold">🕐 {timeAgo}</Text>
        </View>

        {/* Trust Indicator panel */}
        <View className="bg-surface-background rounded-xl p-3 border border-faint mb-3">
          <View className="flex-row items-center justify-between mb-1.5">
            <Text className="text-xs font-extrabold text-content-faint uppercase tracking-wider">Community trust scoring</Text>
            <Text className={`text-xs font-black ${verification.className}`}>
              {verification.label}
            </Text>
          </View>

          {/*
            One count, and it is the platform's own.

            It used to read "Verified by N Local Residents & confirmed by M
            community members nearby", splitting confirmers into two tiers. There
            is no local tier on this platform — every member is local to
            somewhere — so a count that ranks confirmations by residence is
            ranking them by something Diaspora does not model. The wire's
            `verifiedResidentConfirmationCount` still feeds B6's threshold, where
            it means identity-verified in that country; it is not a fact about
            the reader and is not shown to them as one.
          */}
          <Text className="text-xs text-content-tertiary leading-relaxed font-semibold mb-2">
            {confirmations === 0
              ? 'No one has confirmed this yet.'
              : `Confirmed by ${confirmations} ${confirmations === 1 ? 'member' : 'members'}.`}
            {update.verificationStatus === 'unverified' && stillNeeded > 0
              ? ` ${stillNeeded} more ${stillNeeded === 1 ? 'confirmation' : 'confirmations'} needed.`
              : ''}
          </Text>

          {/*
            Offered to every member, because B6 offers it to every member: a
            corroborating reaction needs authentication and a post you did not
            write, and nothing else. This was gated behind TrustedContributor and
            above, so the platform's own capability was hidden from most of the
            people holding it — and the alerts needing confirmation most are the
            ones too new to have attracted a trusted contributor.
          */}
          {corroboration && (
            <TouchableOpacity
              onPress={(e) => void handleConfirmAlert(e)}
              disabled={hasConfirmed || isConfirming}
              accessibilityRole="button"
              accessibilityState={{ disabled: hasConfirmed || isConfirming, selected: hasConfirmed }}
              className={`py-2 rounded-xl border items-center justify-center ${
                hasConfirmed ? 'bg-success-surface border-success-default' : 'bg-surface-card border-subtle'
              }`}
            >
              <Text className={`text-xs font-extrabold uppercase ${hasConfirmed ? 'text-success-default' : 'text-content-secondary'}`}>
                {hasConfirmed
                  ? '✓ You confirmed this'
                  : isConfirming
                    ? 'Recording…'
                    : `🗳️ ${corroboration.label}`}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Bottom Panel: Author Info */}
        <View className="flex-row items-center justify-between pt-2 border-t border-faint">
          <Text className="text-xs text-content-faint font-bold">
            Alert posted by: <Text className="text-content-secondary font-extrabold">{author.name}</Text>
          </Text>
          <ReputationBadge level={author.reputationLevel} size="sm" showLabel={false} />
        </View>
      </Animated.View>
    </Pressable>
  );
}

function getRelativeTime(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  return `${diffDays}d ago`;
}

function getTimeUntil(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = date.getTime() - now.getTime();
  if (diffMs <= 0) return 'expired';
  const diffHrs = Math.floor(diffMs / 3600000);
  if (diffHrs < 1) return `in ${Math.floor(diffMs / 60000)}m`;
  if (diffHrs < 24) return `in ${diffHrs}h`;
  const diffDays = Math.floor(diffHrs / 24);
  return `in ${diffDays}d`;
}
