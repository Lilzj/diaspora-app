import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';

interface AvatarProps {
  /** The photo's address. Initials are drawn when it is absent. */
  uri?: string | null;
  name?: string;
  size?: number;
}

export function Avatar({ uri, name, size = 48 }: AvatarProps) {
  const initials = name
    ? name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .substring(0, 2)
        .toUpperCase()
    : '?';

  return (
    <View
      style={{ width: size, height: size, borderRadius: size / 2 }}
      className="bg-surface-muted items-center justify-center overflow-hidden"
    >
      {uri ? (
        <Image source={{ uri }} style={{ width: size, height: size }} contentFit="cover" />
      ) : (
        <Text
          style={{ fontSize: size * 0.36 }}
          className="text-primary-600 font-bold"
        >
          {initials}
        </Text>
      )}
    </View>
  );
}
