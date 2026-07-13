import React from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Svg, { Path, Rect, Circle, Defs, LinearGradient, Stop } from 'react-native-svg';

export default function CreateSelectorScreen() {
  const options = [
    {
      id: 'listing',
      title: 'Provider Listing',
      desc: 'Add a new business, professional, or service.',
      value: 'Supports diaspora-owned shops and helps the community discover trusted service providers.',
      badge: '📍 DIRECTORY',
      route: '/post',
      icon: (
        <Svg height="40" width="40" viewBox="0 0 24 24">
          <Defs>
            <LinearGradient id="listingGrad" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0%" stopColor="#FF6B00" />
              <Stop offset="100%" stopColor="#FFA600" />
            </LinearGradient>
          </Defs>
          <Path
            d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"
            fill="url(#listingGrad)"
          />
        </Svg>
      ),
    },
    {
      id: 'guide',
      title: 'Community Guide',
      desc: 'Share your knowledge in a long-form article.',
      value: 'Helps newcomers settle in seamlessly with visa, housing, transit, and local culture guides.',
      badge: '📖 EVERGREEN',
      route: '/guide/create',
      icon: (
        <Svg height="40" width="40" viewBox="0 0 24 24">
          <Defs>
            <LinearGradient id="guideGrad" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0%" stopColor="#2563EB" />
              <Stop offset="100%" stopColor="#3B82F6" />
            </LinearGradient>
          </Defs>
          <Path
            d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"
            fill="url(#guideGrad)"
          />
        </Svg>
      ),
    },
    {
      id: 'update',
      title: 'Community Update',
      desc: 'Post a quick, time-sensitive warning or alert.',
      value: 'Keeps the neighborhood safe and informed on traffic, police checkpoints, or price changes.',
      badge: '📢 REAL-TIME',
      route: '/update/create',
      icon: (
        <Svg height="40" width="40" viewBox="0 0 24 24">
          <Defs>
            <LinearGradient id="updateGrad" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0%" stopColor="#DC2626" />
              <Stop offset="100%" stopColor="#EF4444" />
            </LinearGradient>
          </Defs>
          <Path
            d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"
            fill="url(#updateGrad)"
          />
        </Svg>
      ),
    },
    {
      id: 'job',
      title: 'Jobs & Opportunities',
      desc: 'Post an employment option, temporary gig, or shift.',
      value: 'Helps community members discover nearby work, gigs, and opportunities to support themselves.',
      badge: '💼 WORK & GIGS',
      route: '/job/create',
      icon: (
        <Svg height="40" width="40" viewBox="0 0 24 24">
          <Defs>
            <LinearGradient id="jobGrad" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0%" stopColor="#0D7C66" />
              <Stop offset="100%" stopColor="#3DD4B3" />
            </LinearGradient>
          </Defs>
          <Path
            d="M20 6h-4V4c0-1.11-.89-2-2-2h-4c-1.11 0-2 .89-2 2v2H4c-1.11 0-1.99.89-1.99 2L2 19c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zm-6 0h-4V4h4v2z"
            fill="url(#jobGrad)"
          />
        </Svg>
      ),
    },
  ];

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-neutral-50/40">
      <View className="px-6 py-4">
        <Text className="text-3xl font-extrabold text-neutral-900 tracking-tight">Create Post</Text>
        <Text className="text-sm text-neutral-500 mt-1 leading-relaxed">
          What would you like to contribute to the diaspora community today?
        </Text>
      </View>
      <ScrollView className="flex-1 px-6 mt-2" showsVerticalScrollIndicator={false}>
        {options.map((opt) => (
          <TouchableOpacity
            key={opt.id}
            onPress={() => router.push(opt.route as any)}
            activeOpacity={0.9}
            className="flex-row items-start p-5 mb-5 bg-white rounded-3xl border border-neutral-100 shadow-sm shadow-neutral-100"
          >
            {/* SVG Illustration wrapper */}
            <View className="bg-neutral-50 p-3 rounded-2xl border border-neutral-100 mr-4">
              {opt.icon}
            </View>

            <View className="flex-1">
              <View className="flex-row items-center mb-1">
                <Text className="text-[10px] font-extrabold text-primary-500 tracking-wider mr-2 bg-primary-50 px-2 py-0.5 rounded">
                  {opt.badge}
                </Text>
              </View>
              <Text className="text-base font-extrabold text-neutral-900 leading-snug">{opt.title}</Text>
              <Text className="text-sm text-neutral-600 mt-1 leading-relaxed">{opt.desc}</Text>
              
              {/* Value proposition to the community */}
              <View className="mt-3.5 pt-2.5 border-t border-neutral-50">
                <Text className="text-xs text-neutral-400 font-medium italic leading-relaxed">
                  🤝 Value: {opt.value}
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        ))}
        <View className="h-8" />
      </ScrollView>
    </SafeAreaView>
  );
}
