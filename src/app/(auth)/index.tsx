import React from 'react';
import { View, Text, Animated, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import Svg, { Path, Circle, Defs, LinearGradient, Stop } from 'react-native-svg';

export default function WelcomeScreen() {
  const scaleAnim = React.useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.96,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
    }).start();
  };

  const handleGetStarted = () => {
    router.push('/(auth)/login');
  };

  const handleBrowseGuest = () => {
    router.push('/(tabs)');
  };

  return (
    <SafeAreaView className="flex-1 bg-[#FAFAFA]">
      <StatusBar style="dark" />

      {/* Hero Illustration Container (Fixed height to prevent compression issues on web/viewport) */}
      <View className="h-[45%] items-center justify-center px-6 relative">
        <View className="absolute inset-0 items-center justify-center opacity-40">
          {/* Subtle background glow */}
          <Svg height="100%" width="100%" viewBox="0 0 400 400">
            <Circle cx="200" cy="200" r="160" fill="url(#glowGradient)" />
            <Defs>
              <LinearGradient id="glowGradient" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0%" stopColor="#FFE5D9" stopOpacity="0.8" />
                <Stop offset="100%" stopColor="#FFF0EB" stopOpacity="0" />
              </LinearGradient>
            </Defs>
          </Svg>
        </View>

        {/* Connection Network Vector Illustration */}
        <Svg height="200" width="100%" viewBox="0 0 350 200">
          <Defs>
            <LinearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0%" stopColor="#FF6B00" stopOpacity="0.2" />
              <Stop offset="50%" stopColor="#FF6B00" stopOpacity="0.8" />
              <Stop offset="100%" stopColor="#FF8533" stopOpacity="0.2" />
            </LinearGradient>
            <LinearGradient id="logoGrad" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0%" stopColor="#FF6B00" />
              <Stop offset="100%" stopColor="#FF8533" />
            </LinearGradient>
          </Defs>

          {/* Connection Lines representing global movements */}
          <Path
            d="M 50 100 C 100 40, 200 40, 300 100"
            fill="none"
            stroke="url(#lineGrad)"
            strokeWidth="2"
            strokeDasharray="4 4"
          />
          <Path
            d="M 80 120 C 130 70, 220 70, 270 120"
            fill="none"
            stroke="url(#lineGrad)"
            strokeWidth="1.5"
          />
          <Path
            d="M 120 140 C 150 110, 200 110, 230 140"
            fill="none"
            stroke="url(#lineGrad)"
            strokeWidth="1"
            strokeDasharray="2 2"
          />

          {/* Connected Community Nodes */}
          <Circle cx="50" cy="100" r="5" fill="#FF8533" opacity="0.6" />
          <Circle cx="300" cy="100" r="5" fill="#FF8533" opacity="0.6" />
          <Circle cx="80" cy="120" r="4" fill="#FF6B00" opacity="0.8" />
          <Circle cx="270" cy="120" r="4" fill="#FF6B00" opacity="0.8" />

          {/* Location pins connecting people */}
          <Circle cx="150" cy="70" r="6" fill="#FF6B00" />
          <Path d="M 150 70 L 150 90" stroke="#FF6B00" strokeWidth="2" />
          <Circle cx="150" cy="90" r="2" fill="#FF6B00" />

          <Circle cx="200" cy="65" r="7" fill="#FF8533" />
          <Path d="M 200 65 L 200 88" stroke="#FF8533" strokeWidth="2" />
          <Circle cx="200" cy="88" r="2" fill="#FF8533" />
        </Svg>
      </View>

      {/* Content Area (Using flex-1 with standard padding to guarantee visibility of buttons) */}
      <View className="px-6 pb-10 pt-8 bg-white rounded-t-[32px] shadow-2xl border-t border-neutral-100 flex-1 justify-between -mt-6">
        <View className="items-center mt-2">
          {/* Logo */}
          <View className="w-14 h-14 bg-primary-50 rounded-2xl items-center justify-center mb-4 border border-primary-100">
            <Svg height="32" width="32" viewBox="0 0 24 24">
              <Path
                d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"
                fill="url(#logoGrad)"
              />
            </Svg>
          </View>
          
          <Text className="text-3xl font-extrabold text-neutral-900 tracking-tight text-center">
            Diaspora
          </Text>
          <Text className="text-sm font-semibold text-primary-500 uppercase tracking-widest mt-1 mb-3">
            Community Knowledge
          </Text>
          <Text className="text-base text-neutral-500 text-center leading-relaxed max-w-[280px]">
            Helping you feel at home wherever you are.
          </Text>
        </View>

        {/* Buttons Action Group (Removed Pressable nested scale complexity to make it robust on Web/Native) */}
        <View className="flex-col gap-4 mt-6">
          <TouchableOpacity
            onPress={handleGetStarted}
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            activeOpacity={0.9}
            className="w-full"
          >
            <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
              <View className="w-full bg-primary-500 py-4 rounded-2xl items-center justify-center shadow-lg shadow-primary-500/20">
                <Text className="text-white font-bold text-base">Get Started</Text>
              </View>
            </Animated.View>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleBrowseGuest}
            activeOpacity={0.8}
            className="w-full border border-neutral-200 py-4 rounded-2xl items-center justify-center bg-white"
          >
            <Text className="text-neutral-700 font-semibold text-base">Browse as Guest</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}
