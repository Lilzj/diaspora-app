/**
 * Diaspora Conversations — Type Definitions & DTOs
 *
 * Single source of truth for all conversation-related data contracts.
 * Designed to map 1:1 with the future SignalR + REST backend.
 */

// ---------------------------------------------------------------------------
// CONVERSATION STATE MACHINE
// ---------------------------------------------------------------------------

/**
 * Every conversation moves through a defined lifecycle.
 * Not all transitions are valid from every state.
 *
 * PendingRequest → Accepted → Active → Muted | Archived | Blocked | Closed
 */
export type ConversationState =
  | 'PendingRequest'   // Unknown user sent first message; awaiting acceptance
  | 'Accepted'         // Request accepted; conversation active
  | 'Active'           // Normal ongoing conversation
  | 'Muted'            // Notifications silenced; still readable
  | 'Archived'         // Hidden from inbox; retrievable
  | 'Blocked'          // Blocked; no messages possible
  | 'Closed';          // Permanently closed (e.g., listing removed)

// ---------------------------------------------------------------------------
// CONVERSATION CONTEXT TYPES
// ---------------------------------------------------------------------------

export type ConversationContextType =
  | 'ProviderInquiry'
  | 'MarketplaceListing'
  | 'HousingListing'
  | 'JobOpportunity'
  | 'CommunityEvent'
  | 'Organization'
  | 'CommunityGuide'
  | 'SupportTicket'
  | 'TrustAppeal'
  | 'PrivateConversation'
  | 'AIAssistant'
  | 'BusinessAccount';

// ---------------------------------------------------------------------------
// CONTEXT VERSIONING — Snapshot at conversation creation time
// ---------------------------------------------------------------------------

/**
 * Snapshot of the entity at the time the conversation was started.
 * Prevents stale context (e.g., a price change or listing removal
 * does NOT alter what was discussed).
 */
export interface ConversationContextSnapshot {
  type: ConversationContextType;
  entityId: string;
  entityTitle: string;
  entitySubtitle?: string;        // e.g. "Seller: John" or "Location: Port Louis"
  entityImageUrl?: string;
  entityPrice?: string;           // Formatted price string at snapshot time
  entityStatus?: string;          // Status at snapshot time ("Active", "Sold", etc.)
  entityStatusLabel?: string;     // Human-readable status label
  // Current live status for Conversation Insights (fetched separately, not snapshot)
  currentEntityStatus?: 'Available' | 'Sold' | 'Rented' | 'Filled' | 'Cancelled' | 'Unavailable' | 'PriceChanged' | 'Active';
  currentEntityStatusNote?: string; // e.g. "Price reduced by £200 yesterday"
  snapshotAt: string;             // ISO timestamp
  deepLink?: string;              // Deep link to the original entity
  campaignSource?: string;        // Analytics: where the conversation was started from
  referralCode?: string;
  appVersion?: string;            // App version at conversation creation
}

// ---------------------------------------------------------------------------
// TRUST PROFILE
// ---------------------------------------------------------------------------

export interface ConversationTrustProfile {
  isVerified: boolean;
  verificationLabel?: string;     // "Diaspora Verified" | "Trusted Contributor" | "Community Leader"
  rating?: number;                // 0–5
  reviewCount?: number;
  responseTime?: string;          // "Immediate" | "< 1 hr" | "~3 hrs"
  responseRate?: number;          // 0–100 percentage
  memberSince?: string;           // Year string e.g. "2023"
  countryVerifications?: Array<{
    countryCode: string;
    countryName: string;
    flag: string;
    isVerified: boolean;
  }>;
  reputationLevel?: string;       // "VerifiedResident" | "TrustedContributor" etc.
  totalHelpfulVotes?: number;
}

// ---------------------------------------------------------------------------
// PARTICIPANTS
// ---------------------------------------------------------------------------

export interface ConversationParticipant {
  userId: string;
  displayName: string;
  avatarUrl?: string;
  trust: ConversationTrustProfile;
  isCurrentUser: boolean;
}

// ---------------------------------------------------------------------------
// MESSAGE STATUS
// ---------------------------------------------------------------------------

/**
 * Progressive delivery/read state for a message.
 * Only the sender sees per-message status.
 */
export type MessageStatus =
  | 'queued'      // Offline; waiting to send
  | 'sending'     // In-flight
  | 'sent'        // Server acknowledged
  | 'delivered'   // Recipient device received
  | 'read'        // Recipient opened
  | 'failed';     // Delivery failed

export interface MessageDeliveryReceipt {
  status: MessageStatus;
  sentAt?: string;           // ISO — when server received
  deliveredAt?: string;      // ISO — when delivered to device
  readAt?: string;           // ISO — when opened by recipient
  // Analytics fields (used by future metrics/response time calculations)
  queuedAt?: string;
  failedAt?: string;
  retryCount?: number;
}

