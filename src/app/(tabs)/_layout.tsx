import React from 'react';
import { View, Text } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TourSpotlight } from '@/components/explore/TourProvider';
import { useConversationStore, selectTotalUnread } from '@/store/conversation';
import { useTheme } from '@/design-system';
import {
  NAV_DESTINATIONS,
  NAV_BAR_HEIGHT,
  formatBadgeCount,
} from '@/components/navigation/destinations';

/** Destinations that own a tab. `create` opens a screen, the rest are roots. */
const TAB_ORDER = ['index', 'discover', 'create', 'messages', 'knowledge', 'profile'] as const;

/** Maps an expo-router screen name to its entry in the shared destination list. */
const destinationFor = (screen: string) =>
  NAV_DESTINATIONS[TAB_ORDER.indexOf(screen as (typeof TAB_ORDER)[number])];

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const { tokens } = useTheme();
  const nav = tokens.color.navigation;

  const conversations = useConversationStore((s) => s.conversations);
  const totalUnread = selectTotalUnread(conversations);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: nav.activeLabel,
        tabBarInactiveTintColor: nav.inactive,
        headerShown: false,
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '700',
          marginTop: -4,
          marginBottom: 4,
        },
        tabBarStyle: {
          borderTopWidth: 1,
          borderTopColor: nav.border,
          height: NAV_BAR_HEIGHT + insets.bottom,
          paddingBottom: insets.bottom || tokens.spacing[2],
          paddingTop: tokens.spacing[2],
          backgroundColor: nav.background,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.02,
          shadowRadius: 8,
          elevation: 2,
        },
      }}
    >
      {TAB_ORDER.map((screen) => {
        const dest = destinationFor(screen);
        const isMessages = dest.key === 'messages';

        return (
          <Tabs.Screen
            key={screen}
            name={screen}
            options={{
              title: dest.label,
              tabBarAccessibilityLabel:
                isMessages && totalUnread > 0
                  ? `${dest.label}, ${totalUnread} unread`
                  : dest.label,
              tabBarIcon: ({ color, focused }) => {
                const icon = (
                  <Ionicons
                    name={(focused ? dest.icon : dest.iconOutline) as any}
                    size={dest.iconSize}
                    // `color` is the active/inactive tint resolved by the
                    // navigator, so the icon follows the same tokens.
                    color={focused ? nav.activeIcon : color}
                  />
                );

                if (isMessages) {
                  return (
                    <View style={{ position: 'relative' }}>
                      {icon}
                      {totalUnread > 0 && (
                        <View
                          style={{
                            position: 'absolute',
                            top: -4,
                            right: -6,
                            backgroundColor: nav.badge,
                            borderRadius: tokens.radius.sm,
                            minWidth: 16,
                            height: 16,
                            alignItems: 'center',
                            justifyContent: 'center',
                            paddingHorizontal: 3,
                            borderWidth: 1.5,
                            borderColor: nav.background,
                          }}
                        >
                          <Text style={{ color: nav.onBadge, fontSize: 9, fontWeight: '900' }}>
                            {formatBadgeCount(totalUnread)}
                          </Text>
                        </View>
                      )}
                    </View>
                  );
                }

                return <TourSpotlight spotlightKey={`${dest.key}_tab`}>{icon}</TourSpotlight>;
              },
            }}
          />
        );
      })}

      {/* Reachable by route but not represented in the tab bar. */}
      <Tabs.Screen name="search" options={{ href: null }} />
      <Tabs.Screen name="post" options={{ href: null }} />
      <Tabs.Screen name="saved" options={{ href: null }} />
    </Tabs>
  );
}
