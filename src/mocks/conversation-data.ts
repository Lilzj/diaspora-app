/**
 * Diaspora Conversations — Mock Seed Data
 *
 * Rich realistic conversations across all context types.
 * Covers all message types, states, and trust profiles.
 */

import type {
  Conversation,
  Message,
  ConversationRequest,
  BlockedUser,
  ConversationParticipant,
  ConversationTrustProfile,
  ConversationContextSnapshot,
} from '@/types/conversation';

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}
function hoursAgo(n: number): string {
  const d = new Date();
  d.setHours(d.getHours() - n);
  return d.toISOString();
}
function minutesAgo(n: number): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - n);
  return d.toISOString();
}

// ---------------------------------------------------------------------------
// TRUST PROFILES
// ---------------------------------------------------------------------------

const highTrust: ConversationTrustProfile = {
  isVerified: true,
  verificationLabel: 'Diaspora Verified',
  rating: 4.8,
  reviewCount: 47,
  responseTime: '< 5 mins',
  responseRate: 98,
  memberSince: '2023',
  reputationLevel: 'VerifiedResident',
  totalHelpfulVotes: 123,
  countryVerifications: [
    { countryCode: 'GB', countryName: 'United Kingdom', flag: '🇬🇧', isVerified: true },
    { countryCode: 'NG', countryName: 'Nigeria', flag: '🇳🇬', isVerified: true },
  ],
};

const mediumTrust: ConversationTrustProfile = {
  isVerified: true,
  verificationLabel: 'Community Verified',
  rating: 4.3,
  reviewCount: 18,
  responseTime: '~2 hrs',
  responseRate: 85,
  memberSince: '2024',
  reputationLevel: 'ActiveContributor',
  countryVerifications: [
    { countryCode: 'MU', countryName: 'Mauritius', flag: '🇲🇺', isVerified: true },
  ],
};

const newUserTrust: ConversationTrustProfile = {
  isVerified: false,
  rating: 0,
  reviewCount: 0,
  responseTime: 'Unknown',
  responseRate: 0,
  memberSince: '2026',
  reputationLevel: 'NewMember',
};

// ---------------------------------------------------------------------------
// PARTICIPANTS
// ---------------------------------------------------------------------------

export const currentUser: ConversationParticipant = {
  userId: 'user-current',
  displayName: 'Joshua M.',
  avatarUrl: undefined,
  trust: highTrust,
  isCurrentUser: true,
};

const amara: ConversationParticipant = {
  userId: 'user-amara',
  displayName: 'Amara Kone',
  avatarUrl: 'https://i.pravatar.cc/150?img=47',
  trust: highTrust,
  isCurrentUser: false,
};

const sarah: ConversationParticipant = {
  userId: 'user-sarah',
  displayName: 'Sarah O.',
  avatarUrl: 'https://i.pravatar.cc/150?img=44',
  trust: mediumTrust,
  isCurrentUser: false,
};

const jean: ConversationParticipant = {
  userId: 'user-jean',
  displayName: 'Jean-Pierre L.',
  avatarUrl: 'https://i.pravatar.cc/150?img=12',
  trust: mediumTrust,
  isCurrentUser: false,
};

const fatou: ConversationParticipant = {
  userId: 'user-fatou',
  displayName: 'Fatou D.',
  avatarUrl: 'https://i.pravatar.cc/150?img=32',
  trust: highTrust,
  isCurrentUser: false,
};

const malik: ConversationParticipant = {
  userId: 'user-malik',
  displayName: 'Malik A.',
  avatarUrl: 'https://i.pravatar.cc/150?img=57',
  trust: newUserTrust,
  isCurrentUser: false,
};

const chinwe: ConversationParticipant = {
  userId: 'user-chinwe',
  displayName: 'Chinwe E.',
  avatarUrl: 'https://i.pravatar.cc/150?img=25',
  trust: highTrust,
  isCurrentUser: false,
};

const support: ConversationParticipant = {
  userId: 'user-diaspora-support',
  displayName: 'Diaspora Support',
  avatarUrl: undefined,
  trust: {
    isVerified: true,
    verificationLabel: 'Official Support',
    responseTime: '< 1 hr',
    responseRate: 100,
    memberSince: '2020',
    reputationLevel: 'DiasporaOfficial',
  },
  isCurrentUser: false,
};

// ---------------------------------------------------------------------------
// CONTEXT SNAPSHOTS
// ---------------------------------------------------------------------------

