// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Community edge states (Frontend Phase 13, §74, §75)
//
// §74 lists eighteen states every major community feature must handle. Writing
// eighteen `if` branches into each of twenty screens would guarantee that some
// screens handled twelve of them, so they live here once, keyed on
// `CommunityUnavailableReason` — which the repository layer already returns.
//
// Two rules the panel holds to:
//
//   **Every state offers the right next step, or none.** A `forbidden` panel does
//   not offer "try again", because trying again will not help. An `offline` panel
//   does. A `community-suspended` panel offers nothing at all except the reason,
//   because there is nothing the member can do and a button implying otherwise
//   would waste their time.
//
//   **The server's reason is rendered verbatim.** §75's `statusReason` is written
//   by whoever suspended or archived the community, and paraphrasing it in the
//   client would put words in a moderator's mouth. Where no reason was sent, the
//   panel says the honest generic thing rather than inventing a specific one.
//
// `forbidden` and `unauthorized` are separate panels, not one: the first is
// answered by asking the community, the second by signing in, and collapsing them
// sends half the members to the wrong place.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/design-system';
import type { CommunityUnavailableReason } from '@/types/community-directory';
import { MultiCommunityGapNotice } from './MultiCommunityGapNotice';

interface PanelCopy {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
  /** The label for the action, or null where no action would help. */
  action: string | null;
  tone: 'neutral' | 'warning' | 'error' | 'info';
}

function copyFor(reason: CommunityUnavailableReason, subject: string): PanelCopy {
  switch (reason) {
    case 'empty':
      return {
        icon: 'file-tray-outline',
        title: `Nothing here yet`,
        body: `There is no ${subject} to show for the communities you have chosen. Try widening your community filter or looking in a wider area.`,
        action: null,
        tone: 'neutral',
      };

    case 'error':
      return {
        icon: 'alert-circle-outline',
        title: 'That did not load',
        body: `We could not load ${subject} just now. It is usually a passing problem.`,
        action: 'Try again',
        tone: 'error',
      };

    case 'offline':
      return {
        icon: 'cloud-offline-outline',
        title: 'You are offline',
        body: `We will show ${subject} again as soon as you have a connection. Anything already saved on this device is still readable.`,
        action: 'Try again',
        tone: 'warning',
      };

    case 'unauthorized':
      return {
        icon: 'log-in-outline',
        title: 'Sign in to see this',
        body: `Your communities are part of your account, so ${subject} needs you signed in.`,
        action: 'Sign in',
        tone: 'info',
      };

    case 'forbidden':
      return {
        icon: 'lock-closed-outline',
        title: 'Not available to you',
        body: `This community keeps ${subject} for its members and moderators. Nothing you can do on this screen will change that — the community decides.`,
        action: null,
        tone: 'neutral',
      };

    case 'not-found':
      return {
        icon: 'help-circle-outline',
        title: 'We could not find that community',
        body: 'The link may be out of date, or the community may have closed. Try searching for it instead.',
        action: 'Browse communities',
        tone: 'neutral',
      };

    case 'community-suspended':
      return {
        icon: 'pause-circle-outline',
        title: 'This community is paused',
        body: 'Its moderators or Diaspora have paused it for now. Members keep their membership.',
        action: null,
        tone: 'warning',
      };

    case 'community-archived':
      return {
        icon: 'archive-outline',
        title: 'This community has closed',
        body: 'Nothing new is posted here. What was already published stays readable.',
        action: null,
        tone: 'neutral',
      };

    case 'membership-revoked':
      return {
        icon: 'person-remove-outline',
        title: 'Your membership here has ended',
        body: 'A moderator of this community ended your membership. If you think that was a mistake, the community’s moderators are the people to ask.',
        action: null,
        tone: 'error',
      };

    case 'role-revoked':
      return {
        icon: 'shield-outline',
        title: 'You no longer have this role',
        body: 'Your moderator or ambassador role in this community has ended, so this area is closed.',
        action: null,
        tone: 'warning',
      };

    case 'statistics-unavailable':
      return {
        icon: 'stats-chart-outline',
        title: 'Numbers are not available',
        body: 'We could not load this community’s figures. Rather than show a number we are not sure of, we are showing none.',
        action: 'Try again',
        tone: 'neutral',
      };

    case 'membership-unavailable':
      return {
        icon: 'people-outline',
        title: 'Membership is not available',
        body: 'We cannot check your community memberships just now, so anything that depends on them is hidden rather than guessed.',
        action: 'Try again',
        tone: 'warning',
      };

    case 'cross-community-unavailable':
      return {
        icon: 'git-network-outline',
        title: 'Looking across communities is not available',
        body: 'You can still choose one community at a time.',
        action: null,
        tone: 'neutral',
      };

    case 'feature-disabled':
      return {
        icon: 'construct-outline',
        title: 'Not available yet',
        body: `${subject} is not something Diaspora can show yet. We will let you know when it arrives.`,
        action: null,
        tone: 'neutral',
      };

    case 'loading':
    default:
      return {
        icon: 'hourglass-outline',
        title: 'Loading',
        body: '',
        action: null,
        tone: 'neutral',
      };
  }
}

