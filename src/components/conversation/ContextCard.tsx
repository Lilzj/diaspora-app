/**
 * ContextCard — Collapsible conversation context banner
 *
 * Shows: entity image, title, price, status, and Conversation Insights.
 * The "Conversation Insights" panel is Diaspora's unique differentiator —
 * it shows the current live status of the original listing.
 */

import React, { useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import type { ConversationContextSnapshot } from '@/types/conversation';
import { TradeSafetyNote } from '@/components/safety/TradeSafetyNote';

interface Props {
  context: ConversationContextSnapshot;
}

function getStatusColor(status?: string): string {
  switch (status) {
    case 'Available': case 'Active': return '#16A34A';
    case 'Sold': case 'Rented': case 'Filled': return '#DC2626';
    case 'Cancelled': case 'Unavailable': return '#6B7280';
    case 'PriceChanged': return '#D97706';
    default: return '#6B7280';
  }
}

function getStatusLabel(status?: string): string {
  switch (status) {
    case 'Available': case 'Active': return '✓ Available';
    case 'Sold': return '✕ Sold';
    case 'Rented': return '✕ Rented';
    case 'Filled': return '✕ Position Filled';
    case 'Cancelled': return '✕ Cancelled';
    case 'Unavailable': return '✕ Unavailable';
    case 'PriceChanged': return '⚠ Price Changed';
    default: return status || '';
  }
}

function getContextIcon(type: string): string {
  const map: Record<string, string> = {
    MarketplaceListing: '🛒', HousingListing: '🏠', JobOpportunity: '💼',
    ProviderInquiry: '🏪', CommunityEvent: '🎉', Organization: '🏢',
    CommunityGuide: '📖', SupportTicket: '🛡️', PrivateConversation: '💬',
  };
  return map[type] || '💬';
}

export function ContextCard({ context }: Props) {
  const [expanded, setExpanded] = useState(true);

  const hasInsight = context.currentEntityStatus || context.currentEntityStatusNote;
  const isNegativeStatus = ['Sold', 'Rented', 'Filled', 'Cancelled', 'Unavailable'].includes(
    context.currentEntityStatus || ''
  );

  return (
    <View className="mx-4 mb-3 bg-surface-card border border-subtle rounded-2xl overflow-hidden"
      style={{ shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 }}>
      
      {/* Header — always visible */}
      <TouchableOpacity
        onPress={() => setExpanded(!expanded)}
        activeOpacity={0.8}
        className="flex-row items-center p-3"
      >
        {context.entityImageUrl ? (
          <Image
            source={{ uri: context.entityImageUrl }}
            style={{ width: 48, height: 48, borderRadius: 10 }}
            contentFit="cover"
          />
        ) : (
          <View className="w-12 h-12 rounded-xl bg-surface-muted border border-subtle items-center justify-center">
            <Text className="text-2xl">{getContextIcon(context.type)}</Text>
          </View>
        )}

        <View className="flex-1 ml-3">
          <View className="flex-row items-center">
            <Text className="text-[10px] text-content-faint font-bold uppercase tracking-wider mr-1">
              {context.type.replace(/([A-Z])/g, ' $1').trim()}
            </Text>
          </View>
          <Text className="text-sm font-bold text-content-primary" numberOfLines={1}>
            {context.entityTitle}
          </Text>
          {context.entitySubtitle && (
            <Text className="text-[11px] text-content-muted font-semibold" numberOfLines={1}>
              {context.entitySubtitle}
            </Text>
          )}
        </View>

        {context.entityPrice && (
          <View className="ml-2">
            <Text className="text-sm font-black text-warning-default">{context.entityPrice}</Text>
          </View>
        )}

        <Text className="text-content-faint ml-2 text-xs">{expanded ? '▲' : '▼'}</Text>
      </TouchableOpacity>

      {/* Phase 11: dealing over a listing. Shown collapsed too, because the
          moment a member arranges a meet-up or a payment is in this thread. */}
      {(context.type === 'MarketplaceListing' || context.type === 'HousingListing') && (
        <View className="px-3 pb-3">
          <TradeSafetyNote compact />
        </View>
      )}

      {/* Expanded: Conversation Insights */}
      {expanded && (
        <View className="border-t border-faint">
          {/* Live Status */}
          {context.currentEntityStatus && (
            <View className="px-3 py-2.5 flex-row items-center justify-between">
              <Text className="text-[11px] text-content-muted font-semibold">Current Status</Text>
              <View className="flex-row items-center">
                <View className="w-2 h-2 rounded-full mr-1.5"
                  style={{ backgroundColor: getStatusColor(context.currentEntityStatus) }} />
                <Text className="text-[11px] font-bold"
                  style={{ color: getStatusColor(context.currentEntityStatus) }}>
                  {getStatusLabel(context.currentEntityStatus)}
                </Text>
              </View>
            </View>
          )}

          {/* Status note / insight */}
          {context.currentEntityStatusNote && (
            <View className={`mx-3 mb-3 px-3 py-2.5 rounded-xl ${isNegativeStatus ? 'bg-surface-muted border border-subtle' : 'bg-surface-muted border border-subtle'}`}>
              <Text className={`text-[11px] font-semibold ${isNegativeStatus ? 'text-error-default' : 'text-warning-default'}`}>
                💡 {context.currentEntityStatusNote}
              </Text>
            </View>
          )}

          {/* Deep link */}
          {context.deepLink && (
            <TouchableOpacity
              onPress={() => router.push(context.deepLink as any)}
              className="mx-3 mb-3 flex-row items-center"
            >
              <Text className="text-[11px] font-bold text-success-default">View Original Listing →</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}