const marketplaceCtx: ConversationContextSnapshot = {
  type: 'MarketplaceListing',
  entityId: 'market-001',
  entityTitle: 'Toyota Corolla 2019',
  entitySubtitle: 'Seller: Amara Kone · Peckham, London',
  entityImageUrl: 'https://images.unsplash.com/photo-1621007947382-bb3c3994e3fb?w=400',
  entityPrice: '£4,500',
  entityStatus: 'Active',
  currentEntityStatus: 'Available',
  currentEntityStatusNote: 'Still available · Price negotiable',
  snapshotAt: daysAgo(8),
  deepLink: '/marketplace/market-001',
  campaignSource: 'listing_detail',
  appVersion: '1.0.0',
};

const housingCtx: ConversationContextSnapshot = {
  type: 'HousingListing',
  entityId: 'housing-001',
  entityTitle: '2 Bedroom Apartment, Quatre Bornes',
  entitySubtitle: 'Owner: Sarah O. · Rs 18,000/month',
  entityImageUrl: 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=400',
  entityPrice: 'Rs 18,000 / month',
  entityStatus: 'Active',
  currentEntityStatus: 'Available',
  currentEntityStatusNote: 'Available from August 1st',
  snapshotAt: daysAgo(3),
  deepLink: '/housing/housing-001',
  campaignSource: 'listing_detail',
  appVersion: '1.0.0',
};

const jobCtx: ConversationContextSnapshot = {
  type: 'JobOpportunity',
  entityId: 'job-001',
  entityTitle: 'Senior Accountant',
  entitySubtitle: 'ABC Ltd · Port Louis, Mauritius',
  entityImageUrl: 'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=400',
  entityPrice: 'Rs 45,000 / month',
  entityStatus: 'Active',
  currentEntityStatus: 'Filled',
  currentEntityStatusNote: 'Position has been filled',
  snapshotAt: daysAgo(14),
  deepLink: '/job/job-001',
  campaignSource: 'job_listing',
  appVersion: '1.0.0',
};

const providerCtx: ConversationContextSnapshot = {
  type: 'ProviderInquiry',
  entityId: 'provider-001',
  entityTitle: 'Mama Afrika Kitchen',
  entitySubtitle: 'African & Caribbean Cuisine · Brixton, London',
  entityImageUrl: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=400',
  entityStatus: 'Active',
  currentEntityStatus: 'Available',
  snapshotAt: daysAgo(1),
  deepLink: '/provider/provider-001',
  campaignSource: 'provider_profile',
  appVersion: '1.0.0',
};

const eventCtx: ConversationContextSnapshot = {
  type: 'CommunityEvent',
  entityId: 'event-001',
  entityTitle: 'African Diaspora Networking Night',
  entitySubtitle: 'Fatou D. · East London · Sat 26 July 2026',
  entityImageUrl: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=400',
  entityStatus: 'Active',
  currentEntityStatus: 'Available',
  currentEntityStatusNote: '12 spots remaining',
  snapshotAt: daysAgo(2),
  deepLink: '/community-life/event-001',
  campaignSource: 'event_detail',
  appVersion: '1.0.0',
};

const supportCtx: ConversationContextSnapshot = {
  type: 'SupportTicket',
  entityId: 'ticket-001',
  entityTitle: 'Support: Account Verification Issue',
  entitySubtitle: 'Ticket #T-00452',
  snapshotAt: daysAgo(5),
  deepLink: '/settings/support',
  campaignSource: 'support_center',
  appVersion: '1.0.0',
};

const privateCtx: ConversationContextSnapshot = {
  type: 'PrivateConversation',
  entityId: 'private-001',
  entityTitle: 'Direct Message',
  snapshotAt: daysAgo(30),
  campaignSource: 'profile',
  appVersion: '1.0.0',
};

// ---------------------------------------------------------------------------
// MOCK MESSAGES (per conversation)
// ---------------------------------------------------------------------------