/**
 * The panel every community surface renders when it cannot show its content.
 *
 * `detail` is the server's own reason and is rendered **instead of** the generic
 * body when present, because the specific reason is always more useful than the
 * category.
 */
export function CommunityUnavailablePanel({
  reason,
  subject = 'this',
  detail,
  onAction,
  compact = false,
  /** Set to also render the gap notice for a disabled surface. */
  gapKey,
}: {
  reason: CommunityUnavailableReason;
  /** What is missing, in the member's words: "guides", "this community's events". */
  subject?: string;
  detail?: string | null;
  onAction?: () => void;
  compact?: boolean;
  gapKey?: string;
}) {
  const { tokens } = useTheme();

  if (reason === 'loading') {
    return (
      <View
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={`Loading ${subject}`}
        className={compact ? 'py-6 items-center' : 'py-12 items-center'}
        testID="community-loading-panel"
      >
        <ActivityIndicator color={tokens.color.primary[500]} />
      </View>
    );
  }

  const copy = copyFor(reason, subject);

  const tone =
    copy.tone === 'error'
      ? { color: tokens.color.error.default, surface: tokens.color.error.surface }
      : copy.tone === 'warning'
        ? { color: tokens.color.warning.default, surface: tokens.color.warning.surface }
        : copy.tone === 'info'
          ? { color: tokens.color.info.default, surface: tokens.color.info.surface }
          : { color: tokens.color.text.secondary, surface: tokens.color.neutral[100] };

  const body = detail?.trim() ? detail.trim() : copy.body;

  return (
    <View
      className={compact ? 'py-4 px-4 items-center' : 'py-10 px-6 items-center'}
      testID={`community-unavailable-${reason}`}
    >
      <View
        accessible
        accessibilityRole="text"
        accessibilityLabel={`${copy.title}. ${body}`}
        className="items-center"
      >
        <View
          style={{ backgroundColor: tone.surface }}
          className="w-12 h-12 rounded-2xl items-center justify-center mb-3"
        >
          <Ionicons name={copy.icon} size={22} color={tone.color} />
        </View>

        <Text
          style={{ color: tokens.color.text.primary }}
          className="text-sm font-black text-center"
        >
          {copy.title}
        </Text>

        {body ? (
          <Text
            style={{ color: tokens.color.text.secondary }}
            className="text-xs font-semibold text-center leading-relaxed mt-1.5 max-w-[300px]"
          >
            {body}
          </Text>
        ) : null}
      </View>

      {copy.action && onAction ? (
        <TouchableOpacity
          accessible
          accessibilityRole="button"
          accessibilityLabel={copy.action}
          onPress={onAction}
          activeOpacity={0.8}
          style={{ borderColor: tokens.color.border.default }}
          className="rounded-full border px-4 py-2 mt-4"
          testID={`community-unavailable-action-${reason}`}
        >
          <Text style={{ color: tokens.color.text.primary }} className="text-xs font-bold">
            {copy.action}
          </Text>
        </TouchableOpacity>
      ) : null}

      {gapKey && reason === 'feature-disabled' ? (
        <View className="mt-4 w-full">
          <MultiCommunityGapNotice gapKey={gapKey} compact />
        </View>
      ) : null}
    </View>
  );
}

/**
 * The banner shown above cached content while offline.
 *
 * §45: when offline, cached information must be visibly distinguished from current
 * information. This is that distinction, and it carries the date rather than just
 * saying "cached" — "saved 3 days ago" tells a member whether to trust it, and
 * "cached" does not.
 */
export function CommunityOfflineBanner({ savedAt }: { savedAt?: string | null }) {
  const { tokens } = useTheme();

  const when = savedAt ? formatSavedAt(savedAt) : null;
  const sentence = when
    ? `You are offline. This is what was saved on this device ${when}, not what is there now.`
    : 'You are offline. This is saved information, not what is there now.';

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={sentence}
      style={{
        backgroundColor: tokens.color.warning.surface,
        borderColor: `${tokens.color.warning.default}44`,
      }}
      className="flex-row items-center rounded-2xl border px-3 py-2"
      testID="community-offline-banner"
    >
      <Ionicons name="cloud-offline-outline" size={14} color={tokens.color.warning.default} />
      <Text
        style={{ color: tokens.color.text.secondary }}
        className="text-[11px] font-semibold ml-2 flex-1 leading-relaxed"
      >
        {sentence}
      </Text>
    </View>
  );
}

function formatSavedAt(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;

  const days = Math.floor((Date.now() - date.getTime()) / (24 * 60 * 60 * 1000));
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  return `on ${date.toLocaleDateString()}`;
}