// ---------------------------------------------------------------------------
// ATTACHMENTS
// ---------------------------------------------------------------------------

export type AttachmentType = 'image' | 'document' | 'voice' | 'video' | 'location' | 'contact';

export type AttachmentUploadState = 'queued' | 'uploading' | 'paused' | 'completed' | 'failed';

export interface BaseAttachment {
  attachmentId: string;
  type: AttachmentType;
  uploadState: AttachmentUploadState;
  uploadProgress?: number;   // 0–100
  url?: string;              // Available once uploaded
  thumbnailUrl?: string;
  mimeType?: string;
  sizeBytes?: number;
  createdAt: string;
}

export interface ImageAttachment extends BaseAttachment {
  type: 'image';
  width?: number;
  height?: number;
  caption?: string;
}

export interface DocumentAttachment extends BaseAttachment {
  type: 'document';
  fileName: string;
  pageCount?: number;
}

export interface VoiceAttachment extends BaseAttachment {
  type: 'voice';
  durationSeconds: number;
  waveformData?: number[];   // Amplitude samples for waveform display
}

export type MessageAttachment = ImageAttachment | DocumentAttachment | VoiceAttachment;

// ---------------------------------------------------------------------------
// MESSAGES
// ---------------------------------------------------------------------------

export type MessageType =
  | 'text'
  | 'image'
  | 'voice'
  | 'document'
  | 'system'
  | 'verification';

export interface ReplyReference {
  messageId: string;
  senderId: string;
  senderName: string;
  previewText: string;       // Truncated preview of the original message
  attachmentType?: AttachmentType;
}

export interface Message {
  messageId: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderAvatarUrl?: string;
  type: MessageType;
  text?: string;
  attachment?: MessageAttachment;
  replyTo?: ReplyReference;
  isEdited?: boolean;
  editedAt?: string;
  isDeleted?: boolean;
  deletedAt?: string;
  delivery: MessageDeliveryReceipt;
  createdAt: string;         // ISO
  // Client-only
  localId?: string;          // Optimistic update ID before server confirms
  isOptimistic?: boolean;
}

// ---------------------------------------------------------------------------
// CONVERSATION
// ---------------------------------------------------------------------------

export interface Conversation {
  conversationId: string;
  state: ConversationState;
  context: ConversationContextSnapshot;
  participants: ConversationParticipant[];
  lastMessage?: Message;
  unreadCount: number;
  isPinned: boolean;
  isMuted: boolean;
  isArchived: boolean;
  isBlocked: boolean;
  mutedUntil?: string;       // ISO — null means forever
  createdAt: string;
  updatedAt: string;
  // Max 5 pinned conversations (enforced in hub + UI)
  pinOrder?: number;
}

// ---------------------------------------------------------------------------
// CONVERSATION REQUESTS
// ---------------------------------------------------------------------------

export interface ConversationRequest {
  requestId: string;
  fromUser: ConversationParticipant;
  context: ConversationContextSnapshot;
  previewMessage: string;
  createdAt: string;
  // Actions available
  canAccept: boolean;
  canDecline: boolean;
  canBlock: boolean;
  canReport: boolean;
}

// ---------------------------------------------------------------------------
// TYPING EVENTS (SignalR-compatible event model)
// ---------------------------------------------------------------------------

export type TypingEventType = 'TypingStarted' | 'TypingUpdated' | 'TypingEnded';

