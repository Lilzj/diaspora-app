import React, { useState } from 'react';
import { useNotification } from '@/providers/notification-provider';
import { View, Text, TextInput, TouchableOpacity } from 'react-native';
import { lightTokens } from '@/design-system';
import { Sheet } from '@/components/overlays/AppModal';
import { Button } from '@/components/Button';

export interface ReportData {
  category: string;
  reason: string;
  conflictingLink?: string;
}

interface ReportModalProps {
  visible: boolean;
  onClose: () => void;
  contentType: 'Listing' | 'Job' | 'Guide' | 'Update' | 'Comment' | 'Housing' | 'Marketplace';
  contentId: string;
  onSubmit: (data: ReportData) => void;
}

const CATEGORIES = [
  { key: 'conflicting', label: 'Conflicting information (with another post)' },
  { key: 'inaccurate', label: 'Inaccurate or outdated details' },
  { key: 'spam', label: 'Spam or advertising' },
  { key: 'abusive', label: 'Abusive or offensive content' },
  { key: 'other', label: 'Other issues' },
];

type Errors = { category?: string; reason?: string; conflictingLink?: string };

export function ReportModal({ visible, onClose, contentType, contentId, onSubmit }: ReportModalProps) {
  const { showAlert } = useNotification();
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [conflictingLink, setConflictingLink] = useState<string>('');
  const [errors, setErrors] = useState<Errors>({});

  const reset = () => {
    setSelectedCategory('');
    setReason('');
    setConflictingLink('');
    setErrors({});
  };

  const handleSubmit = () => {
    // Validation was three sequential `Alert.alert` calls, which surfaced one
    // problem at a time, said nothing about *which* field, and left no marker
    // on the field once dismissed.
    const next: Errors = {};
    if (!selectedCategory) next.category = 'Choose a category.';
    if (!reason.trim()) next.reason = 'Add supporting details for your report.';
    if (selectedCategory === 'conflicting' && !conflictingLink.trim()) {
      next.conflictingLink = 'Add a link to the conflicting post.';
    }

    setErrors(next);
    if (Object.keys(next).length > 0) return;

    onSubmit({
      category: selectedCategory,
      reason: reason.trim(),
      conflictingLink: selectedCategory === 'conflicting' ? conflictingLink.trim() : undefined,
    });

    reset();

    showAlert({ type: 'success', title: 'Report submitted', message: 'Thank you for helping keep our community safe. Our moderators will review this content and adjust trust ratings if necessary.' });

    onClose();
  };

  const handleCancel = () => {
    reset();
    onClose();
  };

  return (
    <Sheet
      visible={visible}
      onClose={handleCancel}
      title={`Report ${contentType.toLowerCase()}`}
      subtitle={`Reference #${contentId}`}
      testID="report-modal"
      footer={
        <View className="flex-row" style={{ gap: 8 }}>
          <View className="flex-1">
            <Button label="Cancel" variant="outline" onPress={handleCancel} />
          </View>
          <View className="flex-1">
            <Button label="Submit report" onPress={handleSubmit} />
          </View>
        </View>
      }
    >
      <Text className="text-xs font-bold text-content-secondary mb-2">Category of violation</Text>

      <View accessibilityRole="radiogroup" className="mb-1" style={{ gap: 8 }}>
        {CATEGORIES.map((cat) => {
          const isSelected = selectedCategory === cat.key;
          return (
            <TouchableOpacity
              key={cat.key}
              onPress={() => {
                setSelectedCategory(cat.key);
                setErrors((e) => ({ ...e, category: undefined }));
              }}
              activeOpacity={0.7}
              // These behave as radios but announced as plain views, so a
              // screen reader gave no way to tell which one was chosen.
              accessibilityRole="radio"
              accessibilityLabel={cat.label}
              accessibilityState={{ checked: isSelected, selected: isSelected }}
              style={{ minHeight: 44 }}
              className={`p-3 rounded-xl border flex-row items-center ${
                isSelected ? 'bg-primary-50 border-primary-500' : 'bg-surface-background border-subtle'
              }`}
            >
              <View
                className={`w-4 h-4 rounded-full border items-center justify-center mr-3 ${
                  isSelected ? 'border-primary-500 bg-primary-500' : 'border-line'
                }`}
              >
                {isSelected && <View className="w-1.5 h-1.5 rounded-full bg-surface-card" />}
              </View>
              <Text
                className={`text-xs font-semibold flex-1 ${
                  isSelected ? 'text-primary-600' : 'text-content-secondary'
                }`}
              >
                {cat.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {!!errors.category && (
        <Text
          className="text-xs text-error-default mb-2"
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
        >
          {errors.category}
        </Text>
      )}

      {selectedCategory === 'conflicting' && (
        <View className="mb-4 mt-3">
          {/* Was `text-neutral-750`, which is not a step in the palette, so the
              class resolved to nothing and the label rendered unstyled. */}
          <Text className="text-xs font-bold text-content-secondary mb-1.5">
            Link to conflicting post *
          </Text>
          <TextInput
            value={conflictingLink}
            onChangeText={(t) => {
              setConflictingLink(t);
              setErrors((e) => ({ ...e, conflictingLink: undefined }));
            }}
            placeholder="e.g. https://diaspora.app/guide/gd-2"
            placeholderTextColor={lightTokens.color.text.placeholder}
            accessibilityLabel="Link to conflicting post"
            autoCapitalize="none"
            keyboardType="url"
            className="bg-surface-background border border-subtle rounded-xl px-3 py-2.5 text-xs text-content-strong font-semibold"
          />
          {!!errors.conflictingLink && (
            <Text
              className="text-xs text-error-default mt-1"
              accessibilityLiveRegion="polite"
              accessibilityRole="alert"
            >
              {errors.conflictingLink}
            </Text>
          )}
        </View>
      )}

      <View className="mb-2 mt-3">
        <Text className="text-xs font-bold text-content-secondary mb-1.5">Supporting details *</Text>
        <TextInput
          value={reason}
          onChangeText={(t) => {
            setReason(t);
            setErrors((e) => ({ ...e, reason: undefined }));
          }}
          placeholder="Describe why this content is incorrect, misleading, or inappropriate…"
          placeholderTextColor={lightTokens.color.text.placeholder}
          accessibilityLabel="Supporting details"
          multiline
          numberOfLines={3}
          style={{ textAlignVertical: 'top' }}
          className="bg-surface-background border border-subtle rounded-xl px-3 py-2.5 text-xs text-content-strong font-semibold min-h-[80px]"
        />
        {!!errors.reason && (
          <Text
            className="text-xs text-error-default mt-1"
            accessibilityLiveRegion="polite"
            accessibilityRole="alert"
          >
            {errors.reason}
          </Text>
        )}
      </View>
    </Sheet>
  );
}
