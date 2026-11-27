/**
 * ConversationEmptyState — Context-aware empty states
 */

import React from 'react';
import type { InboxFilter } from '@/types/conversation';
import { ListEmpty, type ListMessage } from '@/components/ListState';

const STATES: Record<string, { icon: ListMessage['icon']; title: string; description: string }> = {
  All: {
    icon: 'chatbubbles-outline',
    title: 'No conversations yet',
    description: 'Message providers, sellers, landlords, and employers directly from their listings.',
  },
  Unread: {
    icon: 'checkmark-done-outline',
    title: 'All caught up!',
    description: 'You have no unread messages. Enjoy the peace.',
  },
  Requests: {
    icon: 'mail-unread-outline',
    title: 'No pending requests',
    description: 'Message requests from unknown users will appear here for your review.',
  },
  VerifiedOnly: {
    icon: 'shield-checkmark-outline',
    title: 'No verified conversations',
    description: 'Conversations with Diaspora Verified members will show here.',
  },
  Providers: {
    icon: 'storefront-outline',
    title: 'No provider conversations',
    description: 'Find a service provider and tap "Message" to start a conversation.',
  },
  Marketplace: {
    icon: 'cart-outline',
    title: 'No marketplace conversations',
    description: 'Browse the marketplace and message sellers directly from listings.',
  },
  Housing: {
    icon: 'home-outline',
    title: 'No housing conversations',
    description: 'Find housing listings and contact landlords directly through Diaspora.',
  },
  Jobs: {
    icon: 'briefcase-outline',
    title: 'No job conversations',
    description: 'Apply for jobs and message employers directly from job postings.',
  },
  Community: {
    icon: 'people-outline',
    title: 'No community conversations',
    description: 'Connect with event organizers and community leaders.',
  },
  Support: {
    icon: 'help-buoy-outline',
    title: 'No support tickets',
    description: 'Need help? Contact Diaspora Support from the Help Center.',
  },
  Archived: {
    icon: 'archive-outline',
    title: 'No archived conversations',
    description: 'Conversations you archive will be stored here.',
  },
};

interface Props {
  filter: InboxFilter;
  onExplore?: () => void;
}

export function ConversationEmptyState({ filter, onExplore }: Props) {
  const state = STATES[filter] || STATES['All'];
  // Drawn by the shared list state since 27 Nov 2026 (FARCH-007).
  return (
    <ListEmpty
      icon={state.icon}
      title={state.title}
      message={state.description}
      action={filter === 'All' && onExplore ? { label: 'Explore Diaspora →', onPress: onExplore } : undefined}
    />
  );
}