export const mockMessages: Record<string, Message[]> = {
  'conv-001': [
    {
      messageId: 'msg-001-1',
      conversationId: 'conv-001',
      senderId: 'user-current',
      senderName: 'Joshua M.',
      type: 'system',
      text: 'Conversation started from Toyota Corolla 2019 listing',
      delivery: { status: 'read', sentAt: daysAgo(8), deliveredAt: daysAgo(8), readAt: daysAgo(8) },
      createdAt: daysAgo(8),
    },
    {
      messageId: 'msg-001-2',
      conversationId: 'conv-001',
      senderId: 'user-current',
      senderName: 'Joshua M.',
      type: 'text',
      text: 'Hi Amara, I am interested in your Toyota Corolla. Is it still available?',
      delivery: { status: 'read', sentAt: daysAgo(8), deliveredAt: daysAgo(8), readAt: daysAgo(7) },
      createdAt: daysAgo(8),
    },
    {
      messageId: 'msg-001-3',
      conversationId: 'conv-001',
      senderId: 'user-amara',
      senderName: 'Amara Kone',
      senderAvatarUrl: 'https://i.pravatar.cc/150?img=47',
      type: 'text',
      text: 'Yes, still available! The car is in excellent condition, just had a service last month. When would you like to view it?',
      delivery: { status: 'read', sentAt: daysAgo(7), deliveredAt: daysAgo(7), readAt: daysAgo(7) },
      createdAt: daysAgo(7),
    },
    {
      messageId: 'msg-001-4',
      conversationId: 'conv-001',
      senderId: 'user-current',
      senderName: 'Joshua M.',
      type: 'text',
      text: 'Great! Would this Saturday work for you? I\'m flexible on timing.',
      delivery: { status: 'read', sentAt: daysAgo(7), deliveredAt: daysAgo(7), readAt: daysAgo(6) },
      createdAt: daysAgo(7),
    },
    {
      messageId: 'msg-001-5',
      conversationId: 'conv-001',
      senderId: 'user-amara',
      senderName: 'Amara Kone',
      senderAvatarUrl: 'https://i.pravatar.cc/150?img=47',
      type: 'text',
      text: 'Saturday works! Let\'s say 11am in Peckham. I\'ll send you the exact location closer to the time.',
      delivery: { status: 'read', sentAt: daysAgo(6), deliveredAt: daysAgo(6), readAt: daysAgo(6) },
      createdAt: daysAgo(6),
    },
    {
      messageId: 'msg-001-6',
      conversationId: 'conv-001',
      senderId: 'user-amara',
      senderName: 'Amara Kone',
      senderAvatarUrl: 'https://i.pravatar.cc/150?img=47',
      type: 'image',
      text: 'Here are some photos from the last service',
      attachment: {
        attachmentId: 'att-001-1',
        type: 'image',
        uploadState: 'completed',
        url: 'https://images.unsplash.com/photo-1621007947382-bb3c3994e3fb?w=800',
        thumbnailUrl: 'https://images.unsplash.com/photo-1621007947382-bb3c3994e3fb?w=200',
        mimeType: 'image/jpeg',
        sizeBytes: 245760,
        createdAt: daysAgo(6),
        width: 800,
        height: 600,
        caption: 'Car after service',
      },
      delivery: { status: 'read', sentAt: daysAgo(6), deliveredAt: daysAgo(6), readAt: daysAgo(5) },
      createdAt: daysAgo(6),
    },
    {
      messageId: 'msg-001-7',
      conversationId: 'conv-001',
      senderId: 'user-current',
      senderName: 'Joshua M.',
      type: 'text',
      text: 'Looks great! Is there any flexibility on the price? I was thinking £4,200.',
      delivery: { status: 'read', sentAt: daysAgo(5), deliveredAt: daysAgo(5), readAt: daysAgo(4) },
      createdAt: daysAgo(5),
    },
    {
      messageId: 'msg-001-8',
      conversationId: 'conv-001',
      senderId: 'user-amara',
      senderName: 'Amara Kone',
      senderAvatarUrl: 'https://i.pravatar.cc/150?img=47',
      type: 'text',
      text: 'I could do £4,350 but that\'s my final offer. The car has low mileage and all service history.',
      replyTo: {
        messageId: 'msg-001-7',
        senderId: 'user-current',
        senderName: 'Joshua M.',
        previewText: 'Is there any flexibility on the price? I was thinking £4,200.',
      },
      delivery: { status: 'read', sentAt: daysAgo(4), deliveredAt: daysAgo(4), readAt: daysAgo(3) },
      createdAt: daysAgo(4),
    },
    {
      messageId: 'msg-001-9',
      conversationId: 'conv-001',
      senderId: 'user-current',
      senderName: 'Joshua M.',
      type: 'voice',
      attachment: {
        attachmentId: 'att-001-2',
        type: 'voice',
        uploadState: 'completed',
        url: 'mock://voice-001-9.m4a',
        mimeType: 'audio/m4a',
        sizeBytes: 89600,
        createdAt: daysAgo(3),
        durationSeconds: 28,
        waveformData: [0.3, 0.5, 0.7, 0.9, 0.6, 0.4, 0.8, 0.5, 0.3, 0.6, 0.7, 0.9, 0.5, 0.4, 0.2, 0.6, 0.8, 0.7, 0.5, 0.3],
      },
      delivery: { status: 'read', sentAt: daysAgo(3), deliveredAt: daysAgo(3), readAt: daysAgo(2) },
      createdAt: daysAgo(3),
    },
    {
      messageId: 'msg-001-10',
      conversationId: 'conv-001',
      senderId: 'user-amara',
      senderName: 'Amara Kone',
      senderAvatarUrl: 'https://i.pravatar.cc/150?img=47',
      type: 'text',
      text: 'Deal! I\'ll see you Saturday at 11am. I\'ll send the exact address tomorrow.',
      delivery: { status: 'read', sentAt: minutesAgo(35), deliveredAt: minutesAgo(35), readAt: minutesAgo(20) },
      createdAt: minutesAgo(35),
    },
  ],

  'conv-002': [
    {
      messageId: 'msg-002-1',
      conversationId: 'conv-002',
      senderId: 'user-current',
      senderName: 'Joshua M.',
      type: 'system',
      text: 'Conversation started from 2 Bedroom Apartment listing',
      delivery: { status: 'read', sentAt: daysAgo(3), deliveredAt: daysAgo(3), readAt: daysAgo(3) },
      createdAt: daysAgo(3),
    },
    {
      messageId: 'msg-002-2',
      conversationId: 'conv-002',
      senderId: 'user-current',
      senderName: 'Joshua M.',
      type: 'text',
      text: 'Hello Sarah, I\'m very interested in the 2 bedroom apartment. Is it still available?',
      delivery: { status: 'read', sentAt: daysAgo(3), deliveredAt: daysAgo(3), readAt: daysAgo(2) },
      createdAt: daysAgo(3),
    },
    {
      messageId: 'msg-002-3',
      conversationId: 'conv-002',
      senderId: 'user-sarah',
      senderName: 'Sarah O.',
      senderAvatarUrl: 'https://i.pravatar.cc/150?img=44',
      type: 'text',
      text: 'Yes! It\'s available from August 1st. Would you like to schedule a viewing?',
      delivery: { status: 'read', sentAt: daysAgo(2), deliveredAt: daysAgo(2), readAt: daysAgo(2) },
      createdAt: daysAgo(2),
    },
    {
      messageId: 'msg-002-4',
      conversationId: 'conv-002',
      senderId: 'user-sarah',
      senderName: 'Sarah O.',
      senderAvatarUrl: 'https://i.pravatar.cc/150?img=44',
      type: 'document',
      text: 'Here is the tenancy agreement template',
      attachment: {
        attachmentId: 'att-002-1',
        type: 'document',
        uploadState: 'completed',
        url: 'mock://tenancy-agreement.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1548288,
        fileName: 'Tenancy_Agreement_Template.pdf',
        createdAt: daysAgo(1),
        pageCount: 12,
      },
      delivery: { status: 'read', sentAt: daysAgo(1), deliveredAt: daysAgo(1), readAt: hoursAgo(5) },
      createdAt: daysAgo(1),
    },
    {
      messageId: 'msg-002-5',
      conversationId: 'conv-002',
      senderId: 'user-current',
      senderName: 'Joshua M.',
      type: 'text',
      text: 'Thank you! I\'ve reviewed it. Can we discuss the deposit terms?',
      isEdited: true,
      editedAt: hoursAgo(2),
      delivery: { status: 'delivered', sentAt: hoursAgo(3), deliveredAt: hoursAgo(3) },
      createdAt: hoursAgo(3),
    },
  ],

  'conv-003': [
    {
      messageId: 'msg-003-1',
      conversationId: 'conv-003',
      senderId: 'user-current',
      senderName: 'Joshua M.',
      type: 'system',
      text: 'Conversation started from Senior Accountant job posting',
      delivery: { status: 'read', sentAt: daysAgo(14), deliveredAt: daysAgo(14), readAt: daysAgo(14) },
      createdAt: daysAgo(14),
    },
    {
      messageId: 'msg-003-2',
      conversationId: 'conv-003',
      senderId: 'user-current',
      senderName: 'Joshua M.',
      type: 'text',
      text: 'Dear Jean-Pierre, I would like to express my interest in the Senior Accountant position. I have 8 years of experience in financial management.',
      delivery: { status: 'read', sentAt: daysAgo(14), deliveredAt: daysAgo(14), readAt: daysAgo(13) },
      createdAt: daysAgo(14),
    },
    {
      messageId: 'msg-003-3',
      conversationId: 'conv-003',
      senderId: 'user-jean',
      senderName: 'Jean-Pierre L.',
      senderAvatarUrl: 'https://i.pravatar.cc/150?img=12',
      type: 'text',
      text: 'Thank you for your interest. The position has unfortunately been filled. We will keep your profile on file for future openings.',
      delivery: { status: 'read', sentAt: daysAgo(10), deliveredAt: daysAgo(10), readAt: daysAgo(9) },
      createdAt: daysAgo(10),
    },
    {
      messageId: 'msg-003-4',
      conversationId: 'conv-003',
      senderId: 'user-current',
      senderName: 'Joshua M.',
      type: 'text',
      text: 'Thank you for letting me know. Please do keep me in mind for future positions.',
      delivery: { status: 'read', sentAt: daysAgo(9), deliveredAt: daysAgo(9), readAt: daysAgo(8) },
      createdAt: daysAgo(9),
    },
  ],

  'conv-004': [
    {
      messageId: 'msg-004-1',
      conversationId: 'conv-004',
      senderId: 'user-current',
      senderName: 'Joshua M.',
      type: 'text',
      text: 'Hi Fatou! I saw your event on Diaspora. How do I register?',
      delivery: { status: 'read', sentAt: daysAgo(2), deliveredAt: daysAgo(2), readAt: daysAgo(1) },
      createdAt: daysAgo(2),
    },
    {
      messageId: 'msg-004-2',
      conversationId: 'conv-004',
      senderId: 'user-fatou',
      senderName: 'Fatou D.',
      senderAvatarUrl: 'https://i.pravatar.cc/150?img=32',
      type: 'text',
      text: 'Hi Joshua! Glad you\'re interested 🎉 Just tap "Join" on the event page. It\'s free but spots are limited — only 12 left!',
      delivery: { status: 'read', sentAt: daysAgo(1), deliveredAt: daysAgo(1), readAt: hoursAgo(10) },
      createdAt: daysAgo(1),
    },
    {
      messageId: 'msg-004-3',
      conversationId: 'conv-004',
      senderId: 'user-fatou',
      senderName: 'Fatou D.',
      senderAvatarUrl: 'https://i.pravatar.cc/150?img=32',
      type: 'image',
      text: 'Here\'s the flyer with all the details!',
      attachment: {
        attachmentId: 'att-004-1',
        type: 'image',
        uploadState: 'completed',
        url: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800',
        thumbnailUrl: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=200',
        mimeType: 'image/jpeg',
        sizeBytes: 312000,
        createdAt: daysAgo(1),
        caption: 'African Diaspora Networking Night Flyer',
      },
      delivery: { status: 'delivered', sentAt: hoursAgo(8), deliveredAt: hoursAgo(8) },
      createdAt: hoursAgo(8),
    },
  ],

  'conv-005': [
    {
      messageId: 'msg-005-1',
      conversationId: 'conv-005',
      senderId: 'user-diaspora-support',
      senderName: 'Diaspora Support',
      type: 'system',
      text: 'Support ticket #T-00452 opened',
      delivery: { status: 'read', sentAt: daysAgo(5), deliveredAt: daysAgo(5), readAt: daysAgo(5) },
      createdAt: daysAgo(5),
    },
    {
      messageId: 'msg-005-2',
      conversationId: 'conv-005',
      senderId: 'user-current',
      senderName: 'Joshua M.',
      type: 'text',
      text: 'Hello, I am having issues with my verification. I submitted my documents 2 weeks ago and haven\'t heard back.',
      delivery: { status: 'read', sentAt: daysAgo(5), deliveredAt: daysAgo(5), readAt: daysAgo(4) },
      createdAt: daysAgo(5),
    },
    {
      messageId: 'msg-005-3',
      conversationId: 'conv-005',
      senderId: 'user-diaspora-support',
      senderName: 'Diaspora Support',
      type: 'text',
      text: 'Hello Joshua, thank you for reaching out. I can see your verification request is currently under review. Our team is experiencing slightly higher than usual volumes. You should receive a response within 48 hours.',
      delivery: { status: 'read', sentAt: daysAgo(4), deliveredAt: daysAgo(4), readAt: daysAgo(3) },
      createdAt: daysAgo(4),
    },
    {
      messageId: 'msg-005-4',
      conversationId: 'conv-005',
      senderId: 'user-diaspora-support',
      senderName: 'Diaspora Support',
      type: 'verification',
      text: 'Your Diaspora verification has been approved! ✅ Your Verified badge is now active.',
      delivery: { status: 'read', sentAt: daysAgo(2), deliveredAt: daysAgo(2), readAt: daysAgo(1) },
      createdAt: daysAgo(2),
    },
  ],

  'conv-006': [
    {
      messageId: 'msg-006-1',
      conversationId: 'conv-006',
      senderId: 'user-chinwe',
      senderName: 'Chinwe E.',
      senderAvatarUrl: 'https://i.pravatar.cc/150?img=25',
      type: 'text',
      text: 'Hey! I saw you\'re also connected to the Brixton community. Would love to connect!',
      delivery: { status: 'read', sentAt: daysAgo(30), deliveredAt: daysAgo(30), readAt: daysAgo(29) },
      createdAt: daysAgo(30),
    },
    {
      messageId: 'msg-006-2',
      conversationId: 'conv-006',
      senderId: 'user-current',
      senderName: 'Joshua M.',
      type: 'text',
      text: 'Hi Chinwe! Yes, I\'ve been in Brixton for 3 years. Great to meet you!',
      delivery: { status: 'read', sentAt: daysAgo(30), deliveredAt: daysAgo(30), readAt: daysAgo(29) },
      createdAt: daysAgo(30),
    },
    {
      messageId: 'msg-006-3',
      conversationId: 'conv-006',
      senderId: 'user-chinwe',
      senderName: 'Chinwe E.',
      senderAvatarUrl: 'https://i.pravatar.cc/150?img=25',
      type: 'text',
      text: 'Do you know any good Afrobeats events coming up? I\'m looking for something this weekend.',
      delivery: { status: 'read', sentAt: daysAgo(25), deliveredAt: daysAgo(25), readAt: daysAgo(24) },
      createdAt: daysAgo(25),
    },
  ],

  'conv-007': [
    {
      messageId: 'msg-007-1',
      conversationId: 'conv-007',
      senderId: 'user-current',
      senderName: 'Joshua M.',
      type: 'text',
      text: 'Hi! I\'d like to book a table for 4 people this Friday evening.',
      delivery: { status: 'read', sentAt: hoursAgo(2), deliveredAt: hoursAgo(2), readAt: hoursAgo(1) },
      createdAt: hoursAgo(2),
    },
    {
      messageId: 'msg-007-2',
      conversationId: 'conv-007',
      senderId: 'user-amara',
      senderName: 'Amara Kone',
      senderAvatarUrl: 'https://i.pravatar.cc/150?img=47',
      type: 'text',
      text: 'Welcome to Mama Afrika Kitchen! 🌍 We have availability at 7pm or 8:30pm on Friday. Which time works better for you?',
      delivery: { status: 'delivered', sentAt: minutesAgo(45), deliveredAt: minutesAgo(45) },
      createdAt: minutesAgo(45),
    },
  ],
};

