import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Animated, Platform, ScrollView, ScrollViewProps } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useConversationStore, selectTotalUnread } from '@/store/conversation';

export type TabKey = 'home' | 'discover' | 'create' | 'messages' | 'knowledge' | 'profile';

interface ScrollEndNavigationMenuProps {
  visible: boolean;
  activeTab?: TabKey;
}

export function ScrollEndNavigationMenu({ visible, activeTab }: ScrollEndNavigationMenuProps) {
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(120)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  const conversations = useConversationStore((s) => s.conversations);
  const totalUnread = selectTotalUnread(conversations);

  useEffect(() => {
    Animated.parallel([
      Animated.spring(translateY, {
        toValue: visible ? 0 : 120,
        useNativeDriver: Platform.OS !== 'web',
        friction: 8,
        tension: 40,
      }),
      Animated.timing(opacity, {
        toValue: visible ? 1 : 0,
        duration: 200,
        useNativeDriver: Platform.OS !== 'web',
      }),
    ]).start();
  }, [visible]);

  const navItems = [
    { key: 'home', label: 'Home', icon: 'home', iconOutline: 'home-outline', route: '/(tabs)' },
    { key: 'discover', label: 'Discover', icon: 'search', iconOutline: 'search-outline', route: '/(tabs)/discover' },
    { key: 'create', label: 'Create', icon: 'add-circle', iconOutline: 'add-circle-outline', route: '/(tabs)/create' },
    { key: 'messages', label: 'Messages', icon: 'chatbubble-ellipses', iconOutline: 'chatbubble-ellipses-outline', route: '/(tabs)/messages' },
    { key: 'knowledge', label: 'Knowledge', icon: 'book', iconOutline: 'book-outline', route: '/(tabs)/knowledge' },
    { key: 'profile', label: 'Profile', icon: 'person', iconOutline: 'person-outline', route: '/(tabs)/profile' },
  ];

  return (
    <Animated.View
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        transform: [{ translateY }],
        opacity,
        zIndex: 9999,
        elevation: 10,
        flexDirection: 'row',
        justifyContent: 'space-around',
        alignItems: 'center',
        backgroundColor: '#FFFFFF',
        borderTopWidth: 1,
        borderTopColor: '#F3F4F6',
        height: 60 + insets.bottom,
        paddingBottom: insets.bottom || 8,
        paddingTop: 8,
        paddingHorizontal: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
      }}
    >
      {navItems.map((item) => {
        const isActive = activeTab === item.key;
        const iconName = isActive ? item.icon : item.iconOutline;
        const color = isActive ? '#FF6B00' : '#6B7280'; // Primary Orange vs Gray-500

        return (
          <TouchableOpacity
            key={item.key}
            onPress={() => router.replace(item.route as any)}
            style={{
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              flex: 1,
              paddingVertical: 4,
            }}
            className="active:scale-95 transition-transform"
          >
            <View style={{ position: 'relative' }}>
              <Ionicons name={iconName as any} size={22} color={color} />
              {item.key === 'messages' && totalUnread > 0 && (
                <View
                  style={{
                    position: 'absolute',
                    top: -4,
                    right: -6,
                    backgroundColor: '#DC2626',
                    borderRadius: 8,
                    minWidth: 15,
                    height: 15,
                    alignItems: 'center',
                    justifyContent: 'center',
                    paddingHorizontal: 2,
                    borderWidth: 1.5,
                    borderColor: '#FFFFFF',
                  }}
                >
                  <Text style={{ color: '#FFFFFF', fontSize: 8, fontWeight: '900' }}>
                    {totalUnread > 99 ? '99+' : totalUnread}
                  </Text>
                </View>
              )}
            </View>
            <Text
              style={{ color }}
              className={`text-[9px] mt-1 font-extrabold uppercase tracking-wide ${
                isActive ? 'font-black' : ''
              }`}
            >
              {item.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </Animated.View>
  );
}

export const isCloseToBottom = (event: any, threshold = 60) => {
  const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
  return layoutMeasurement.height + contentOffset.y >= contentSize.height - threshold;
};

interface ScrollEndScrollViewProps extends ScrollViewProps {
  activeTab?: TabKey;
  onBottomNavVisibilityChange?: (visible: boolean) => void;
  bottomShieldColor?: string;
}

export const ScrollEndScrollView = React.forwardRef<ScrollView, ScrollEndScrollViewProps>(
  ({ children, activeTab, onScroll, onBottomNavVisibilityChange, bottomShieldColor, ...props }, ref) => {
    const [showBottomNav, setShowBottomNav] = useState(false);
    const insets = useSafeAreaInsets();

    const handleScroll = (event: any) => {
      const isClose = isCloseToBottom(event, 80);
      if (isClose !== showBottomNav) {
        setShowBottomNav(isClose);
        if (onBottomNavVisibilityChange) {
          onBottomNavVisibilityChange(isClose);
        }
      }
      if (onScroll) {
        onScroll(event);
      }
    };

    return (
      <View style={{ flex: 1, position: 'relative' }}>
        <ScrollView
          ref={ref}
          {...props}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          contentContainerStyle={[
            props.contentContainerStyle,
            { paddingBottom: showBottomNav ? 60 + insets.bottom + 20 : insets.bottom + 24 }
          ]}
        >
          {children}
        </ScrollView>
        <ScrollEndNavigationMenu visible={showBottomNav} activeTab={activeTab} />

        {/* Visual shield covering the bottom safe area when the popout nav is hidden */}
        {!showBottomNav && insets.bottom > 0 && (
          <View
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: insets.bottom,
              backgroundColor: bottomShieldColor || '#FFFFFF',
              zIndex: 9998,
            }}
          />
        )}
      </View>
    );
  }
);
