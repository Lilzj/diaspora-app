import React from 'react';
import { View, Text, TextInput, TouchableOpacity } from 'react-native';

interface SearchBarProps {
  value?: string;
  onChangeText?: (text: string) => void;
  placeholder?: string;
  onPress?: () => void;
  autoFocus?: boolean;
  editable?: boolean;
  onSubmit?: () => void;
}

export function SearchBar({
  value,
  onChangeText,
  placeholder = 'What are you looking for?',
  onPress,
  autoFocus,
  editable = true,
  onSubmit,
}: SearchBarProps) {
  if (onPress && !editable) {
    return (
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.7}
        className="flex-row items-center bg-neutral-100 rounded-full h-12 px-4"
      >
        <Text className="text-lg text-neutral-400 mr-2">🔍</Text>
        <Text className="text-base text-neutral-500 flex-1">{placeholder}</Text>
      </TouchableOpacity>
    );
  }

  return (
    <View className="flex-row items-center bg-neutral-100 rounded-full h-12 px-4">
      <Text className="text-lg text-neutral-400 mr-2">🔍</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#9BA3B8"
        autoFocus={autoFocus}
        className="flex-1 text-base text-neutral-900"
        returnKeyType="search"
        onSubmitEditing={onSubmit}
      />
      {Boolean(value) && value!.length > 0 && (
        <TouchableOpacity onPress={() => onChangeText?.('')}>
          <Text className="text-neutral-400 text-lg">✕</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
