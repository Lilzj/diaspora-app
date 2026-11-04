/**
 * Conversation Media Gallery — Images, Documents, Voice Notes
 */

import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, ActivityIndicator, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useLocalSearchParams } from 'expo-router';
import { apiClient } from '@/lib/apiClient';
import { useBottomInset } from '@/components/layout/bottom-inset';

export default function ConversationMediaScreen() {
  // The guard rail: the phone's gesture area plus breathing room.
  const bottomInset = useBottomInset();

  const { id } = useLocalSearchParams<{ id: string }>();
  const [media, setMedia] = useState<{ images: any[]; documents: any[]; voice: any[] }>({
    images: [], documents: [], voice: [],
  });
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'images' | 'documents' | 'voice'>('images');

  useEffect(() => {
    const load = async () => {
      try {
        const res = await apiClient.get(`/conversations/${id}/media`);
        setMedia(res.data.data);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [id]);

  const tabs = [
    { key: 'images' as const, label: '📷 Photos', count: media.images.length },
    { key: 'documents' as const, label: '📄 Docs', count: media.documents.length },
    { key: 'voice' as const, label: '🎤 Voice', count: media.voice.length },
  ];

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-surface-background">
      <ScreenHeader title="Media & Files" showBack />

      {/* Tabs */}
      <View className="flex-row bg-surface-card border-b border-faint px-4">
        {tabs.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            onPress={() => setActiveTab(tab.key)}
            className="mr-6 py-3"
            activeOpacity={0.7}
          >
            <Text className={`text-xs font-bold ${activeTab === tab.key ? 'text-warning-default' : 'text-content-muted'}`}>
              {tab.label} ({tab.count})
            </Text>
            {activeTab === tab.key && (
              <View className="h-0.5 bg-amber-500 mt-1 rounded-full" />
            )}
          </TouchableOpacity>
        ))}
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#F59300" size="large" />
        </View>
      ) : activeTab === 'images' ? (
        media.images.length === 0 ? (
          <View className="flex-1 items-center justify-center">
            <Text className="text-5xl mb-4">📷</Text>
            <Text className="text-base font-bold text-content-tertiary">No photos yet</Text>
          </View>
        ) : (
          <FlatList
            data={media.images}
            keyExtractor={(_, i) => String(i)}
            numColumns={3}
            renderItem={({ item }) => (
              <View style={{ flex: 1/3, aspectRatio: 1, padding: 1 }}>
                <Image source={{ uri: item.url }} style={{ flex: 1 }} contentFit="cover" />
              </View>
            )}
            contentContainerStyle={{ padding: 1, paddingBottom: bottomInset }}
          />
        )
      ) : activeTab === 'documents' ? (
        media.documents.length === 0 ? (
          <View className="flex-1 items-center justify-center">
            <Text className="text-5xl mb-4">📄</Text>
            <Text className="text-base font-bold text-content-tertiary">No documents yet</Text>
          </View>
        ) : (
          <FlatList
            data={media.documents}
            keyExtractor={(_, i) => String(i)}
            renderItem={({ item }) => (
              <View className="bg-surface-card border border-subtle rounded-xl mx-4 my-1.5 px-4 py-3 flex-row items-center">
                <Text className="text-2xl mr-3">📄</Text>
                <View className="flex-1">
                  <Text className="text-sm font-bold text-content-primary" numberOfLines={1}>{item.fileName}</Text>
                  <Text className="text-[10px] text-content-faint">
                    {item.sizeBytes ? `${(item.sizeBytes / 1024).toFixed(0)} KB` : ''}
                  </Text>
                </View>
              </View>
            )}
            contentContainerStyle={{ paddingVertical: 8 }}
          />
        )
      ) : (
        media.voice.length === 0 ? (
          <View className="flex-1 items-center justify-center">
            <Text className="text-5xl mb-4">🎤</Text>
            <Text className="text-base font-bold text-content-tertiary">No voice notes yet</Text>
          </View>
        ) : (
          <FlatList
            data={media.voice}
            keyExtractor={(_, i) => String(i)}
            renderItem={({ item }) => (
              <View className="bg-surface-card border border-subtle rounded-xl mx-4 my-1.5 px-4 py-3 flex-row items-center">
                <View className="w-10 h-10 rounded-full bg-surface-muted border border-subtle items-center justify-center mr-3">
                  <Text>🎤</Text>
                </View>
                <View className="flex-1">
                  <Text className="text-sm font-bold text-content-primary">Voice Note</Text>
                  <Text className="text-[10px] text-content-faint">
                    {item.durationSeconds}s
                  </Text>
                </View>
              </View>
            )}
            contentContainerStyle={{ paddingVertical: 8 }}
          />
        )
      )}
    </SafeAreaView>
  );
}
