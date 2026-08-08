import React from 'react';
import { View, Text } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TourSpotlight } from '@/components/explore/TourProvider';
import { useConversationStore, selectTotalUnread } from '@/store/conversation';

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const primaryColor = '#F59300'; // Match design system primary-500
  const inactiveColor = '#9CA3AF'; // neutral-400

  const conversations = useConversationStore((s) => s.conversations);
  const totalUnread = selectTotalUnread(conversations);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: primaryColor,
        tabBarInactiveTintColor: inactiveColor,
        headerShown: false,
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '700',
          marginTop: -4,
          marginBottom: 4,
        },
        tabBarStyle: {
          borderTopWidth: 1,
          borderTopColor: '#F3F4F6', // neutral-100
          height: 60 + insets.bottom,
          paddingBottom: insets.bottom || 8,
          paddingTop: 8,
          backgroundColor: '#FFFFFF',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.02,
          shadowRadius: 8,
          elevation: 2,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, focused }) => (
            <TourSpotlight spotlightKey="home_tab">
              <Ionicons name={focused ? 'home' : 'home-outline'} size={22} color={color} />
            </TourSpotlight>
          ),
        }}
      />
      <Tabs.Screen
        name="discover"
        options={{
          title: 'Discover',
          tabBarIcon: ({ color, focused }) => (
            <TourSpotlight spotlightKey="discover_tab">
              <Ionicons name={focused ? 'search' : 'search-outline'} size={22} color={color} />
            </TourSpotlight>
          ),
        }}
      />
      <Tabs.Screen
        name="create"
        options={{
          title: 'Create',
          tabBarIcon: ({ color, focused }) => (
            <TourSpotlight spotlightKey="create_tab">
              <Ionicons name={focused ? 'add-circle' : 'add-circle-outline'} size={26} color={color} />
            </TourSpotlight>
          ),
        }}
      />
      {/* Messages — Position 4: Home → Discover → Create → Messages → Knowledge → Profile */}
      <Tabs.Screen
        name="messages"
        options={{
          title: 'Messages',
          tabBarIcon: ({ color, focused }) => (
            <View style={{ position: 'relative' }}>
              <Ionicons
                name={focused ? 'chatbubble-ellipses' : 'chatbubble-ellipses-outline'}
                size={22}
                color={color}
              />
              {totalUnread > 0 && (
                <View
                  style={{
                    position: 'absolute',
                    top: -4,
                    right: -6,
                    backgroundColor: '#DC2626',
                    borderRadius: 8,
                    minWidth: 16,
                    height: 16,
                    alignItems: 'center',
                    justifyContent: 'center',
                    paddingHorizontal: 3,
                    borderWidth: 1.5,
                    borderColor: '#FFFFFF',
                  }}
                >
                  <Text style={{ color: '#FFFFFF', fontSize: 9, fontWeight: '900' }}>
                    {totalUnread > 99 ? '99+' : totalUnread}
                  </Text>
                </View>
              )}
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="knowledge"
        options={{
          title: 'Knowledge',
          tabBarIcon: ({ color, focused }) => (
            <TourSpotlight spotlightKey="knowledge_tab">
              <Ionicons name={focused ? 'book' : 'book-outline'} size={22} color={color} />
            </TourSpotlight>
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, focused }) => (
            <TourSpotlight spotlightKey="profile_tab">
              <Ionicons name={focused ? 'person' : 'person-outline'} size={22} color={color} />
            </TourSpotlight>
          ),
        }}
      />
      {/* Hidden screens from tab bar navigation */}
      <Tabs.Screen name="search" options={{ href: null }} />
      <Tabs.Screen name="post" options={{ href: null }} />
      <Tabs.Screen name="saved" options={{ href: null }} />
    </Tabs>
  );
}

