import React from 'react';
import { View, TextInput, TouchableOpacity, Text } from 'react-native';
import { useCreatorWorkspaceStore } from '@/store/creator-workspace';
import { useThemeTokens } from '@/design-system';

interface CreatorSearchBarProps {
  onOpenFilterModal: () => void;
}

export const CreatorSearchBar: React.FC<CreatorSearchBarProps> = ({ onOpenFilterModal }) => {
  const tokens = useThemeTokens();
  const { filters, setSearchQuery, toggleMultiSelectMode, isMultiSelectMode } = useCreatorWorkspaceStore();

  return (
    <View className="flex-row items-center gap-2 mb-3">
      <View className="flex-1 flex-row items-center bg-surface-card border border-subtle rounded-2xl px-3.5 py-2.5 shadow-sm">
        <Text className="text-sm mr-2">🔍</Text>
        <TextInput
          value={filters.searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search by title, location, tag, status..."
          placeholderTextColor={tokens.color.text.placeholder}
          className="flex-1 text-xs font-semibold text-content-primary p-0"
        />
        {filters.searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')} className="p-1">
            <Text className="text-xs font-black text-content-faint">✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Filter Button */}
      <TouchableOpacity
        onPress={onOpenFilterModal}
        className="bg-surface-card border border-subtle p-3 rounded-2xl shadow-sm items-center justify-center"
      >
        <Text className="text-xs">🎛️</Text>
      </TouchableOpacity>

      {/* Multi select toggle */}
      <TouchableOpacity
        onPress={toggleMultiSelectMode}
        className={`p-3 rounded-2xl border shadow-sm items-center justify-center ${
          isMultiSelectMode ? 'bg-primary-500 border-primary-500' : 'bg-surface-card border-subtle'
        }`}
      >
        <Text className={`text-xs ${isMultiSelectMode ? 'text-white' : 'text-content-secondary'}`}>☑️</Text>
      </TouchableOpacity>
    </View>
  );
};
