// ─────────────────────────────────────────────────────────────────────────────
// Badges — the server's, presented
//
// ── What this replaced ───────────────────────────────────────────────────────
//
// This file held `ALL_CREATOR_BADGES`: thirty-two badges written in by hand,
// each with its status typed into the literal ("UK Residency Verified" to a
// member in Mauritius, 20 of 32 "earned" for everybody), in every build. It was
// a catalogue of things the app *might* recognise, presented as things the
// member *had*.
//
// Since 20 Oct 2026 the badges are the reputation read's
// (`GET /creators/me/reputation`, `GET /creators/{creatorId}/reputation`):
// Trust's active awards (`source: 'trust'`, always earned) and the creator
// milestones whose reward is a badge (`source: 'milestone'`, earned once
// claimed, otherwise served with the server's own progress on the creator's
// own read). Nothing here decides whether a badge is earned, and nothing here
// adds a badge the server did not send.
//
// What is left is presentation: grouping by the source the server named, an
// icon for a Trust award (its label's own emoji, moved out of the title so it
// shows once), an emoji for a catalogue icon name (`servedIcon`), and wording.
// Since 4 Nov 2026 the creator's own read also carries the Trust badges still
// to earn, each with the server's how-to-earn line as its description.
// ─────────────────────────────────────────────────────────────────────────────

import { isFlagEmoji, servedIcon, splitLeadingEmoji } from '@/lib/served-icon';
import type { CreatorReputationBadge } from '@/types/creator-economy';

export interface BadgeItem {
  id: string;
  icon: string;
  title: string;
  /** The server's description. Absent when it sent none — never written here. */
  description?: string | null;
  isEarned: boolean;
  statusText: string;
  /** The server's progress figure, as words. Only on an unearned badge. */
  progress?: string;
  /** The `source` the server named: `trust`, `milestone`, or a later one. */
  source: string;
}

/** Known sources first; a source added later is listed after them, under its own name. */
export const BADGE_SOURCE_ORDER: readonly string[] = ['trust', 'milestone'] as const;

export const BADGE_SOURCE_LABELS: Record<string, string> = {
  trust: 'Trust & verification',
  milestone: 'Creator milestones',
};

export function badgeSourceLabel(source: string): string {
  return BADGE_SOURCE_LABELS[source] ?? source;
}

/**
 * Icons for Trust's award types, for a label that carries no emoji of its own.
 * Presentation only: an unknown type gets the generic medal, never a guess at
 * its meaning. Keyed by the server's `BadgeType` names, all fourteen.
 */
const TRUST_BADGE_ICONS: Record<string, string> = {
  PhoneVerified: '📱',
  EmailVerified: '✉️',
  CountryVerified: '🌍',
  GovernmentIdVerified: '🪪',
  ProfilePhoto: '📷',
  ProviderVerified: '💼',
  TopContributor: '🏆',
  VerifiedMember: '✅',
  TrustedContributor: '🏅',
  CommunityGuide: '🧭',
  VerifiedBusiness: '🏢',
  VerifiedOrganization: '🏛️',
  EarlyMember: '🌱',
  Moderator: '⚖️',
};

/**
 * Trust's own words for its award types, without the emoji (`BadgeLabels.For`
 * on the server). The guide read sends an author's badges as the type alone,
 * and the byline drew "PhoneVerified" (UAT on the emulator, 4 Nov 2026).
 */
const TRUST_BADGE_NAMES: Record<string, string> = {
  PhoneVerified: 'Phone Verified',
  EmailVerified: 'Email Verified',
  CountryVerified: 'Country Verified',
  GovernmentIdVerified: 'Government ID Verified',
  ProfilePhoto: 'Profile Photo',
  ProviderVerified: 'Provider Verified',
  TopContributor: 'Top Contributor',
  VerifiedMember: 'Verified Member',
  TrustedContributor: 'Trusted Contributor',
  CommunityGuide: 'Community Guide',
  VerifiedBusiness: 'Verified Business',
  VerifiedOrganization: 'Verified Organization',
  EarlyMember: 'Early Member',
  Moderator: 'Moderator',
};

/** A Trust badge type in words; a type added later is split into words, never printed joined. */
export function trustBadgeLabel(type: string): string {
  return TRUST_BADGE_NAMES[type] ?? type.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
}

function formatEarnedAt(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** One served badge, as the shelf and the sheet show it. */
export function toBadgeItem(badge: CreatorReputationBadge): BadgeItem {
  const earnedOn = badge.isEarned ? formatEarnedAt(badge.earnedAt) : null;
  const progress =
    !badge.isEarned && badge.progress
      ? `${badge.progress.current.toLocaleString()} of ${badge.progress.target.toLocaleString()}${
          badge.progress.unit ? ` ${badge.progress.unit}` : ''
        } · ${badge.progress.percentage}%`
      : undefined;

  // Trust's labels lead with their emoji, and a country award with its flag
  // ("🇳🇬 Nigeria Verified"): drawn beside an icon, that showed twice.
  const { emoji, text } = splitLeadingEmoji(badge.label);
  const typeIcon = badge.source === 'trust' ? TRUST_BADGE_ICONS[badge.key] : undefined;
  const flagged = emoji !== null && isFlagEmoji(emoji);

  return {
    id: badge.badgeId,
    icon: servedIcon(badge.icon, emoji ?? typeIcon ?? '🏅'),
    title: badge.countryCode && !flagged ? `${text} (${badge.countryCode})` : text,
    description: badge.description ?? null,
    isEarned: badge.isEarned,
    statusText: badge.isEarned ? (earnedOn ? `EARNED ${earnedOn}` : 'EARNED') : 'NOT YET',
    progress,
    source: badge.source,
  };
}

/** The sources present in a list, known ones first. */
export function badgeSources(badges: BadgeItem[]): string[] {
  const present = new Set(badges.map((badge) => badge.source));
  const known = BADGE_SOURCE_ORDER.filter((source) => present.has(source));
  const later = [...present].filter((source) => !BADGE_SOURCE_ORDER.includes(source)).sort();
  return [...known, ...later];
}