export interface TypingEvent {
  eventType: TypingEventType;
  conversationId: string;
  userId: string;
  userName: string;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// PRESENCE EVENTS
// ---------------------------------------------------------------------------

export type PresenceStatus = 'online' | 'away' | 'offline';

export interface PresenceEvent {
  userId: string;
  status: PresenceStatus;
  lastSeenAt?: string;       // ISO — set when going offline/away
  timestamp: string;
}

// ---------------------------------------------------------------------------
// READ/DELIVERY RECEIPT EVENTS
// ---------------------------------------------------------------------------

export interface ReadReceiptEvent {
  conversationId: string;
  messageId: string;
  readByUserId: string;
  readAt: string;
}

export interface DeliveryReceiptEvent {
  conversationId: string;
  messageId: string;
  deliveredAt: string;
}

// ---------------------------------------------------------------------------
// REALTIME CAPABILITIES — what this deployment actually serves
// ---------------------------------------------------------------------------

/**
 * The hub's answer to "which live features are switched on here".
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 *
 * `RealtimeHub.OnConnectedAsync` sends a `ConnectionAcknowledged` handshake to
 * every connecting client carrying these five booleans. The client had no
 * handler for it, so SignalR logged *"No client method with the name
 * 'connectionacknowledged' found"* and threw the answer away.
 *
 * Meanwhile it registered handlers for TypingChanged, PresenceChanged,
 * ReadReceiptReceived and DeliveryReceiptReceived — precisely the four features
 * these flags gate — and rendered all of them regardless. On a deployment with
 * presence switched off, a member watched a status dot that would never change.
 *
 * §48: never assert a capability the platform has not confirmed.
 */
export interface RealtimeCapabilities {
  /**
   * Whether conversation *groups* can be joined at all — not whether messages
   * are delivered.
   *
   * `RealtimeHub` joins every connection to the member's own user group
   * unconditionally, and `MessageReceived` is sent to both. So a deployment with
   * this false still delivers messages; what it cannot do is scope a
   * subscription to one thread. It is false until a module owns conversations
   * and registers an `IRealtimeGroupAuthorizer`.
   */
  conversationRelay: boolean;
  presence: boolean;
  typing: boolean;
  readReceipts: boolean;
  deliveryReceipts: boolean;
}

/**
 * What is true before the hub has said otherwise.
 *
 * ── Off, deliberately ───────────────────────────────────────────────────────
 *
 * The alternative — assume everything works until told otherwise — is the
 * defect this replaces, just with a shorter window. A client that has not been
 * told what the server serves knows nothing, and rendering an indicator on that
 * basis is a claim it cannot support.
 *
 * The window is milliseconds in practice: the handshake is the first thing the
 * hub sends. If it never arrives the connection is not healthy, and showing no
 * typing indicator is the honest outcome of that rather than a second failure.
 */
export const NO_REALTIME_CAPABILITIES: RealtimeCapabilities = {
  conversationRelay: false,
  presence: false,
  typing: false,
  readReceipts: false,
  deliveryReceipts: false,
};

// ---------------------------------------------------------------------------
// CONNECTION STATE
// ---------------------------------------------------------------------------

export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'reconnecting';

// ---------------------------------------------------------------------------
// INBOX FILTERS
// ---------------------------------------------------------------------------

export type InboxFilter =
  | 'All'
  | 'Unread'
  | 'Requests'
  | 'VerifiedOnly'
  | 'Providers'
  | 'Marketplace'
  | 'Housing'
  | 'Jobs'
  | 'Community'
  | 'Organizations'
  | 'Events'
  | 'Support'
  | 'Archived';

// ---------------------------------------------------------------------------
// MUTE DURATIONS
// ---------------------------------------------------------------------------

export type MuteDuration = '8h' | '24h' | '7d' | 'forever';

// ---------------------------------------------------------------------------
// SEARCH
// ---------------------------------------------------------------------------

export type SearchScope = 'conversations' | 'messages' | 'images' | 'documents' | 'voice' | 'links';

export interface ConversationSearchResult {
  conversationId: string;
  conversationTitle: string;
  contextType: ConversationContextType;
  matchType: SearchScope;
  message?: Message;
  highlightedText?: string;
  matchedAt: string;
}

// ---------------------------------------------------------------------------
// BLOCKED USER
// ---------------------------------------------------------------------------

export interface BlockedUser {
  userId: string;
  displayName: string;
  avatarUrl?: string;
  blockedAt: string;
  reason?: string;
}

// ---------------------------------------------------------------------------
// PAGINATION
// ---------------------------------------------------------------------------

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number;
    hasNextPage: boolean;
    cursor?: string;
  };
}

// ---------------------------------------------------------------------------
// API REQUEST/RESPONSE SHAPES
// ---------------------------------------------------------------------------

export interface SendMessageRequest {
  conversationId: string;
  text?: string;
  attachmentId?: string;
  replyToMessageId?: string;
  localId: string;           // Optimistic update reference
}

export interface CreateConversationRequest {
  recipientId: string;
  context: Omit<ConversationContextSnapshot, 'snapshotAt'>;
  initialMessage?: string;
}

export interface FindOrCreateConversationRequest {
  recipientId: string;
  contextType: ConversationContextType;
  entityId: string;
  contextData: Partial<ConversationContextSnapshot>;
}

// ---------------------------------------------------------------------------
// CONVERSATION HUB PARAMS (used by ConversationHub service)
// ---------------------------------------------------------------------------

export interface OpenConversationParams {
  recipientId: string;
  recipientName: string;
  recipientAvatarUrl?: string;
  contextType: ConversationContextType;
  entityId: string;
  entityTitle: string;
  entitySubtitle?: string;
  entityImageUrl?: string;
  entityPrice?: string;
  entityStatus?: string;
  deepLink?: string;
  campaignSource?: string;
}
