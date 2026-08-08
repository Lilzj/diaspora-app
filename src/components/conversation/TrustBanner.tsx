/**
 * TrustBanner — Full trust profile banner for conversation header
 *
 * Displays: Verification status, rating, response time, reply rate, member since.
 * This is one of Diaspora's competitive advantages.
 */

import React from 'react';
import { View, Text } from 'react-native';
import type { ConversationTrustProfile } from '@/types/conversation';

interface Props {
  trust: ConversationTrustProfile;
  displayName: string;
}

function StarRating({ rating }: { rating: number }) {
  return (
    <Text className="text-amber-500" style={{ fontSize: 12 }}>
      {Array.from({ length: 5 }, (_, i) =>
        i < Math.floor(rating) ? '★' : i < rating ? '⭐' : '☆'
      ).join('')}
    </Text>
  );
}

export function TrustBanner({ trust, displayName }: Props) {
  return (
    <View className="mx-4 mb-3 bg-teal-50 border border-teal-200 rounded-2xl p-4">
      {/* Header Row */}
      <View className="flex-row items-center mb-3">
        {trust.isVerified && (
          <View className="bg-teal-600 rounded-full px-2.5 py-1 mr-2 flex-row items-center">
            <Text className="text-white font-black text-[10px]">✓ {trust.verificationLabel || 'Diaspora Verified'}</Text>
          </View>
        )}
        {trust.reputationLevel && (
          <Text className="text-xs text-teal-700 font-semibold">{trust.reputationLevel}</Text>
        )}
      </View>

      {/* Stats Grid */}
      <View className="flex-row flex-wrap gap-3">
        {trust.rating !== undefined && trust.rating > 0 && (
          <View className="items-center">
            <StarRating rating={trust.rating} />
            <Text className="text-[10px] text-neutral-500 font-semibold mt-0.5">
              {trust.rating.toFixed(1)} ({trust.reviewCount ?? 0} reviews)
            </Text>
          </View>
        )}

        {trust.responseTime && (
          <View>
            <Text className="text-xs font-bold text-neutral-800">⚡ {trust.responseTime}</Text>
            <Text className="text-[10px] text-neutral-500 font-semibold">Response time</Text>
          </View>
        )}

        {trust.responseRate !== undefined && trust.responseRate > 0 && (
          <View>
            <Text className="text-xs font-bold text-neutral-800">{trust.responseRate}%</Text>
            <Text className="text-[10px] text-neutral-500 font-semibold">Reply rate</Text>
          </View>
        )}

        {trust.memberSince && (
          <View>
            <Text className="text-xs font-bold text-neutral-800">Since {trust.memberSince}</Text>
            <Text className="text-[10px] text-neutral-500 font-semibold">Member</Text>
          </View>
        )}
      </View>

      {/* Country verifications */}
      {trust.countryVerifications && trust.countryVerifications.length > 0 && (
        <View className="flex-row flex-wrap mt-2 gap-1">
          {trust.countryVerifications.filter((v) => v.isVerified).map((v) => (
            <View key={v.countryCode} className="flex-row items-center bg-white border border-teal-100 rounded-full px-2 py-0.5">
              <Text className="text-xs mr-1">{v.flag}</Text>
              <Text className="text-[10px] font-semibold text-neutral-700">{v.countryName}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
