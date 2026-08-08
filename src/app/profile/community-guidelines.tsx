import React from 'react';
import { View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/components/ScreenHeader';
import { ScrollEndScrollView } from '@/components/ScrollEndNavigationMenu';

export default function CommunityGuidelinesScreen() {
  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-neutral-50/40">
      <ScreenHeader title="Community Guidelines" />

      <ScrollEndScrollView className="flex-1 p-6" showsVerticalScrollIndicator={false} activeTab="profile">
        
        {/* Core Premise */}
        <View className="bg-white border border-neutral-200 rounded-3xl p-5 shadow-sm mb-4">
          <Text className="text-xs font-extrabold text-primary-500 uppercase tracking-widest mb-2">Our Foundation</Text>
          <Text className="text-xl font-black text-neutral-900 tracking-tight mb-3">Community-First Trust</Text>
          <Text className="text-xs text-neutral-600 leading-relaxed">
            Diaspora is a private, trusted environment for individuals living outside their country of origin. We are not a general-purpose social network. Every interaction here should support fellow expats and maintain local safety.
          </Text>
        </View>

        {/* Quality Guidelines Sections */}
        <View className="bg-white border border-neutral-200 rounded-3xl p-5 shadow-sm mb-4 gap-4">
          <Text className="text-xs font-extrabold text-neutral-400 uppercase tracking-widest mb-1">Publishing Standards</Text>

          <View className="border-b border-neutral-50 pb-3">
            <Text className="text-xs font-extrabold text-neutral-800 mb-1">1. Guide Quality Standards</Text>
            <Text className="text-[10px] text-neutral-500 leading-relaxed">
              Guides must contain accurate, up-to-date, and actionable steps (e.g. visa processing, housing guides). We review and flag low-quality outline blocks, ads, or copy-pasted articles.
            </Text>
          </View>

          <View className="border-b border-neutral-50 pb-3">
            <Text className="text-xs font-extrabold text-neutral-800 mb-1">2. Marketplace Directories</Text>
            <Text className="text-[10px] text-neutral-500 leading-relaxed">
              Only post physical items or verified local services. Listings with duplicate stock imagery, hidden pricing, or false locations are instantly flagged for fraud review.
            </Text>
          </View>

          <View className="border-b border-neutral-50 pb-3">
            <Text className="text-xs font-extrabold text-neutral-800 mb-1">3. Jobs & Housing Listings</Text>
            <Text className="text-[10px] text-neutral-500 leading-relaxed">
              Postings must feature clear terms, accurate salaries/rents, and verified contact points. Impersonation of landlords or employers leads to permanent account suspension.
            </Text>
          </View>

          <View>
            <Text className="text-xs font-extrabold text-neutral-800 mb-1">4. Comment & Feedback Policy</Text>
            <Text className="text-[10px] text-neutral-500 leading-relaxed">
              Comments must remain respectful. Spamming, advertising, harassment, or spreading false information in reviews will degrade your trust rating and suspend comments capability.
            </Text>
          </View>
        </View>

        {/* Scam & Spam Protections */}
        <View className="bg-[#FFF8E1] border border-[#FFE082] rounded-3xl p-5 mb-4">
          <Text className="text-xs font-extrabold text-[#B56500] uppercase tracking-widest mb-2">🚨 Scam Prevention Rules</Text>
          <Text className="text-xs text-neutral-700 leading-relaxed mb-3">
            To prevent fraud, Diaspora runs automated checking processes:
          </Text>
          <View className="gap-2 pl-2">
            <Text className="text-[10px] text-neutral-600">• Never pay deposits for rooms before physical viewings.</Text>
            <Text className="text-[10px] text-neutral-600">• Always hire local providers with Verified badges.</Text>
            <Text className="text-[10px] text-neutral-600">• Reuse of cover photos across different listings will trigger fraud flags.</Text>
          </View>
        </View>

        {/* Consequences of Violations */}
        <View className="bg-white border border-neutral-200 rounded-3xl p-5 shadow-sm mb-10">
          <Text className="text-xs font-extrabold text-neutral-400 uppercase tracking-widest mb-2">Policy Enforcement</Text>
          <Text className="text-sm font-extrabold text-neutral-900 mb-3">Consequences of Violations</Text>
          
          <View className="gap-3">
            <View className="flex-row items-start gap-2">
              <Text className="text-xs">⚠️</Text>
              <View className="flex-1">
                <Text className="text-xs font-extrabold text-neutral-800">Warning</Text>
                <Text className="text-[10px] text-neutral-500">First-time light violations trigger a warning and degrade reputation scores.</Text>
              </View>
            </View>

            <View className="flex-row items-start gap-2 border-t border-neutral-50 pt-2.5">
              <Text className="text-xs">🚫</Text>
              <View className="flex-1">
                <Text className="text-xs font-extrabold text-neutral-800">Restricted Standing</Text>
                <Text className="text-[10px] text-neutral-500">Repeated warnings restrict publishing and comment actions while permitting profile reading.</Text>
              </View>
            </View>

            <View className="flex-row items-start gap-2 border-t border-neutral-50 pt-2.5">
              <Text className="text-xs">🚨</Text>
              <View className="flex-1">
                <Text className="text-xs font-extrabold text-neutral-800">Suspension</Text>
                <Text className="text-[10px] text-neutral-500">Severe violations (identity theft, fraud, spam scams) lead to permanent account suspension.</Text>
              </View>
            </View>
          </View>
        </View>

        <View className="h-24" />
      </ScrollEndScrollView>
    </SafeAreaView>
  );
}
