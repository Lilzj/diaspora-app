import React, { useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '@/components/Button';
import { useAuthStore } from '@/store/auth';

// --- Feature Column Item ---
interface FeatureColumnProps {
  name: string;
  subtext: string;
  pillBg: string;
  pillBorder: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconBg: string;
}

const FeatureColumn = ({ name, subtext, pillBg, pillBorder, icon, iconBg }: FeatureColumnProps) => (
  <View className="flex-1 items-center px-1">
    <View
      style={{ backgroundColor: pillBg, borderColor: pillBorder }}
      className="flex-row items-center border px-3 py-2 rounded-full"
    >
      <View
        style={{ backgroundColor: iconBg }}
        className="w-6 h-6 rounded-full items-center justify-center mr-2"
      >
        <Ionicons name={icon} size={13} color="#FFF" />
      </View>
      <Text className="text-sm font-bold text-content-strong">{name}</Text>
    </View>
    <Text className="text-[11px] text-content-muted text-center mt-2 leading-tight px-1">
      {subtext}
    </Text>
  </View>
);

export default function WelcomeScreen() {
  const insets = useSafeAreaInsets();
  const signOutReason = useAuthStore((state) => state.signOutReason);

  // A member the app signed out for inactivity is a returning member, not a
  // newcomer: straight to Sign in, where the reason is explained. Seen on an
  // emulator (13 Oct 2026): they landed here, with no word of why.
  useEffect(() => {
    if (signOutReason === 'inactivity') router.replace('/(auth)/login');
  }, [signOutReason]);

  const handleGetStarted = () => {
    router.push('/(auth)/register');
  };

  return (
    <View className="flex-1 bg-[#050B18]">
      <StatusBar style="light" />

      <ScrollView
        className="flex-1 bg-surface-card"
        contentContainerStyle={{ 
          flexGrow: 1, 
          paddingBottom: Math.max(insets.bottom, 16) 
        }}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {/* ===== DARK TOP SECTION: Globe Hero Image ===== */}
        <View style={{ height: 220, overflow: 'hidden' }} className="bg-[#050B18]">
          <Image
            source={require('../../../assets/globe-hero.png')}
            style={{ width: '112%', height: 280, marginTop: -20, alignSelf: 'center' }}
            contentFit="cover"
            transition={300}
          />
        </View>

        {/* ===== WHITE BOTTOM SECTION: Card Content ===== */}
        <View style={{ marginTop: -50, zIndex: 10 }} className="bg-surface-card rounded-t-[32px] px-6 pt-6 pb-6 relative flex-1 justify-between">

          {/* Upper Card Content */}
          <View className="w-full items-center">
            {/* Brand Logo Circular Badge */}
            <View className="items-center mb-3">
              <View className="w-24 h-24 rounded-full bg-[#FAF9F9] border border-faint items-center justify-center overflow-hidden shadow-sm shadow-neutral-100/50">
                <Image
                  source={require('../../../assets/diaspora-logo.png')}
                  style={{ width: 95, height: 95 }}
                  contentFit="contain"
                  transition={200}
                />
              </View>
            </View>

            {/* Title */}
            <Text className="text-2xl font-black text-content-primary tracking-tight text-center">
              Diaspora
            </Text>

            {/* Tagline */}
            <Text style={{ marginTop: 6 }} className="text-base font-extrabold text-content-strong text-center leading-snug">
              Your community abroad, all in one place
            </Text>

            {/* Description */}
            <Text style={{ marginTop: 8 }} className="text-xs text-content-muted text-center leading-relaxed max-w-[300px] mx-auto">
              Find trusted services, jobs, homes, local guides and opportunities from people who understand your journey.
            </Text>

            {/* Feature Columns */}
            <View style={{ marginTop: 24 }} className="flex-row justify-between">
              <FeatureColumn
                name="Services"
                subtext="Access essential expat services"
                pillBg="#FFF3EB"
                pillBorder="#FFE5D4"
                icon="construct"
                iconBg="#F59300"
              />
              <FeatureColumn
                name="Jobs"
                subtext="Discover global career opportunities"
                pillBg="#E6F7F4"
                pillBorder="#CCEFE9"
                icon="briefcase"
                iconBg="#0D7C66"
              />
              <FeatureColumn
                name="Housing"
                subtext="Find a home abroad"
                pillBg="#EDF2FE"
                pillBorder="#D5E1FD"
                icon="home"
                iconBg="#2563EB"
              />
            </View>

            {/* Trust and Scale Metrics Callout */}
            <View style={{ marginTop: 32 }} className="w-full bg-surface-background/70 border border-faint rounded-3xl p-4 flex-row justify-around items-center">
              <View className="items-center">
                <Text className="text-lg font-black text-primary-500">50+</Text>
                <Text className="text-[9px] font-black text-content-muted uppercase tracking-wider mt-0.5">Countries</Text>
              </View>
              <View className="w-px h-8 bg-subtle" />
              <View className="items-center">
                <Text className="text-lg font-black text-[#0D7C66]">10k+</Text>
                <Text className="text-[9px] font-black text-content-muted uppercase tracking-wider mt-0.5">Expats</Text>
              </View>
              <View className="w-px h-8 bg-subtle" />
              <View className="items-center">
                <Text className="text-lg font-black text-blue-600">200+</Text>
                <Text className="text-[9px] font-black text-content-muted uppercase tracking-wider mt-0.5">Local Guides</Text>
              </View>
            </View>
          </View>

          {/* Lower Card Content */}
          <View style={{ marginTop: 20 }} className="w-full">
            {/* CTA Buttons */}
            <View className="flex-col">
              <Button
                label="Join Your Community"
                variant="primary"
                size="lg"
                onPress={handleGetStarted}
                style={{
                  shadowColor: '#F59300',
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.3,
                  shadowRadius: 8,
                  elevation: 4,
                }}
              />

              {/* Already have an account link */}
              <TouchableOpacity
                onPress={() => router.push('/(auth)/login')}
                style={{ marginTop: 12 }}
                className="py-2 items-center active:opacity-75"
              >
                <Text className="text-sm text-content-muted font-medium">
                  Already have an account? <Text className="font-bold text-primary-500">Sign in</Text>
                </Text>
              </TouchableOpacity>
            </View>

            {/* Social Proof */}
            <Text style={{ marginTop: 18 }} className="text-center text-[10px] font-semibold text-content-faint">
              🔒 Private community for people living abroad  ·  Trusted by thousands
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
