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
// icon for a Trust award (which carries none on the wire), and wording.
// ─────────────────────────────────────────────────────────────────────────────

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
 * Icons for Trust's award types, which are served without one. Presentation
 * only: an unknown type gets the generic medal, never a guess at its meaning.
 */
const TRUST_BADGE_ICONS: Record<string, string> = {
  PhoneVerified: '📱',
  EmailVerified: '✉️',
  CountryVerified: '🏠',
  DiasporaVerified: '🌍',
  GovernmentIdVerified: '🪪',
  EarlyMember: '🚀',
  VerifiedMember: '✅',
};

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

  return {
    id: badge.badgeId,
    icon:
      badge.icon ??
      (badge.source === 'trust' ? TRUST_BADGE_ICONS[badge.key] : undefined) ??
      '🏅',
    title: badge.countryCode ? `${badge.label} (${badge.countryCode})` : badge.label,
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
