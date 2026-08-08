/**
 * ConnectionBanner — WhatsApp-style connection status bar
 * Shows: Connecting... | Connected | Disconnected | Reconnecting...
 */

import React, { useEffect, useState } from 'react';
import { View, Text, Animated } from 'react-native';
import type { ConnectionState } from '@/types/conversation';

interface Props {
  state: ConnectionState;
}

const BANNER_CONFIG: Record<ConnectionState, { label: string; bg: string; text: string; show: boolean }> = {
  connecting: { label: 'Connecting...', bg: '#D97706', text: '#FFFFFF', show: true },
  connected: { label: '✓ Connected', bg: '#16A34A', text: '#FFFFFF', show: true },
  disconnected: { label: 'Connection lost', bg: '#DC2626', text: '#FFFFFF', show: true },
  reconnecting: { label: 'Reconnecting...', bg: '#D97706', text: '#FFFFFF', show: true },
};

export function ConnectionBanner({ state }: Props) {
  const [visible, setVisible] = useState(false);
  const opacity = React.useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (state !== 'connected' || visible) {
      setVisible(true);
      Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: true }).start();

      if (state === 'connected') {
        // Auto-hide after 2s when connected
        const timer = setTimeout(() => {
          Animated.timing(opacity, { toValue: 0, duration: 400, useNativeDriver: true }).start(() => {
            setVisible(false);
          });
        }, 2000);
        return () => clearTimeout(timer);
      }
    }
  }, [state]);

  if (!visible) return null;

  const config = BANNER_CONFIG[state];

  return (
    <Animated.View style={{ opacity }}>
      <View
        className="items-center justify-center py-1.5"
        style={{ backgroundColor: config.bg }}
      >
        <Text style={{ color: config.text, fontSize: 12, fontWeight: '700' }}>
          {config.label}
        </Text>
      </View>
    </Animated.View>
  );
}
