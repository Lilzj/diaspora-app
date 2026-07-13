import React from 'react';
import { View, Text, Dimensions } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { ScreenHeader } from '@/components/ScreenHeader';
import { FlatList } from 'react-native';

const { width } = Dimensions.get('window');

export default function GalleryScreen() {
  const { images, index } = useLocalSearchParams<{ images: string; index: string }>();
  const imageList = images?.split(',') ?? [];
  const initialIndex = parseInt(index ?? '0', 10);

  return (
    <SafeAreaView className="flex-1 bg-black">
      <View className="flex-row items-center justify-between px-4 pt-2">
        <ScreenHeader title="" showBack transparent />
        <Text className="text-white text-sm mr-4">
          {initialIndex + 1} of {imageList.length}
        </Text>
      </View>

      <FlatList
        data={imageList}
        keyExtractor={(_, i) => String(i)}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        initialScrollIndex={initialIndex}
        getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
        renderItem={({ item }) => (
          <Image
            source={{ uri: item }}
            style={{ width, height: '100%' }}
            contentFit="contain"
          />
        )}
      />
    </SafeAreaView>
  );
}
