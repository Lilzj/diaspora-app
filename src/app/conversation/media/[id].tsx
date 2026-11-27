/**
 * Conversation Media Gallery — Images, Documents, Voice Notes
 */

import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useLocalSearchParams } from 'expo-router';
import { ConversationHub } from '@/lib/transport/conversation-hub';
import { useBottomInset } from '@/components/layout/bottom-inset';
import { ListEmpty, ListState } from '@/components/ListState';
import type { ConversationMediaGallery } from '@/types/conversation';

export default function ConversationMediaScreen() {
  // The guard rail: the phone's gesture area plus breathing room.
  const bottomInset = useBottomInset();

  const { id } = useLocalSearchParams<{ id: string }>();
  // Typed rather than `any[]`, which is what going through the boundary buys:
  // the gallery's shape is now checked against `MessageAttachment` instead of
  // being asserted field by field at the render site (FSOLID-002).
  const [media, setMedia] = useState<ConversationMediaGallery>({
    images: [], documents: [], voice: [],
  });
  const [isLoading, setIsLoading] = useState(true);
  // The read had no `catch`, so a failure left every tab saying "No photos yet"
  // (FARCH-007, 27 Nov 2026). It is said now, with a way to ask again.
  const [loadFailed, setLoadFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [activeTab, setActiveTab] = useState<'images' | 'documents' | 'voice'>('images');

  useEffect(() => {
    const load = async () => {
      try {
        setMedia(await ConversationHub.media(String(id)));
        setLoadFailed(false);
      } catch {
        setLoadFailed(true);
      } finally {
        setIsLoading(false);
      }
    };
    void load();
  }, [id, attempt]);

  const retry = () => {
    setLoadFailed(false);
    setIsLoading(true);
    setAttempt((count) => count + 1);
  };

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

      <ListState
        loading={isLoading}
        loadingLabel="Loading media"
        error={
          loadFailed
            ? { title: 'Media could not be loaded', message: 'Check your connection and try again.' }
            : null
        }
        onRetry={retry}
      >
        {activeTab === 'images' ? (
          <FlatList
            data={media.images}
            keyExtractor={(_, i) => String(i)}
            numColumns={3}
            renderItem={({ item }) => (
              <View style={{ flex: 1/3, aspectRatio: 1, padding: 1 }}>
                <Image source={{ uri: item.url }} style={{ flex: 1 }} contentFit="cover" />
              </View>
            )}
            ListEmptyComponent={<ListEmpty icon="image-outline" title="No photos yet" />}
            contentContainerStyle={{ padding: 1, paddingBottom: bottomInset }}
          />
        ) : activeTab === 'documents' ? (
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
            ListEmptyComponent={<ListEmpty icon="document-outline" title="No documents yet" />}
            contentContainerStyle={{ paddingVertical: 8 }}
          />
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
            ListEmptyComponent={<ListEmpty icon="mic-outline" title="No voice notes yet" />}
            contentContainerStyle={{ paddingVertical: 8 }}
          />
        )}
      </ListState>
    </SafeAreaView>
  );
}
