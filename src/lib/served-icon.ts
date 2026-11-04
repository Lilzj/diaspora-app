// ─────────────────────────────────────────────────────────────────────────────
// An icon the server sent, drawn as an emoji
//
// The creator catalogue names its icons ("library", "star", "graduation-cap")
// where older rows carry an emoji, and every screen draws the field inside a
// <Text>. A name printed there reads as a word: the "Ten guides" badge showed
// "library" (UAT, 3 Nov 2026). Names become their emoji here; a name this list
// does not know gets the caller's fallback rather than a guess.
// ─────────────────────────────────────────────────────────────────────────────

/** The icon names the creator catalogue serves, as emoji. */
const ICON_NAME_EMOJI: Record<string, string> = {
  book: '📖',
  library: '📚',
  star: '⭐',
  users: '👥',
  'user-plus': '🤝',
  'graduation-cap': '🎓',
  compass: '🧭',
  calendar: '📅',
  shield: '🛡️',
  pen: '✍️',
};

/** A word made of letters, digits and dashes: an icon name, not an emoji. */
const ICON_NAME = /^[a-z][a-z0-9_-]*$/i;

export function servedIcon(icon: string | null | undefined, fallback: string): string {
  const trimmed = icon?.trim();
  if (!trimmed) return fallback;
  if (!ICON_NAME.test(trimmed)) return trimmed;
  return ICON_NAME_EMOJI[trimmed.toLowerCase()] ?? fallback;
}

/** True for a flag: a pair of regional indicator letters. */
export function isFlagEmoji(emoji: string): boolean {
  return Array.from(emoji).some((char) => {
    const point = char.codePointAt(0) ?? 0;
    return point >= 0x1f1e6 && point <= 0x1f1ff;
  });
}

/**
 * Splits a leading emoji (or flag) off a label: "📱 Phone Verified" →
 * `{ emoji: '📱', text: 'Phone Verified' }`. Trust composes its labels with
 * the emoji in front, so a screen that draws its own icon would show two.
 * A first word with any Latin letter or digit is text, and the label is
 * returned whole.
 */
export function splitLeadingEmoji(label: string): { emoji: string | null; text: string } {
  const trimmed = label.trim();
  const space = trimmed.indexOf(' ');
  if (space <= 0) return { emoji: null, text: trimmed };

  const first = trimmed.slice(0, space);
  if (/[A-Za-z0-9À-ɏ]/.test(first)) return { emoji: null, text: trimmed };

  let rest = trimmed.slice(space + 1).trim();
  // A country-scoped award is the flag, then the badge's own emoji and name.
  const next = splitLeadingEmoji(rest);
  if (next.emoji) rest = next.text;

  return { emoji: first, text: rest };
}
