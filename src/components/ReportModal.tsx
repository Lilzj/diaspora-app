import React, { useState } from 'react';
import { View, Text, Modal, TextInput, TouchableOpacity, ScrollView, Alert, StyleSheet } from 'react-native';

export interface ReportData {
  category: string;
  reason: string;
  conflictingLink?: string;
}

interface ReportModalProps {
  visible: boolean;
  onClose: () => void;
  contentType: 'Listing' | 'Job' | 'Guide' | 'Update' | 'Comment';
  contentId: string;
  onSubmit: (data: ReportData) => void;
}

const CATEGORIES = [
  { key: 'conflicting', label: '⚔️ Conflicting Information (with another post)' },
  { key: 'inaccurate', label: '📍 Inaccurate / Outdated Details' },
  { key: 'spam', label: '⚠️ Spam or Advertising' },
  { key: 'abusive', label: '🚫 Abusive or Offensive Content' },
  { key: 'other', label: '❓ Other Issues' },
];

export function ReportModal({ visible, onClose, contentType, contentId, onSubmit }: ReportModalProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [conflictingLink, setConflictingLink] = useState<string>('');

  const handleSubmit = () => {
    if (!selectedCategory) {
      Alert.alert('Selection Required', 'Please select a report category.');
      return;
    }

    if (!reason.trim()) {
      Alert.alert('Details Required', 'Please provide supporting details or evidence for your report.');
      return;
    }

    if (selectedCategory === 'conflicting' && !conflictingLink.trim()) {
      Alert.alert('Link Required', 'Please provide a link to the conflicting post.');
      return;
    }

    // Call submit callback
    onSubmit({
      category: selectedCategory,
      reason: reason.trim(),
      conflictingLink: selectedCategory === 'conflicting' ? conflictingLink.trim() : undefined,
    });

    // Reset Form
    setSelectedCategory('');
    setReason('');
    setConflictingLink('');
    
    // Display Success Feedback
    Alert.alert(
      'Report Submitted',
      'Thank you for helping keep our community safe! Our moderators will review this reported content and adjust trust ratings if necessary.'
    );
    
    onClose();
  };

  const handleCancel = () => {
    // Reset Form on close
    setSelectedCategory('');
    setReason('');
    setConflictingLink('');
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={true}
      onRequestClose={handleCancel}
    >
      <View style={styles.overlay}>
        <View style={styles.modalContainer} className="bg-white rounded-3xl p-6 shadow-2xl w-[90%] max-w-[400px]">
          <Text className="text-lg font-black text-neutral-900 mb-1 tracking-tight text-center">
            ⚠️ Report {contentType}
          </Text>
          <Text className="text-xs text-neutral-500 text-center mb-4 font-semibold">
            ID: #{contentId}
          </Text>

          <ScrollView showsVerticalScrollIndicator={false} className="max-h-[350px] mb-4">
            <Text className="text-xs font-bold text-neutral-700 mb-2">Category of Violation:</Text>
            <View className="gap-2 mb-4">
              {CATEGORIES.map((cat) => {
                const isSelected = selectedCategory === cat.key;
                return (
                  <TouchableOpacity
                    key={cat.key}
                    onPress={() => setSelectedCategory(cat.key)}
                    activeOpacity={0.7}
                    className={`p-3 rounded-xl border flex-row items-center ${
                      isSelected
                        ? 'bg-primary-50 border-primary-500'
                        : 'bg-neutral-50 border-neutral-200'
                    }`}
                  >
                    <View className={`w-4 h-4 rounded-full border items-center justify-center mr-3 ${
                      isSelected ? 'border-primary-500 bg-primary-500' : 'border-neutral-300'
                    }`}>
                      {isSelected && <View className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </View>
                    <Text className={`text-xs font-semibold ${isSelected ? 'text-primary-600' : 'text-neutral-700'}`}>
                      {cat.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Conditional Conflicting post URL input */}
            {selectedCategory === 'conflicting' && (
              <View className="mb-4">
                <Text className="text-xs font-bold text-neutral-750 mb-1.5">Link to Conflicting Post *</Text>
                <TextInput
                  value={conflictingLink}
                  onChangeText={setConflictingLink}
                  placeholder="e.g. https://diaspora.app/guide/gd-2"
                  placeholderTextColor="#9CA3AF"
                  className="bg-neutral-50 border border-neutral-200 rounded-xl px-3 py-2.5 text-xs text-neutral-800 font-semibold"
                />
              </View>
            )}

            {/* Detailed description */}
            <View className="mb-2">
              <Text className="text-xs font-bold text-neutral-750 mb-1.5">Supporting Details *</Text>
              <TextInput
                value={reason}
                onChangeText={setReason}
                placeholder="Describe why this content is incorrect, misleading, or inappropriate..."
                placeholderTextColor="#9CA3AF"
                multiline
                numberOfLines={3}
                style={{ textAlignVertical: 'top' }}
                className="bg-neutral-50 border border-neutral-200 rounded-xl px-3 py-2.5 text-xs text-neutral-800 font-semibold min-h-[80px]"
              />
            </View>
          </ScrollView>

          {/* Action Row */}
          <View className="flex-row gap-2 mt-2">
            <TouchableOpacity
              onPress={handleCancel}
              className="flex-1 bg-neutral-100 py-3.5 rounded-2xl items-center justify-center border border-neutral-200"
            >
              <Text className="text-neutral-500 font-bold text-xs">Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleSubmit}
              className="flex-1 bg-primary-500 py-3.5 rounded-2xl items-center justify-center shadow-md shadow-primary-500/10"
            >
              <Text className="text-white font-black text-xs">Submit Report</Text>
            </TouchableOpacity>
          </View>

        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    maxHeight: '90%',
  },
});
