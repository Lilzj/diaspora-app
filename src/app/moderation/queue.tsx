import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { mockModerationQueue } from '@/mocks/community-data';

export default function ModerationQueueScreen() {
  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-neutral-50">
      <View className="px-6 py-4 border-b border-neutral-200 bg-white flex-row items-center">
        <TouchableOpacity onPress={() => router.back()} className="mr-4">
          <Text className="text-xl text-neutral-600">←</Text>
        </TouchableOpacity>
        <Text className="text-xl font-bold text-neutral-900">Moderator Queue</Text>
      </View>

      <ScrollView className="flex-1 p-6">
        <Text className="text-lg font-bold text-neutral-900 mb-4">🤖 AI Flagged</Text>
        {mockModerationQueue.filter(q => q.aiReview?.status === 'Flagged').map(item => (
          <View key={item.contentId} className="bg-white border border-error-default/20 rounded-xl p-4 mb-4" style={{ shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 2, elevation: 1 }}>
            <View className="flex-row items-center justify-between mb-2">
              <Text className="text-sm font-semibold text-neutral-900">{item.title}</Text>
              <Text className="text-xs bg-error-surface text-error-default px-2 py-1 rounded font-bold">
                {Math.round((item.aiReview?.confidence || 0) * 100)}% Match
              </Text>
            </View>
            <Text className="text-xs text-neutral-500 mb-3">Author: {item.authorName} ({item.authorLevel})</Text>
            <Text className="text-xs font-semibold text-neutral-700 mb-1">AI Flags:</Text>
            <View className="flex-row flex-wrap mb-4">
              {item.aiReview?.flags.map(f => (
                <Text key={f} className="text-xs bg-neutral-100 px-2 py-1 rounded mr-2 mb-2">{f}</Text>
              ))}
            </View>
            <View className="flex-row space-x-2">
              <TouchableOpacity className="flex-1 bg-error-default py-2 rounded-lg items-center mx-1">
                <Text className="text-white font-medium text-sm">Reject</Text>
              </TouchableOpacity>
              <TouchableOpacity className="flex-1 bg-white border border-neutral-200 py-2 rounded-lg items-center mx-1">
                <Text className="text-neutral-700 font-medium text-sm">Review</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}

        <Text className="text-lg font-bold text-neutral-900 mt-4 mb-4">📋 Pending Review</Text>
        {mockModerationQueue.filter(q => q.status === 'PendingReview').map(item => (
           <View key={item.contentId} className="bg-white border border-neutral-200 rounded-xl p-4 mb-4">
            <Text className="text-sm font-semibold text-neutral-900 mb-1">{item.title}</Text>
            <Text className="text-xs text-neutral-500 mb-3">Author: {item.authorName} ({item.authorLevel})</Text>
            <View className="bg-success-surface px-3 py-2 rounded-lg mb-4 flex-row items-center">
               <Text className="text-sm mr-2">✅</Text>
               <Text className="text-xs font-medium text-success-default">AI Check: Clean</Text>
            </View>
            <View className="flex-row space-x-2">
              <TouchableOpacity className="flex-1 bg-primary-500 py-2 rounded-lg items-center mx-1">
                <Text className="text-white font-medium text-sm">Approve</Text>
              </TouchableOpacity>
              <TouchableOpacity className="flex-1 bg-white border border-neutral-200 py-2 rounded-lg items-center mx-1">
                <Text className="text-neutral-700 font-medium text-sm">Review</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
        <View className="h-8" />
      </ScrollView>
    </SafeAreaView>
  );
}
