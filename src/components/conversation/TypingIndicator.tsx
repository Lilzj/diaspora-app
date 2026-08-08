/**
 * TypingIndicator — Animated three-dot indicator
 */

import React, { useEffect, useRef } from 'react';
import { View, Text, Animated } from 'react-native';

interface Props {
  label?: string;
}

export function TypingIndicator({ label = 'Typing...' }: Props) {
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const bounce = (dot: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, { toValue: -6, duration: 250, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0, duration: 250, useNativeDriver: true }),
          Animated.delay(500),
        ])
      );

    const a1 = bounce(dot1, 0);
    const a2 = bounce(dot2, 120);
    const a3 = bounce(dot3, 240);

    a1.start();
    a2.start();
    a3.start();

    return () => {
      a1.stop();
      a2.stop();
      a3.stop();
    };
  }, []);

  return (
    <View className="flex-row items-center px-4 pb-2">
      <View className="bg-neutral-100 rounded-2xl px-4 py-3 flex-row items-center"
        style={{ borderRadius: 20, borderBottomLeftRadius: 4 }}>
        <View className="flex-row items-center mr-2">
          {[dot1, dot2, dot3].map((dot, i) => (
            <Animated.View
              key={i}
              style={{
                transform: [{ translateY: dot }],
                width: 7,
                height: 7,
                borderRadius: 3.5,
                backgroundColor: '#9BA3B8',
                marginHorizontal: 2,
              }}
            />
          ))}
        </View>
      </View>
      <Text className="text-xs text-neutral-400 font-semibold ml-2">{label}</Text>
    </View>
  );
}