// ---------------------------------------------------------------------------
// CONVERSATIONS
// ---------------------------------------------------------------------------

export const mockConversations: Conversation[] = [
  {
    conversationId: 'conv-001',
    state: 'Active',
    context: marketplaceCtx,
    participants: [currentUser, amara],
    lastMessage: mockMessages['conv-001'][mockMessages['conv-001'].length - 1],
    unreadCount: 1,
    isPinned: true,
    isMuted: false,
    isArchived: false,
    isBlocked: false,
    createdAt: daysAgo(8),
    updatedAt: minutesAgo(35),
    pinOrder: 1,
  },
  {
    conversationId: 'conv-002',
    state: 'Active',
    context: housingCtx,
    participants: [currentUser, sarah],
    lastMessage: mockMessages['conv-002'][mockMessages['conv-002'].length - 1],
    unreadCount: 0,
    isPinned: false,
    isMuted: false,
    isArchived: false,
    isBlocked: false,
    createdAt: daysAgo(3),
    updatedAt: hoursAgo(3),
  },
  {
    conversationId: 'conv-003',
    state: 'Active',
    context: jobCtx,
    participants: [currentUser, jean],
    lastMessage: mockMessages['conv-003'][mockMessages['conv-003'].length - 1],
    unreadCount: 0,
    isPinned: false,
    isMuted: false,
    isArchived: false,
    isBlocked: false,
    createdAt: daysAgo(14),
    updatedAt: daysAgo(9),
  },
  {
    conversationId: 'conv-004',
    state: 'Active',
    context: eventCtx,
    participants: [currentUser, fatou],
    lastMessage: mockMessages['conv-004'][mockMessages['conv-004'].length - 1],
    unreadCount: 2,
    isPinned: false,
    isMuted: false,
    isArchived: false,
    isBlocked: false,
    createdAt: daysAgo(2),
    updatedAt: hoursAgo(8),
  },
  {
    conversationId: 'conv-005',
    state: 'Active',
    context: supportCtx,
    participants: [currentUser, support],
    lastMessage: mockMessages['conv-005'][mockMessages['conv-005'].length - 1],
    unreadCount: 0,
    isPinned: true,
    isMuted: false,
    isArchived: false,
    isBlocked: false,
    createdAt: daysAgo(5),
    updatedAt: daysAgo(2),
    pinOrder: 2,
  },
  {
    conversationId: 'conv-006',
    state: 'Active',
    context: privateCtx,
    participants: [currentUser, chinwe],
    lastMessage: mockMessages['conv-006'][mockMessages['conv-006'].length - 1],
    unreadCount: 0,
    isPinned: false,
    isMuted: true,
    isArchived: false,
    isBlocked: false,
    mutedUntil: undefined,
    createdAt: daysAgo(30),
    updatedAt: daysAgo(25),
  },
  {
    conversationId: 'conv-007',
    state: 'Active',
    context: providerCtx,
    participants: [currentUser, amara],
    lastMessage: mockMessages['conv-007'][mockMessages['conv-007'].length - 1],
    unreadCount: 1,
    isPinned: false,
    isMuted: false,
    isArchived: false,
    isBlocked: false,
    createdAt: hoursAgo(2),
    updatedAt: minutesAgo(45),
  },
];

