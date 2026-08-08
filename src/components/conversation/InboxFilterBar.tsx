/**
 * InboxFilterBar — Horizontal scrollable filter chips for inbox
 */

import React from 'react';
import { ScrollView, TouchableOpacity, Text, View } from 'react-native';
import type { InboxFilter } from '@/types/conversation';

const FILTERS: { key: InboxFilter; label: string; icon: string }[] = [
  { key: 'All', label: 'All', icon: '💬' },
  { key: 'Unread', label: 'Unread', icon: '🔵' },
  { key: 'Requests', label: 'Requests', icon: '📩' },
  { key: 'VerifiedOnly', label: 'Verified', icon: '✓' },
  { key: 'Providers', label: 'Providers', icon: '🍽️' },
  { key: 'Marketplace', label: 'Marketplace', icon: '🛒' },
  { key: 'Housing', label: 'Housing', icon: '🏠' },
  { key: 'Jobs', label: 'Jobs', icon: '💼' },
  { key: 'Community', label: 'Community', icon: '🎉' },
  { key: 'Organizations', label: 'Orgs', icon: '🏢' },
  { key: 'Support', label: 'Support', icon: '🛡️' },
  { key: 'Archived', label: 'Archived', icon: '📦' },
];

interface Props {
  activeFilter: InboxFilter;
  onFilterChange: (filter: InboxFilter) => void;
  unreadCount?: number;
  requestCount?: number;
}

export function InboxFilterBar({ activeFilter, onFilterChange, unreadCount = 0, requestCount = 0 }: Props) {
  return (
    <View
      style={{
        borderBottomWidth: 1,
        borderBottomColor: '#F3F4F8',
        backgroundColor: '#FFFFFF',
      }}
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingVertical: 10,
          gap: 8,
          alignItems: 'center',
          flexDirection: 'row',
        }}
        style={{ flexGrow: 0 }}
      >
        {FILTERS.map((filter) => {
          const isActive = activeFilter === filter.key;
          const badge =
            filter.key === 'Unread' && unreadCount > 0 ? unreadCount
            : filter.key === 'Requests' && requestCount > 0 ? requestCount
            : 0;

          return (
            <TouchableOpacity
              key={filter.key}
              onPress={() => onFilterChange(filter.key)}
              activeOpacity={0.75}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                borderRadius: 999,
                paddingHorizontal: 14,
                paddingVertical: 7,
                backgroundColor: isActive ? '#F59300' : '#F3F4F8',
                borderWidth: 1,
                borderColor: isActive ? '#F59300' : '#E5E7EF',
              }}
            >
              <Text style={{ fontSize: 12, marginRight: 4, lineHeight: 16 }}>{filter.icon}</Text>
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: '700',
                  color: isActive ? '#FFFFFF' : '#4B5268',
                  lineHeight: 16,
                }}
              >
                {filter.label}
              </Text>
              {badge > 0 && (
                <View
                  style={{
                    backgroundColor: '#EF4444',
                    borderRadius: 999,
                    minWidth: 16,
                    height: 16,
                    alignItems: 'center',
                    justifyContent: 'center',
                    paddingHorizontal: 3,
                    marginLeft: 6,
                  }}
                >
                  <Text style={{ fontSize: 9, fontWeight: '900', color: '#FFFFFF' }}>
                    {badge > 99 ? '99+' : badge}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}
