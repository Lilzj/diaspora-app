import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, Animated } from 'react-native';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { Ionicons } from '@expo/vector-icons';
import { relativeTime } from '@/components/community-social';

interface NotificationItemProps {
  title: string;
  body: string;
  category: string;
  isRead: boolean;
  /**
   * When it arrived, as an ISO timestamp.
   *
   * **Formatted here, not by the caller.** Until 12 Sep 2026 this was printed
   * raw, so every row of the inbox read
   * `2026-09-12T11:17:39.610416+00:00`. It went unnoticed because the screen
   * used to read a fixture store that handed it a pre-formatted "2h ago"; the
   * day the inbox was wired to the real route, the shape changed underneath and
   * nothing typechecked differently, because both are strings.
   */
  createdAt: string;
  onPress?: () => void;
  onDelete?: () => void;
  shouldPeek?: boolean;
}

const categoryIcons: Record<string, string> = {
  Review: '⭐',
  Verification: '✓',
  Listing: '📋',
  Announcement: '📢',
  AccountAlert: '🔒',
  Promotion: '🎁',
};

export function NotificationItem({
  title,
  body,
  category,
  isRead,
  createdAt,
  onPress,
  onDelete,
  shouldPeek = false,
}: NotificationItemProps) {
  const peekAnim = useRef(new Animated.Value(0)).current;
  const swipeableRef = useRef<Swipeable>(null);

  useEffect(() => {
    if (shouldPeek) {
      // Perform a small sequence to draw attention: slide left slightly, hold, slide back
      Animated.sequence([
        Animated.delay(600),
        Animated.timing(peekAnim, {
          toValue: -40,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.delay(500),
        Animated.timing(peekAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [shouldPeek]);

  const renderRightActions = (
    _progress: Animated.AnimatedInterpolation<number>,
    dragX: Animated.AnimatedInterpolation<number>
  ) => {
    const scale = dragX.interpolate({
      inputRange: [-80, 0],
      outputRange: [1, 0],
      extrapolate: 'clamp',
    });

    return (
      <TouchableOpacity
        onPress={() => {
          swipeableRef.current?.close();
          if (onDelete) onDelete();
        }}
        activeOpacity={0.8}
        className="bg-red-500 justify-center items-center w-20 h-full flex-row"
      >
        <Animated.View style={{ transform: [{ scale }], alignItems: 'center' }}>
          <Ionicons name="trash-outline" size={18} color="#FFF" />
          <Text className="text-[9px] font-black text-white mt-1 uppercase tracking-wider">Delete</Text>
        </Animated.View>
      </TouchableOpacity>
    );
  };

  const itemContent = (
    <Animated.View style={{ transform: [{ translateX: peekAnim }] }}>
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.7}
        className={`flex-row p-4 border-b border-faint items-start ${
          !isRead ? 'bg-surface-muted' : 'bg-surface-card'
        }`}
      >
        <View className="w-10 h-10 rounded-full bg-surface-muted items-center justify-center mr-3 mt-0.5">
          <Text className="text-lg">{categoryIcons[category] ?? '🔔'}</Text>
        </View>
        
        <View className="flex-1 mr-1">
          <Text className={`text-sm ${!isRead ? 'font-bold text-content-primary' : 'font-semibold text-content-secondary'}`}>
            {title}
          </Text>
          <Text className="text-xs text-content-muted mt-1 leading-relaxed" numberOfLines={2}>
            {body}
          </Text>
          <Text className="text-[10px] text-content-faint mt-1.5 font-bold uppercase tracking-wider">
            {relativeTime(createdAt)}
          </Text>
        </View>

        <View className="flex-row items-center ml-2 self-center h-full">
          {!isRead && <View className="w-2 h-2 rounded-full bg-primary-500 mr-2" />}
          {onDelete && (
            <Text className="text-content-faint text-xs font-black mr-1" style={{ fontSize: 10 }}>
              ⇠ Swipe
            </Text>
          )}
        </View>
      </TouchableOpacity>
    </Animated.View>
  );

  if (onDelete) {
    return (
      <Swipeable
        ref={swipeableRef}
        renderRightActions={renderRightActions}
        friction={2}
        rightThreshold={30}
      >
        {itemContent}
      </Swipeable>
    );
  }

  return itemContent;
}
