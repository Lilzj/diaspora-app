import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity } from 'react-native';

import { useThemeTokens } from '@/design-system';

interface TagEditorProps {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  placeholder: string;
  /** The server's limit on how many it keeps. */
  max: number;
  /** The server's limit on one entry's length. */
  maxLength?: number;
  testID?: string;
  /** The text box, so a screen can focus it (the creator profile's Edit profile buttons). */
  inputRef?: React.Ref<TextInput>;
}

/**
 * A short list of words a member types in themselves: expertise, languages.
 *
 * Added 20 Oct 2026 for the creator profile, whose "Edit profile" buttons led
 * back to read-only rows: the lists the server accepted had no way to be set.
 * Type and press Add (or return); each entry is a chip with a remove button.
 * Duplicates are ignored, whatever their capitals.
 */
export function TagEditor({ label, values, onChange, placeholder, max, maxLength = 64, testID, inputRef }: TagEditorProps) {
  const tokens = useThemeTokens();
  const [draft, setDraft] = useState('');
  const isFull = values.length >= max;

  const add = () => {
    const value = draft.trim();
    if (!value || isFull) return;
    if (!values.some((existing) => existing.toLowerCase() === value.toLowerCase())) {
      onChange([...values, value]);
    }
    setDraft('');
  };

  return (
    <View className="mb-4" testID={testID}>
      <Text className="text-xs font-bold text-content-secondary mb-2">{label}</Text>

      {values.length > 0 ? (
        <View className="flex-row flex-wrap mb-2">
          {values.map((value) => (
            <View
              key={value}
              className="flex-row items-center bg-surface-muted border border-subtle rounded-full pl-3 pr-1 py-1 mr-2 mb-2"
            >
              <Text className="text-xs font-semibold text-content-primary">{value}</Text>
              <TouchableOpacity
                onPress={() => onChange(values.filter((existing) => existing !== value))}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${value}`}
                className="ml-1 px-1.5"
              >
                <Text className="text-xs text-content-muted">✕</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      ) : null}

      {isFull ? (
        <Text className="text-[11px] text-content-muted">That is the most Diaspora keeps ({max}).</Text>
      ) : (
        <View className="flex-row items-center">
          <TextInput
            ref={inputRef}
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={add}
            placeholder={placeholder}
            placeholderTextColor={tokens.color.text.placeholder}
            maxLength={maxLength}
            returnKeyType="done"
            accessibilityLabel={label}
            className="flex-1 border border-subtle rounded-xl px-3 py-2.5 text-sm bg-surface-background"
            style={{ color: tokens.color.text.primary }}
          />
          <TouchableOpacity
            onPress={add}
            disabled={!draft.trim()}
            accessibilityRole="button"
            accessibilityLabel={`Add to ${label}`}
            className={`ml-2 px-4 py-2.5 rounded-xl ${draft.trim() ? 'bg-primary-500' : 'bg-surface-muted'}`}
          >
            <Text className={`text-xs font-bold ${draft.trim() ? 'text-white' : 'text-content-faint'}`}>Add</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}