// ---------------------------------------------------------------------------
// CONVERSATION REQUESTS (pending from unknown users)
// ---------------------------------------------------------------------------

export const mockConversationRequests: ConversationRequest[] = [
  {
    requestId: 'req-001',
    fromUser: malik,
    context: {
      type: 'MarketplaceListing',
      entityId: 'my-listing-001',
      entityTitle: 'MacBook Pro 2022',
      entitySubtitle: 'Your Listing',
      entityPrice: '£1,200',
      entityStatus: 'Active',
      snapshotAt: hoursAgo(3),
      campaignSource: 'listing_detail',
      appVersion: '1.0.0',
    },
    previewMessage: 'Hello, is the MacBook still available? I can pay cash.',
    createdAt: hoursAgo(3),
    canAccept: true,
    canDecline: true,
    canBlock: true,
    canReport: true,
  },
  {
    requestId: 'req-002',
    fromUser: {
      userId: 'user-kemi',
      displayName: 'Kemi A.',
      avatarUrl: 'https://i.pravatar.cc/150?img=35',
      trust: newUserTrust,
      isCurrentUser: false,
    },
    context: {
      type: 'PrivateConversation',
      entityId: 'private-req-002',
      entityTitle: 'Connection Request',
      snapshotAt: daysAgo(1),
      campaignSource: 'profile',
      appVersion: '1.0.0',
    },
    previewMessage: 'Hi! I found your profile through the community directory. Would love to connect!',
    createdAt: daysAgo(1),
    canAccept: true,
    canDecline: true,
    canBlock: true,
    canReport: true,
  },
];

// ---------------------------------------------------------------------------
// BLOCKED USERS
// ---------------------------------------------------------------------------

export const mockBlockedUsers: BlockedUser[] = [
  {
    userId: 'user-blocked-1',
    displayName: 'Blocked User',
    blockedAt: daysAgo(20),
    reason: 'Spam messages',
  },
];

// ---------------------------------------------------------------------------
// EXPORTS for mock handlers
// ---------------------------------------------------------------------------

export { amara, sarah, jean, fatou, malik, chinwe, support, currentUser as mockCurrentUser };
