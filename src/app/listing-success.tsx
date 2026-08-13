import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@/components/Button';
import Svg, { Circle, Path, Defs, LinearGradient } from 'react-native-svg';

const CONFETTI_COUNT = 35;

export default function ListingSuccessScreen() {
  const particles = useRef(
    Array.from({ length: CONFETTI_COUNT }).map((_, i) => ({
      id: i,
      x: Math.random() * 320,
      y: new Animated.Value(-40),
      color: ['#F59300', '#FFA600', '#2563EB', '#10B981', '#EC4899', '#8B5CF6'][i % 6],
      size: Math.random() * 8 + 6,
      rotate: new Animated.Value(0),
      opacity: new Animated.Value(1),
    }))
  ).current;

  useEffect(() => {
    // Trigger confetti physics
    const animations = particles.map((p) => {
      const delay = Math.random() * 600;
      return Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.timing(p.y, {
            toValue: 600,
            duration: Math.random() * 1500 + 1200,
            useNativeDriver: true,
          }),
          Animated.timing(p.rotate, {
            toValue: 360,
            duration: Math.random() * 1500 + 1200,
            useNativeDriver: true,
          }),
          Animated.timing(p.opacity, {
            toValue: 0,
            duration: Math.random() * 500 + 1800,
            useNativeDriver: true,
          }),
        ]),
      ]);
    });
    Animated.parallel(animations).start();
  }, []);

  return (
    <SafeAreaView className="flex-1 bg-surface-card px-6 justify-between relative">
      {/* Confetti canvas overlay */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {particles.map((p) => (
          <Animated.View
            key={p.id}
            style={{
              position: 'absolute',
              top: 0,
              left: p.x,
              width: p.size,
              height: p.size,
              backgroundColor: p.color,
              borderRadius: p.id % 2 === 0 ? p.size / 2 : 2,
              opacity: p.opacity,
              transform: [
                { translateY: p.y },
                {
                  rotate: p.rotate.interpolate({
                    inputRange: [0, 360],
                    outputRange: ['0deg', '360deg'],
                  }),
                },
              ],
            }}
          />
        ))}
      </View>

      {/* Top Graphic Celebrations */}
      <ScrollView className="flex-1 mt-6" showsVerticalScrollIndicator={false}>
        <View className="items-center mb-6">
          <View className="w-24 h-24 rounded-full bg-success-surface items-center justify-center mb-5 border border-success-default/15 shadow-md shadow-success-default/5">
            <Text className="text-5xl">🎉</Text>
          </View>

          <Text className="text-2xl font-extrabold text-content-primary text-center mb-2 tracking-tight">
            Listing Published!
          </Text>
          <Text className="text-sm text-content-muted text-center leading-relaxed max-w-[280px]">
            Your business is now live on Diaspora. Customers in your city can now discover, call, and contact you.
          </Text>
        </View>

        {/* Profile Completion visual block (75%) */}
        <TouchableOpacity
          onPress={() => router.push('/profile/trust-center')}
          activeOpacity={0.7}
          className="bg-surface-background border border-subtle rounded-3xl p-5 mb-6 flex-row items-center justify-between"
        >
          <View className="flex-1 pr-4">
            <Text className="text-sm font-bold text-content-strong">Profile 75% Completed</Text>
            <Text className="text-xs text-content-muted leading-relaxed mt-1">
              Add verification details to unlock customer trust and gain directory priority.
            </Text>
          </View>
          
          {/* Circular SVG Progress */}
          <Svg height="60" width="60" viewBox="0 0 36 36">
            <Circle cx="18" cy="18" r="16" fill="none" stroke="#E5E7EB" strokeWidth="3" />
            <Circle
              cx="18"
              cy="18"
              r="16"
              fill="none"
              stroke="#F59300"
              strokeWidth="3"
              strokeDasharray="100"
              strokeDashoffset="25" // 75% complete
              strokeLinecap="round"
              transform="rotate(-90 18 18)"
            />
            {/* Center percentage label */}
            <Text style={{ position: 'absolute', top: 22, left: 16 }} className="text-xs font-black text-content-strong text-center">
              75%
            </Text>
          </Svg>
        </TouchableOpacity>

        {/* Suggested Next Action modules */}
        <Text className="text-xs font-bold text-content-faint uppercase tracking-widest mb-3">
          Suggested Next Steps
        </Text>

        <NextStepCard
          title="Verify your business identity"
          description="Submit standard registration forms or Gov ID to earn the Verified badge."
          actionLabel="Verify Identity"
          icon="🛡️"
          onPress={() => router.push('/verification/country')}
        />

        <NextStepCard
          title="Complete remaining listing data"
          description="Add email addresses, social accounts, and additional photos to improve conversion."
          actionLabel="Edit Listing"
          icon="⚙️"
          onPress={() => router.replace('/(tabs)')}
        />

        <NextStepCard
          title="Share with your network"
          description="Promote your new listing URL to friends and communities to get helpful reviews."
          actionLabel="Share Link"
          icon="🔗"
          onPress={() => {}}
        />

        <View className="h-6" />
      </ScrollView>

      {/* Exit Buttons Action Group */}
      <View className="py-6 border-t border-faint bg-surface-card">
        <Button
          label="View My Live Listing"
          onPress={() => router.replace('/(tabs)')}
        />
        <Button
          label="Return to Dashboard"
          variant="outline"
          className="mt-3"
          onPress={() => router.replace('/(tabs)')}
        />
      </View>
    </SafeAreaView>
  );
}

// Next Action Step Card UI Component
function NextStepCard({
  title,
  description,
  actionLabel,
  icon,
  onPress,
}: {
  title: string;
  description: string;
  actionLabel: string;
  icon: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      className="bg-surface-card border border-subtle rounded-2xl p-4 flex-row items-start mb-3"
    >
      <Text className="text-2xl mr-3">{icon}</Text>
      <View className="flex-1">
        <Text className="text-sm font-bold text-content-strong">{title}</Text>
        <Text className="text-xs text-content-muted mt-1 leading-relaxed">{description}</Text>
        <Text className="text-xs font-bold text-primary-500 mt-2.5 uppercase tracking-wider">{actionLabel} →</Text>
      </View>
    </TouchableOpacity>
  );
}
