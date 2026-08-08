/**
 * FloatingNewMessageBadge — "↓ 2 New Messages" indicator when scrolled up
 */

import React from 'react';
import { TouchableOpacity, Text, Animated } from 'react-native';

interface Props {
  count: number;
  onPress: () => void;
}

export function FloatingNewMessageBadge({ count, onPress }: Props) {
  if (count <= 0) return null;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={{
        position: 'absolute',
        bottom: 80,
        alignSelf: 'center',
        backgroundColor: '#F59300',
        borderRadius: 20,
        paddingHorizontal: 16,
        paddingVertical: 8,
        flexDirection: 'row',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 8,
        elevation: 6,
      }}
    >
      <Text className="text-white font-black text-sm">
        ↓ {count} New {count === 1 ? 'Message' : 'Messages'}
      </Text>
    </TouchableOpacity>
  );
}
