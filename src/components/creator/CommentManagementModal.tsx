import React, { useState } from 'react';
import { View, Text, Modal, TouchableOpacity, ScrollView, TextInput, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNotification } from '@/providers/notification-provider';
import { UnifiedContentItem, ContentComment } from '@/types/creator';
import { mockCommentsMap } from '@/mocks/creator-data';

interface CommentManagementModalProps {
  item: UnifiedContentItem | null;
  visible: boolean;
  onClose: () => void;
}

export const CommentManagementModal: React.FC<CommentManagementModalProps> = ({ item, visible, onClose }) => {
  if (!item) return null;

  const insets = useSafeAreaInsets();
  const { showToast } = useNotification();
  const [comments, setComments] = useState<ContentComment[]>(mockCommentsMap[item.id] || [
    {
      id: 'cm-def-1',
      contentId: item.id,
      authorName: 'Aisha Bello',
      authorAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80',
      text: 'Is this still active? Sending you a quick message regarding local details.',
      timestamp: '4 hours ago',
      isPinned: false,
      isReported: false,
      repliesCount: 0,
    },
  ]);

  const [replyText, setReplyText] = useState('');
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);

  const handleTogglePin = (id: string) => {
    setComments((prev) =>
      prev.map((c) => (c.id === id ? { ...c, isPinned: !c.isPinned } : c))
    );
    showToast({ type: 'success', title: 'Updated', message: 'Comment pin status toggled.' });
  };

  const handleReport = (id: string) => {
    setComments((prev) =>
      prev.map((c) => (c.id === id ? { ...c, isReported: true } : c))
    );
    showToast({ type: 'warning', title: 'Reported', message: 'Flagged for moderation queue review.' });
  };

  const handleSendReply = () => {
    if (!replyText.trim()) return;
    showToast({ type: 'success', title: 'Reply Sent', message: `Published reply: "${replyText.trim()}"` });
    setReplyText('');
    setActiveCommentId(null);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity activeOpacity={1} onPress={onClose} className="flex-1 bg-black/50 justify-end">
        <TouchableOpacity
          activeOpacity={1}
          style={{ paddingBottom: Math.max(insets.bottom + 16, 28) }}
          className="bg-white rounded-t-3xl p-6 max-h-[85%]"
        >
          {/* Drag Handle Indicator */}
          <View className="w-12 h-1.5 bg-neutral-200 rounded-full self-center mb-3" />

          {/* Header */}
          <View className="flex-row justify-between items-center pb-4 border-b border-neutral-100 mb-4">
            <View className="flex-1 mr-2">
              <Text className="text-xs font-black text-primary-500 uppercase tracking-wider">Comment Management</Text>
              <Text className="text-base font-black text-neutral-900 leading-snug" numberOfLines={1}>{item.title}</Text>
            </View>
            <TouchableOpacity onPress={onClose} className="bg-neutral-100 p-2 rounded-full">
              <Text className="text-xs font-black text-neutral-600">✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 16 }}>
            {comments.map((cm) => (
              <View key={cm.id} className="bg-neutral-50 border border-neutral-200 rounded-2xl p-4 mb-3">
                <View className="flex-row justify-between items-start mb-2">
                  <View className="flex-row items-center">
                    <Image source={{ uri: cm.authorAvatar }} className="w-8 h-8 rounded-full mr-2.5 bg-neutral-200" />
                    <View>
                      <View className="flex-row items-center">
                        <Text className="text-xs font-bold text-neutral-900 mr-1.5">{cm.authorName}</Text>
                        {cm.isPinned && <Text className="text-[9px] bg-amber-100 text-amber-800 px-1.5 py-0.2 rounded font-black">📌 PINNED</Text>}
                      </View>
                      <Text className="text-[9px] text-neutral-400 font-semibold">{cm.timestamp}</Text>
                    </View>
                  </View>

                  <View className="flex-row gap-2">
                    <TouchableOpacity onPress={() => handleTogglePin(cm.id)} className="p-1">
                      <Text className="text-xs">📌</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleReport(cm.id)} className="p-1">
                      <Text className="text-xs">🚩</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                <Text className="text-xs text-neutral-700 leading-relaxed mb-3">{cm.text}</Text>

                {/* Reply Input or trigger */}
                {activeCommentId === cm.id ? (
                  <View className="mt-2 flex-row gap-2">
                    <TextInput
                      value={replyText}
                      onChangeText={setReplyText}
                      placeholder="Write public creator response..."
                      placeholderTextColor="#9CA3AF"
                      className="flex-1 bg-white border border-primary-500 rounded-xl px-3 py-1.5 text-xs font-semibold"
                    />
                    <TouchableOpacity onPress={handleSendReply} className="bg-primary-500 px-3 py-1.5 rounded-xl justify-center">
                      <Text className="text-xs font-black text-white">Send</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity onPress={() => setActiveCommentId(cm.id)} className="self-start">
                    <Text className="text-[10px] font-black text-primary-500 uppercase">💬 Reply to comment →</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}

            {comments.length === 0 && (
              <View className="items-center py-8">
                <Text className="text-xs font-bold text-neutral-500">No reader comments yet.</Text>
              </View>
            )}
          </ScrollView>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};
