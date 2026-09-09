// ─────────────────────────────────────────────────────────────────────────────
// Who a conversation is with
//
// ── The defect ──────────────────────────────────────────────────────────────
//
// Both the header and the list row named the counterparty as
//
//     conversation.participants.find((p) => !p.isCurrentUser)?.displayName
//       || 'Unknown'
//
// **Not every conversation has another person in it.** Messaging an
// organisation addresses the organisation, which is not a user and is therefore
// not a participant, so `other` was undefined and the screen said "Unknown"
// with a "?" for an avatar — above a context card that was, at that moment,
// displaying the organisation's name.
//
// The conversation always knows what it is about: `context.entityTitle` is
// required on the snapshot. So the name was there the whole time, one field
// away from the code that gave up and said "Unknown".
//
// ── Why the fallback is general ─────────────────────────────────────────────
//
// The rule is "no other person, name it by its subject" rather than a check for
// `type === 'Organization'`. A conversation about a marketplace listing does
// have a person on the other end and keeps their name; one about anything with
// nobody on the other end gets the best name available. A future subject that
// is not a person is then handled before it is written.
// ─────────────────────────────────────────────────────────────────────────────

import type { Conversation, ConversationParticipant } from '@/types/conversation';

/** The other person in a conversation, when there is one. */
export function otherParticipant(
  conversation: Pick<Conversation, 'participants'>
): ConversationParticipant | undefined {
  return conversation.participants.find((participant) => !participant.isCurrentUser);
}

/**
 * What to call this conversation.
 *
 * The other person's name where there is one; otherwise what the conversation
 * is about. "Unknown" only survives for a conversation with nobody in it and
 * nothing to say about itself, which should not happen and is not worth
 * inventing a nicer lie for.
 */
export function conversationTitle(
  conversation: Pick<Conversation, 'participants' | 'context'>
): string {
  const other = otherParticipant(conversation);

  if (other?.displayName) {
    return other.displayName;
  }

  return conversation.context?.entityTitle?.trim() || 'Unknown';
}

/**
 * The line under the title when the counterparty is not a person.
 *
 * With a person there, that row carries presence — online, last seen — which
 * an organisation does not have. Its own subtitle is the useful thing instead:
 * "Hometown association" beneath "Curepipe Community Trust".
 */
export function conversationSubtitle(
  conversation: Pick<Conversation, 'participants' | 'context'>
): string | null {
  if (otherParticipant(conversation)) {
    return null;
  }

  return conversation.context?.entitySubtitle?.trim() || null;
}

/** Up to two initials for an avatar, from whatever the conversation is called. */
export function conversationInitials(
  conversation: Pick<Conversation, 'participants' | 'context'>
): string {
  const title = conversationTitle(conversation);

  if (title === 'Unknown') {
    return '?';
  }

  const initials = title
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return initials || '?';
}
