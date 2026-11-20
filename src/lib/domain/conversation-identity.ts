// ─────────────────────────────────────────────────────────────────────────────
// Who wrote a message — 15 Sep 2026
//
// **Found in the two-account walkthrough.** Every message a member sent showed on
// the left, in the other person's colours, with a "?" where an avatar should be
// and no delivery ticks — as though the other person had written it. The thread
// decided "is this mine" with
//
//     item.senderId === 'user-current'
//
// — the placeholder id the development fixtures give their member. The server
// sends the member's real user id, so the comparison was false for every
// message on every real conversation. The inbox row used the same literal, so a
// member's own last message never showed its ticks either. And the pending
// bubble a send creates was stamped `senderName: 'Joshua M.'`.
//
// Three facts from `Diaspora.Modules.Conversations` shape what is below:
//
//   * **`MessageResponse.senderName` is always null**, and so is
//     `replyTo.senderName` (`ConversationMapper`: "the client resolves it from
//     conversation.participants"). The participants carry the names —
//     `MemberParticipantDirectory` fills `displayName` — so a name is looked up,
//     never read off the message. `ReplyBubble` fell back to "You" for every
//     reply, so a reply to the other person was labelled as a reply to yourself.
//   * **`participants[].isCurrentUser` is computed per request by the server.**
//     It is the first answer to "who am I in this conversation"; the signed-in
//     account's id is the fallback for a conversation not loaded yet.
//   * **A system message has the empty GUID as its sender.** It must never
//     match anybody.
// ─────────────────────────────────────────────────────────────────────────────

import type { Conversation, ConversationParticipant, Message, ReplyReference } from '@/types/conversation';

const EMPTY_GUID = '00000000-0000-0000-0000-000000000000';

/** The same person, whatever the casing of the two GUIDs. Never true for a blank or empty id. */
export function sameUser(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = (a ?? '').trim().toLowerCase();
  const right = (b ?? '').trim().toLowerCase();
  if (!left || !right || left === EMPTY_GUID || right === EMPTY_GUID) return false;
  return left === right;
}

/**
 * The member's own id in this conversation.
 *
 * The server's `isCurrentUser` first, because it is the server's answer for this
 * very conversation; the signed-in account's id when the conversation is not on
 * the device yet.
 */
export function currentUserIdIn(
  conversation: Pick<Conversation, 'participants'> | null | undefined,
  signedInUserId: string | null | undefined
): string | null {
  const me = conversation?.participants?.find((participant) => participant.isCurrentUser);
  return me?.userId?.trim() || signedInUserId?.trim() || null;
}

/**
 * Whether the member wrote this message.
 *
 * A pending bubble is always theirs: only this device makes one, and only for a
 * send.
 */
export function isOwnMessage(
  message: Pick<Message, 'senderId' | 'isOptimistic'>,
  currentUserId: string | null | undefined
): boolean {
  return message.isOptimistic === true || sameUser(message.senderId, currentUserId);
}

/** The participant with this id, when the conversation names them. */
export function participantFor(
  participants: readonly ConversationParticipant[] | null | undefined,
  userId: string | null | undefined
): ConversationParticipant | undefined {
  return (participants ?? []).find((participant) => sameUser(participant.userId, userId));
}

/**
 * What to call the author of a message: "You", the participant's name, or empty
 * when the platform did not say. Empty is not "Unknown" — the bubble renders no
 * initials rather than a question mark about a real person.
 */
export function authorName(
  senderId: string | null | undefined,
  participants: readonly ConversationParticipant[] | null | undefined,
  currentUserId: string | null | undefined
): string {
  if (sameUser(senderId, currentUserId)) return 'You';
  return participantFor(participants, senderId)?.displayName?.trim() ?? '';
}

/** "AO" for "Aisha Okonkwo". Empty for no name. */
export function initialsOf(name: string | null | undefined): string {
  return (name ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join('');
}

/**
 * A message ready to render: its author and the author of what it replies to,
 * named from the conversation rather than from fields the server leaves null.
 *
 * A name the message itself carries is kept — a pending bubble, or a fixture —
 * but only for somebody else. The member's own messages always read "You".
 */
export function withAuthors(
  message: Message,
  participants: readonly ConversationParticipant[] | null | undefined,
  currentUserId: string | null | undefined
): Message {
  const own = isOwnMessage(message, currentUserId);
  const senderName = own
    ? 'You'
    : authorName(message.senderId, participants, currentUserId) || message.senderName?.trim() || '';

  const replyTo: ReplyReference | undefined = message.replyTo
    ? {
        ...message.replyTo,
        senderName:
          authorName(message.replyTo.senderId, participants, currentUserId) ||
          message.replyTo.senderName?.trim() ||
          '',
      }
    : undefined;

  if (senderName === message.senderName && replyTo?.senderName === message.replyTo?.senderName) {
    return message;
  }

  return { ...message, senderName, replyTo };
}
