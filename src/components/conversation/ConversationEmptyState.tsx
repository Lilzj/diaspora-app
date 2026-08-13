/**
 * ConversationEmptyState — Context-aware empty states
 */

import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import type { InboxFilter } from '@/types/conversation';

const STATES: Record<string, { icon: string; title: string; description: string }> = {
  All: {
    icon: '💬',
    title: 'No conversations yet',
    description: 'Message providers, sellers, landlords, and employers directly from their listings.',
  },
  Unread: {
    icon: '✅',
    title: 'All caught up!',
    description: 'You have no unread messages. Enjoy the peace.',
  },
  Requests: {
    icon: '📩',
    title: 'No pending requests',
    description: 'Message requests from unknown users will appear here for your review.',
  },
  VerifiedOnly: {
    icon: '✓',
    title: 'No verified conversations',
    description: 'Conversations with Diaspora Verified members will show here.',
  },
  Providers: {
    icon: '🍽️',
    title: 'No provider conversations',
    description: 'Find a service provider and tap "Message" to start a conversation.',
  },
  Marketplace: {
    icon: '🛒',
    title: 'No marketplace conversations',
    description: 'Browse the marketplace and message sellers directly from listings.',
  },
  Housing: {
    icon: '🏠',
    title: 'No housing conversations',
    description: 'Find housing listings and contact landlords directly through Diaspora.',
  },
  Jobs: {
    icon: '💼',
    title: 'No job conversations',
    description: 'Apply for jobs and message employers directly from job postings.',
  },
  Community: {
    icon: '🎉',
    title: 'No community conversations',
    description: 'Connect with event organizers and community leaders.',
  },
  Support: {
    icon: '🛡️',
    title: 'No support tickets',
    description: 'Need help? Contact Diaspora Support from the Help Center.',
  },
  Archived: {
    icon: '📦',
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

  return (
    <View className="flex-1 items-center justify-center px-8 py-20">
      <Text className="text-6xl mb-6">{state.icon}</Text>
      <Text className="text-xl font-black text-content-primary text-center mb-3">{state.title}</Text>
      <Text className="text-sm text-content-muted text-center leading-relaxed mb-8">{state.description}</Text>
      {filter === 'All' && onExplore && (
        <TouchableOpacity
          onPress={onExplore}
          activeOpacity={0.85}
          className="bg-amber-500 px-6 py-3.5 rounded-2xl"
        >
          <Text className="text-white font-black text-sm">Explore Diaspora →</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
