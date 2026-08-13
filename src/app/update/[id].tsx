import React, { useState } from 'react';
import { useNotification } from '@/providers/notification-provider';
import { View, Text, ScrollView, TouchableOpacity, Linking, Share } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollEndScrollView } from '@/components/ScrollEndNavigationMenu';
import { useLocalSearchParams, router } from 'expo-router';
import { mockCommunityUpdates, mockAuthors } from '@/mocks/community-data';
import { URGENCY_COLORS, UPDATE_CATEGORY_ICONS } from '@/types/update';
import { Avatar } from '@/components/Avatar';
import { ReputationBadge } from '@/components/ReputationBadge';
import { Image } from 'expo-image';
import Svg, { Circle, Path, Line, Rect } from 'react-native-svg';
import { ReportModal } from '@/components/ReportModal';

export default function UpdateDetailScreen() {
  const { showAlert } = useNotification();
  const { id } = useLocalSearchParams<{ id: string }>();
  const update = mockCommunityUpdates.find((u) => u.updateId === id);

  if (!update) {
    return (
      <SafeAreaView className="flex-1 bg-white items-center justify-center">
        <Text>Update not found.</Text>
        <TouchableOpacity onPress={() => router.back()} className="mt-4">
          <Text className="text-primary-500">Go Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const author = mockAuthors[update.authorId];
  const urgencyColor = URGENCY_COLORS[update.urgency];

  // Interactive local confirmations
  const [localConfirmationCount, setLocalConfirmationCount] = useState(update.confirmationCount);
  const [hasConfirmed, setHasConfirmed] = useState(false);
  const [reportModalVisible, setReportModalVisible] = useState(false);

  const handleReport = () => {
    setReportModalVisible(true);
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message: `🚨 Diaspora Alert: "${update.title}" in ${update.location.areaName}, ${update.location.cityName}. Proximity: ${formattedDistance} km away. Please check the app for safety details.`,
      });
    } catch (err) {
      console.log('Sharing failed', err);
    }
  };

  const handleConfirmPress = () => {
    if (hasConfirmed) {
      setLocalConfirmationCount((c) => c - 1);
      setHasConfirmed(false);
      showAlert({ type: 'warning', title: 'Confirmation Removed', message: 'Your confirmation vote has been withdrawn.' });
    } else {
      setLocalConfirmationCount((c) => c + 1);
      setHasConfirmed(true);
      showAlert({ type: 'success', title: 'Details Confirmed', message: 'Thank you! Your verification makes the local community safer and more informed.' });
    }
  };

  // Open in External Maps handler
  const openInExternalMaps = () => {
    const scheme = 'https://www.google.com/maps/search/?api=1&query=';
    const query = `${update.location.latitude},${update.location.longitude}`;
    Linking.openURL(`${scheme}${query}`).catch(() => {
      showAlert({ type: 'error', title: 'Error', message: 'Unable to launch Google Maps.' });
    });
  };

  // Calculate simulated distance in km from mock user position (e.g. user is in Elephant & Castle: 51.4952, -0.1005)
  const userLat = 51.4952;
  const userLng = -0.1005;
  const dLat = update.location.latitude - userLat;
  const dLng = update.location.longitude - userLng;
  const distanceKm = Math.sqrt(dLat * dLat + dLng * dLng) * 111; // simple distance scaling
  const formattedDistance = distanceKm.toFixed(1);

  // Confidence Score calculation dimensions
  // base factor: number of confirmations
  const proximityBonus = distanceKm < 3 ? 30 : 10;
  const confirmationsBonus = Math.min(localConfirmationCount * 6, 40);
  const residentBonus = update.verifiedResidentConfirmationCount * 10;
  const ageHours = (Date.now() - new Date(update.publishedAt).getTime()) / (1000 * 60 * 60);
  const recencyDecay = Math.max(-20, Math.floor(-ageHours * 2));
  
  const confidenceScore = Math.min(100, Math.max(10, 45 + proximityBonus + confirmationsBonus + residentBonus + recencyDecay));

  // Nearby updates in the same city (excluding current one)
  const nearbyUpdates = mockCommunityUpdates
    .filter((u) => u.updateId !== update.updateId && u.location.cityName === update.location.cityName)
    .slice(0, 2);

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-neutral-50/40">
      
      {/* Navigation Header */}
      <View className="px-6 py-4 border-b border-neutral-200 bg-white flex-row justify-between items-center">
        <View className="flex-row items-center">
          <TouchableOpacity onPress={() => router.back()} className="mr-4">
            <Text className="text-xl text-neutral-600">←</Text>
          </TouchableOpacity>
          <Text className="text-lg font-black text-neutral-900 tracking-tight">Alert Details</Text>
        </View>
        <TouchableOpacity onPress={handleShare}>
          <Text className="text-xs font-bold text-primary-500">SHARE</Text>
        </TouchableOpacity>
      </View>

      <ScrollEndScrollView className="flex-1" showsVerticalScrollIndicator={false} activeTab="discover">
        {update.imageUrls && update.imageUrls.length > 0 && (
          <Image
            source={{ uri: update.imageUrls[0] }}
            style={{ width: '100%', height: 220 }}
            contentFit="cover"
            transition={200}
          />
        )}

        <View className="p-6 bg-white border-b border-neutral-100">
          
          {/* Urgency Badge & Expiration timeline */}
          <View className="flex-row items-center mb-3">
            <View className="px-2 py-0.5 rounded-full mr-2" style={{ backgroundColor: urgencyColor + '20' }}>
              <Text className="text-[10px] font-black tracking-widest" style={{ color: urgencyColor }}>
                {update.urgency.toUpperCase()}
              </Text>
            </View>
            <Text className="text-xs text-neutral-400 font-semibold">
              Expires: {new Date(update.expiresAt).toLocaleTimeString()}
            </Text>
          </View>

          {/* Heading */}
          <View className="flex-row items-center mb-4">
            <Text className="text-2xl mr-2">{UPDATE_CATEGORY_ICONS[update.category]}</Text>
            <Text className="text-xl font-black text-neutral-900 flex-1 leading-snug">{update.title}</Text>
          </View>

          {/* Alert Description */}
          <Text className="text-sm text-neutral-600 leading-relaxed mb-6">
            {update.description}
          </Text>

          {/* Distance and Location Info Card */}
          <View className="bg-neutral-50 border border-neutral-200 rounded-3xl p-4 mb-4 flex-row items-center justify-between">
            <View className="flex-row items-center flex-1 mr-3">
              <Text className="text-2xl mr-3">📍</Text>
              <View className="flex-1">
                <Text className="text-sm font-bold text-neutral-800">{update.location.areaName}</Text>
                <Text className="text-xs text-neutral-500 mt-0.5">{update.location.cityName} · {formattedDistance} km from you</Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={openInExternalMaps}
              className="bg-white border border-neutral-300 px-3.5 py-2 rounded-2xl shadow-sm"
            >
              <Text className="text-xs font-bold text-neutral-700">Open Maps ↗</Text>
            </TouchableOpacity>
          </View>

          {/* Vector Stylized Map Graphic representation */}
          <View className="w-full h-40 bg-neutral-100 rounded-3xl overflow-hidden mb-6 relative border border-neutral-200">
            <Svg height="100%" width="100%">
              {/* grid map backdrop */}
              <Rect width="100%" height="100%" fill="#E0F2FE" />
              {/* park areas */}
              <Circle cx="80" cy="50" r="40" fill="#DCFCE7" />
              <Circle cx="260" cy="110" r="30" fill="#DCFCE7" />
              {/* grid streets lines */}
              <Line x1="0" y1="40" x2="360" y2="40" stroke="#FFFFFF" strokeWidth="6" />
              <Line x1="0" y1="120" x2="360" y2="120" stroke="#FFFFFF" strokeWidth="6" strokeDasharray="3 3" />
              <Line x1="120" y1="0" x2="120" y2="160" stroke="#FFFFFF" strokeWidth="8" />
              <Line x1="220" y1="0" x2="220" y2="160" stroke="#FFFFFF" strokeWidth="6" />
              
              {/* Proximity Radius */}
              <Circle cx="120" cy="80" r="35" fill="#F5930018" stroke="#F59300" strokeWidth="1.5" strokeDasharray="4 2" />
              
              {/* Update point node indicator */}
              <Circle cx="120" cy="80" r="6" fill="#F59300" stroke="#FFFFFF" strokeWidth="1.5" />
            </Svg>
            
            {/* Legend Tag */}
            <View className="absolute bottom-2 left-2 bg-black/60 px-2 py-0.5 rounded">
              <Text className="text-[9px] text-white font-extrabold">ACCURACY RADIUS: 150m</Text>
            </View>
          </View>

          {/* Author Block */}
          <View className="flex-row items-center border-t border-b border-neutral-100 py-4 mb-6">
            <Avatar name={author.name} size={42} />
            <View className="ml-3 flex-1">
              <Text className="text-sm font-bold text-neutral-900">{author.name}</Text>
              <ReputationBadge level={author.reputationLevel} size="sm" />
            </View>
            <TouchableOpacity onPress={() => router.push(`/contributor/${author.userId}`)}>
              <Text className="text-xs font-bold text-primary-500">View Expert →</Text>
            </TouchableOpacity>
          </View>

          {/* Confidence-based Trust Indicators */}
          <View className="bg-neutral-50 rounded-3xl p-5 border border-neutral-200">
            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-sm font-black text-neutral-800">Community Confidence Score</Text>
              <View className="px-3 py-1 rounded-full bg-[#E6F4EA] border border-[#CEEAD6]">
                <Text className="text-xs font-extrabold text-success-default">{confidenceScore}% Reliable</Text>
              </View>
            </View>

            {/* Scorecard checklist weights breakdown */}
            <View className="space-y-2 mb-5">
              <View className="flex-row items-center justify-between py-1 border-b border-neutral-100">
                <Text className="text-xs text-neutral-500">📍 Proximity Verification</Text>
                <Text className="text-xs font-bold text-neutral-700">Verified nearby (+{proximityBonus}%)</Text>
              </View>
              <View className="flex-row items-center justify-between py-1 border-b border-neutral-100">
                <Text className="text-xs text-neutral-500">👥 Resident Confirmations</Text>
                <Text className="text-xs font-bold text-neutral-700">+{confirmationsBonus}% ({localConfirmationCount} confirmations)</Text>
              </View>
              <View className="flex-row items-center justify-between py-1 border-b border-neutral-100">
                <Text className="text-xs text-neutral-500">🏅 Contributor Reputation Weight</Text>
                <Text className="text-xs font-bold text-neutral-700">Level tier (+{residentBonus}%)</Text>
              </View>
              <View className="flex-row items-center justify-between py-1">
                <Text className="text-xs text-neutral-500">🕐 Time Recency Decay</Text>
                <Text className="text-xs font-bold text-error-default">{recencyDecay}% ({Math.round(ageHours)}h elapsed)</Text>
              </View>
            </View>

            {/* Interactive Confirm Action Toggle */}
            <TouchableOpacity
              onPress={handleConfirmPress}
              className={`py-3.5 rounded-2xl items-center justify-center flex-row gap-2 border ${
                hasConfirmed ? 'bg-success-default border-success-default' : 'bg-primary-500 border-primary-500'
              }`}
            >
              <Text className="text-white text-base">✓</Text>
              <Text className="text-white font-extrabold text-sm">
                {hasConfirmed ? 'Confirmed By You' : 'I can confirm this'}
              </Text>
            </TouchableOpacity>
          </View>

        </View>

        {/* Nearby Reports Section */}
        <View className="p-6">
          <Text className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-3">Nearby Alert Feeds</Text>
          {nearbyUpdates.map((u) => (
            <TouchableOpacity
              key={u.updateId}
              onPress={() => router.push(`/update/${u.updateId}`)}
              className="bg-white border border-neutral-200 rounded-3xl p-4 mb-3 flex-row justify-between items-center"
            >
              <View className="flex-1 mr-3">
                <View className="flex-row items-center">
                  <Text className="text-base mr-1.5">{UPDATE_CATEGORY_ICONS[u.category]}</Text>
                  <Text className="text-sm font-bold text-neutral-800">{u.title}</Text>
                </View>
                <Text className="text-xs text-neutral-500 mt-1">{u.location.areaName} · {u.confirmationCount} votes</Text>
              </View>
              <Text className="text-neutral-300 text-lg">›</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Report link */}
        <TouchableOpacity onPress={handleReport} className="items-center py-6 mb-3">
          <Text className="text-xs text-neutral-400 font-extrabold uppercase">Report this community alert</Text>
        </TouchableOpacity>

        <View className="h-8" />
      </ScrollEndScrollView>
      <ReportModal
        visible={reportModalVisible}
        onClose={() => setReportModalVisible(false)}
        contentType="Update"
        contentId={update.updateId}
        onSubmit={(data) => {
          console.log('Reported Update:', data);
        }}
      />
    </SafeAreaView>
  );
}
