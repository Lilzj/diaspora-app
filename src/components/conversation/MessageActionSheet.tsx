/**
 * MessageActionSheet — Long-press context menu for messages
 */

import React from 'react';
import { View, Text, TouchableOpacity, Modal, Pressable, Platform } from 'react-native';
import type { Message } from '@/types/conversation';
import { useThemeTokens } from '@/design-system';

interface Props {
  visible: boolean;
  message: Message | null;
  isCurrentUser: boolean;
  onClose: () => void;
  onReply: () => void;
  onCopy: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onReport: () => void;
}

const actions = [
  { key: 'reply', label: 'Reply', icon: '↩', alwaysShow: true, danger: false },
  { key: 'copy', label: 'Copy Text', icon: '📋', alwaysShow: true, danger: false },
  { key: 'edit', label: 'Edit Message', icon: '✏️', senderOnly: true, danger: false },
  { key: 'delete', label: 'Delete Message', icon: '🗑️', senderOnly: true, danger: true },
  { key: 'report', label: 'Report Message', icon: '⚠️', receiverOnly: true, danger: true },
];

export function MessageActionSheet({
  visible, message, isCurrentUser,
  onClose, onReply, onCopy, onEdit, onDelete, onReport,
}: Props) {
  // Above the early return — a hook after it would run conditionally.
  const tokens = useThemeTokens();

  if (!message) return null;

  const handlers: Record<string, () => void> = {
    reply: onReply,
    copy: onCopy,
    edit: onEdit || (() => {}),
    delete: onDelete || (() => {}),
    report: onReport,
  };

  const visibleActions = actions.filter((a) => {
    if (message.isDeleted && a.key !== 'report') return false;
    if (a.senderOnly && !isCurrentUser) return false;
    if (a.receiverOnly && isCurrentUser) return false;
    return true;
  });

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable
        className="flex-1 justify-end"
        style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
        onPress={onClose}
      >
        <Pressable onPress={() => {}}>
          <View className="bg-surface-card rounded-t-3xl pt-2 pb-8"
            style={{ paddingBottom: Platform.OS === 'ios' ? 34 : 24 }}>
            {/* Handle */}
            <View className="w-10 h-1 bg-subtle rounded-full self-center mb-4" />

            {/* Message preview */}
            {message.text && !message.isDeleted && (
              <View className="mx-4 mb-4 bg-surface-background border border-faint rounded-2xl px-4 py-3">
                <Text className="text-sm text-content-secondary" numberOfLines={2}>{message.text}</Text>
              </View>
            )}

            {/* Actions */}
            {visibleActions.map((action, idx) => (
              <TouchableOpacity
                key={action.key}
                onPress={() => {
                  onClose();
                  setTimeout(() => handlers[action.key]?.(), 200);
                }}
                activeOpacity={0.7}
                className="flex-row items-center px-6 py-4"
                style={{
                  borderTopWidth: idx === 0 ? 0 : 1,
                  borderTopColor: tokens.color.neutral[100],
                }}
              >
                <Text className="text-xl mr-4">{action.icon}</Text>
                <Text
                  className="text-base font-semibold flex-1"
                  style={{
                    color: action.danger ? tokens.color.error.default : tokens.color.text.primary,
                  }}
                >
                  {action.label}
                </Text>
              </TouchableOpacity>
            ))}

            {/* Cancel */}
            <TouchableOpacity
              onPress={onClose}
              activeOpacity={0.7}
              className="mx-4 mt-3 bg-surface-muted rounded-2xl py-4 items-center"
            >
              <Text className="text-base font-bold text-content-tertiary">Cancel</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
