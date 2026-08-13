import React, { useState } from 'react';
import { View, Text, ScrollView, Dimensions } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@/components/Button';

const { width } = Dimensions.get('window');

const slides = [
  {
    icon: '🌍',
    title: 'Your community, wherever you are',
    description: 'Find trusted businesses and services from people who understand your culture.',
  },
  {
    icon: '⚡',
    title: 'Discover in seconds',
    description: 'Search, filter, and find exactly what you need — fast. No sign-up required to browse.',
  },
  {
    icon: '🤝',
    title: 'Trust built by community',
    description: 'Read real reviews from real people. Verified providers earn your confidence.',
  },
];

export default function OnboardingScreen() {
  const [currentSlide, setCurrentSlide] = useState(0);

  return (
    <SafeAreaView className="flex-1 bg-surface-card">
      <View className="flex-1 justify-center">
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(e) => {
            const index = Math.round(e.nativeEvent.contentOffset.x / width);
            setCurrentSlide(index);
          }}
        >
          {slides.map((slide, index) => (
            <View key={index} style={{ width }} className="items-center justify-center px-8">
              <Text className="text-7xl mb-8">{slide.icon}</Text>
              <Text className="text-2xl font-bold text-content-primary text-center mb-4">
                {slide.title}
              </Text>
              <Text className="text-base text-content-muted text-center leading-relaxed">
                {slide.description}
              </Text>
            </View>
          ))}
        </ScrollView>

        {/* Dots */}
        <View className="flex-row items-center justify-center py-6">
          {slides.map((_, index) => (
            <View
              key={index}
              className={`w-2 h-2 rounded-full mx-1.5 ${
                index === currentSlide ? 'bg-primary-500 w-6' : 'bg-neutral-200'
              }`}
            />
          ))}
        </View>
      </View>

      <View className="px-6 pb-6">
        <Button
          label={currentSlide === slides.length - 1 ? 'Get Started' : 'Next'}
          variant="primary"
          onPress={() => {
            if (currentSlide === slides.length - 1) {
              router.push('/(auth)/choose-language');
            }
          }}
        />
        <Button
          label="Skip"
          variant="ghost"
          className="mt-2"
          onPress={() => router.push('/(auth)/choose-language')}
        />
      </View>
    </SafeAreaView>
  );
}
