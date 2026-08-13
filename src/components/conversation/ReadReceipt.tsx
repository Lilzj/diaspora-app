/**
 * ReadReceipt — Message delivery/read status icons
 * Only shown to the sender.
 */

import React from 'react';
import { View, Text } from 'react-native';
import type { MessageStatus } from '@/types/conversation';

interface Props {
  status: MessageStatus;
  size?: 'xs' | 'sm' | 'md';
}

export function ReadReceipt({ status, size = 'sm' }: Props) {
  const fontSize = size === 'xs' ? 9 : size === 'sm' ? 11 : 13;

  if (status === 'queued' || status === 'sending') {
    return (
      <Text style={{ fontSize }} className="text-content-faint">⏳</Text>
    );
  }
  if (status === 'failed') {
    return (
      <Text style={{ fontSize }} className="text-red-500">⚠</Text>
    );
  }
  if (status === 'sent') {
    return (
      <Text style={{ fontSize, color: '#9BA3B8' }}>✓</Text>
    );
  }
  if (status === 'delivered') {
    return (
      <Text style={{ fontSize, color: '#9BA3B8' }}>✓✓</Text>
    );
  }
  if (status === 'read') {
    return (
      <Text style={{ fontSize, color: '#0D7C66' }}>✓✓</Text>
    );
  }
  return null;
}
