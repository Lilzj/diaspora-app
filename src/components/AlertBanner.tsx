import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';

interface AlertBannerProps {
  title: string;
  location: string;
  reason: string;
  confirmationCount: number;
  verifiedCount: number;
  onPress: () => void;
}

export function AlertBanner({ 
  title, 
  location, 
  reason, 
  confirmationCount, 
  verifiedCount, 
  onPress 
}: AlertBannerProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.95}
      className="mx-6 mb-5 bg-[#FFF5F5] border border-[#FFE3E3] rounded-2xl p-4 shadow-md shadow-error-default/5"
      style={{
        shadowColor: '#EF4444',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
        elevation: 4,
      }}
    >
      {/* Alert Header Tag */}
      <View className="flex-row flex-wrap items-center mb-2 gap-1.5">
        <Text className="text-xs font-extrabold text-error-default uppercase tracking-wider bg-error-surface px-2.5 py-1 rounded-full mr-1.5">
          🚨 Active Community Alert
        </Text>
        <Text className="text-xs text-content-muted font-semibold">
          {reason}
        </Text>
      </View>

      {/* Main Alert Info */}
      <Text className="text-base font-bold text-content-primary mb-1.5">{title}</Text>
      
      <View className="flex-row items-center mb-3">
        <Text className="text-xs text-content-muted font-semibold">📍 {location}</Text>
      </View>

      {/* Verification Status Badge */}
      <View className="flex-row items-center">
        <View className="flex-row flex-wrap items-center bg-[#E6F4EA] border border-[#CEEAD6] px-2.5 py-1.5 rounded-lg w-full">
          <Text className="text-xs font-bold text-success-default">
            ✓ Confirmed by {confirmationCount} Community Members
          </Text>
          {verifiedCount > 0 && (
            <Text className="text-xs text-[#137333] font-bold ml-1.5">
              (incl. {verifiedCount} Verified Residents)
            </Text>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}
