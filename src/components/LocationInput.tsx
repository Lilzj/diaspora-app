import React, { useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, FlatList, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { lightTokens } from '@/design-system';
import { Sheet } from '@/components/overlays/AppModal';

interface LocationInputProps {
  value?: string;
  onChangeText?: (text: string) => void;
  placeholder?: string;
  onPress?: () => void;
  editable?: boolean;
}

const MOCK_LOCATIONS = [
  'Anywhere in London',
  'Peckham',
  'Brixton',
  'Lewisham',
  'Woolwich',
  'Croydon',
  'Hackney',
  'Islington',
  'Camden',
  'Greenwich',
];

export function LocationInput({
  value,
  onChangeText,
  placeholder = 'Where?',
  onPress,
  editable = true,
}: LocationInputProps) {
  const [modalVisible, setModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const handlePress = () => {
    if (onPress) {
      onPress();
    } else if (editable) {
      setSearchQuery('');
      setModalVisible(true);
    }
  };

  const handleSelect = (location: string) => {
    const newValue = location === 'Anywhere in London' ? '' : location;
    onChangeText?.(newValue);
    setModalVisible(false);
  };

  const filteredLocations = useMemo(() => {
    if (!searchQuery) return MOCK_LOCATIONS;
    return MOCK_LOCATIONS.filter(loc => 
      loc.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [searchQuery]);

  return (
    <>
      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={0.7}
        className="flex-row items-center bg-surface-muted rounded-full h-12 px-4 mt-2"
      >
        <Text className="text-lg text-content-faint mr-2">📍</Text>
        <Text className={`text-base flex-1 ${value ? 'text-content-primary' : 'text-content-muted'}`}>
          {value || placeholder}
        </Text>
        {Boolean(value) && value!.length > 0 && editable && (
          <TouchableOpacity onPress={() => onChangeText?.('')} className="p-1">
            <Text className="text-content-faint text-lg">✕</Text>
          </TouchableOpacity>
        )}
        {!value && editable && <Text className="text-content-faint">▼</Text>}
      </TouchableOpacity>

      {editable && (
        <Sheet
          visible={modalVisible}
          onClose={() => setModalVisible(false)}
          title="Select location"
          height="80%"
          // The body is a FlatList, which owns its own scrolling — nesting it
          // in the sheet's ScrollView would starve it of the gesture.
          scrollable={false}
          testID="location-picker"
        >
          <View className="pb-4">
            <View className="flex-row items-center bg-surface-muted rounded-xl h-12 px-4">
              <Ionicons name="search" size={18} color={lightTokens.color.text.placeholder} />
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search cities, neighborhoods..."
                placeholderTextColor={lightTokens.color.text.placeholder}
                className="flex-1 text-base text-content-primary ml-2"
                accessibilityLabel="Search locations"
                autoFocus
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity
                  onPress={() => setSearchQuery('')}
                  accessibilityRole="button"
                  accessibilityLabel="Clear search"
                  hitSlop={8}
                >
                  <Ionicons name="close-circle" size={18} color={lightTokens.color.text.placeholder} />
                </TouchableOpacity>
              )}
            </View>
          </View>

          <FlatList
            data={filteredLocations}
            keyExtractor={(item) => item}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => {
              const isSelected = value === item || (!value && item === 'Anywhere in London');
              return (
                <TouchableOpacity
                  className="py-4 border-b border-neutral-50 flex-row justify-between items-center"
                  onPress={() => handleSelect(item)}
                  accessibilityRole="button"
                  accessibilityLabel={item}
                  accessibilityState={{ selected: isSelected }}
                >
                  <Text
                    className={`text-lg ${isSelected ? 'text-primary-600 font-semibold' : 'text-content-secondary'}`}
                  >
                    {item}
                  </Text>
                  {isSelected && (
                    <Ionicons name="checkmark" size={20} color={lightTokens.color.primary[600]} />
                  )}
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={
              <View className="p-8 items-center">
                <Text className="text-content-muted text-base">
                  No locations found for &quot;{searchQuery}&quot;
                </Text>
              </View>
            }
          />
        </Sheet>
      )}
    </>
  );
}
