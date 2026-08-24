// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Wording for the community social graph (Wave D-2b)
//
// Every vocabulary in `types/community-social.ts` is **open** — the named
// members are what this client has seen, and `GET /community/capabilities` is
// the authority. So none of the maps below may be exhaustive, and none of them
// may be a lookup that returns `undefined` and renders as a blank chip.
//
// `humanise` is the fallback and it is the point of this file: a category the
// platform adds tomorrow renders as "Market prices" rather than as nothing at
// all, and nobody has to ship a release for a word.
//
// The spellings are the trap. This module's enums are **camelCase** —
// `marketPrices`, `safetyAlert`, `verifiedMembers`, `hateSpeech` — where every
// other list surface in this application uses kebab-cased slugs. Nothing here
// normalises them; a `marketPrices` that became `market-prices` on the way to a
// filter is a 400, not a near miss.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  CommunityPostCategory,
  CommunityPostUrgency,
  CommunityPostVisibility,
  CommunityReactionKey,
} from '@/types/community-social';

/**
 * A camelCase wire value as a sentence-cased phrase.
 *
 * The fallback for every map below. `marketPrices` becomes "Market prices",
 * `hateSpeech` becomes "Hate speech", and a value nobody has seen yet becomes
 * something a member can read instead of an empty space.
 */
export function humanise(value: string): string {
  const spaced = value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[-_]+/g, ' ')
    .trim()
    .toLowerCase();
  if (spaced.length === 0) return value;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

const CATEGORY_GLYPHS: Record<string, string> = {
  general: '💬',
  marketPrices: '🛒',
  safetyAlert: '🚨',
  jobLead: '💼',
  housingTip: '🏠',
  question: '❓',
};

/** A glyph for a category, or a neutral one for a category we have not met. */
export function categoryGlyph(category: CommunityPostCategory | null): string {
  if (!category) return '💬';
  return CATEGORY_GLYPHS[category] ?? '💬';
}

export function categoryLabel(category: CommunityPostCategory | null): string {
  if (!category) return 'Community';
  return humanise(category);
}

/**
 * The colours an urgency draws in.
 *
 * Literal hex rather than tokens because these four are semantic constants that
 * must not follow a theme: an emergency is red in both schemes, and the same
 * four values are already spelled out in `UpdateCard` for the same reason.
 */
const URGENCY_STYLES: Record<string, { text: string; background: string; border: string }> = {
  emergency: { text: '#B91C1C', background: '#FEF2F2', border: '#FEE2E2' },
  urgent: { text: '#B45309', background: '#FFFBEB', border: '#FEF3C7' },
  normal: { text: '#374151', background: '#F3F4F6', border: '#E5E7EB' },
  // `low` is a real level and had no entry, so it fell through to `normal`'s
  // styling and was indistinguishable from it. `elevated` had an entry and is
  // not a level the platform has ever had.
  low: { text: '#4B5563', background: '#F9FAFB', border: '#F3F4F6' },
};

export function urgencyStyle(urgency: CommunityPostUrgency | null): {
  text: string;
  background: string;
  border: string;
} {
  if (!urgency) return URGENCY_STYLES.normal;
  return URGENCY_STYLES[urgency] ?? URGENCY_STYLES.normal;
}

/**
 * Whether an urgency is worth a badge.
 *
 * `normal` is the overwhelming majority and a badge on it is noise that makes
 * the two that matter harder to see.
 */
export function isUrgencyWorthBadging(urgency: CommunityPostUrgency | null): boolean {
  return urgency !== null && urgency !== 'normal';
}

/**
 * Who the member is telling, in their words rather than the enum's.
 *
 * `custom` is in the union because the wire declares it and is **never
 * offered** — there is no route that creates a visibility rule, so a post with
 * `custom` names a rule that cannot exist. It is spelled here anyway because a
 * post created before that was understood still has to render as something.
 */
const VISIBILITY_LABELS: Record<string, string> = {
  public: 'Everyone',
  followers: 'Followers',
  verifiedMembers: 'Verified members',
  communityVerified: 'Community-verified members',
  custom: 'A custom audience',
};

export function visibilityLabel(visibility: CommunityPostVisibility): string {
  return VISIBILITY_LABELS[visibility] ?? humanise(visibility);
}

/**
 * A fallback glyph for a reaction.
 *
 * The **live** glyph is `capabilities.reactions[].glyph` and that is what a
 * screen should render — this map only covers the gap between mount and the
 * capabilities response, and a key the deployment added that we have never
 * seen. A reaction bar built from this map rather than from capabilities would
 * offer a reaction the server refuses or hide one it accepts.
 */
const REACTION_GLYPHS: Record<string, string> = {
  like: '👍',
  celebrate: '🎉',
  support: '🤝',
  insightful: '💡',
};

export function reactionGlyph(key: CommunityReactionKey): string {
  return REACTION_GLYPHS[key] ?? '⭐';
}

/** "just now", "4h ago". The same shape the rest of the application uses. */
export function relativeTime(iso: string | null): string {
  if (!iso) return '';
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return '';

  const minutes = Math.floor((Date.now() - then) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;

  return new Date(then).toLocaleDateString();
}
