import React, { useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, Modal, FlatList, TextInput } from 'react-native';

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
        className="flex-row items-center bg-neutral-100 rounded-full h-12 px-4 mt-2"
      >
        <Text className="text-lg text-neutral-400 mr-2">📍</Text>
        <Text className={`text-base flex-1 ${value ? 'text-neutral-900' : 'text-neutral-500'}`}>
          {value || placeholder}
        </Text>
        {Boolean(value) && value!.length > 0 && editable && (
          <TouchableOpacity onPress={() => onChangeText?.('')} className="p-1">
            <Text className="text-neutral-400 text-lg">✕</Text>
          </TouchableOpacity>
        )}
        {!value && editable && <Text className="text-neutral-400">▼</Text>}
      </TouchableOpacity>

      {editable && (
        <Modal visible={modalVisible} animationType="slide" transparent={true}>
          <View className="flex-1 justify-end bg-black/50">
            <View className="bg-white rounded-t-3xl h-[80%]">
              <View className="flex-row justify-between items-center p-6 border-b border-neutral-100">
                <Text className="text-xl font-bold text-neutral-900">Select Location</Text>
                <TouchableOpacity onPress={() => setModalVisible(false)} className="p-2 bg-neutral-100 rounded-full">
                  <Text className="text-neutral-500 font-bold text-sm">✕</Text>
                </TouchableOpacity>
              </View>
              
              <View className="p-4 border-b border-neutral-100">
                <View className="flex-row items-center bg-neutral-100 rounded-xl h-12 px-4">
                  <Text className="text-lg text-neutral-400 mr-2">🔍</Text>
                  <TextInput
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    placeholder="Search cities, neighborhoods..."
                    placeholderTextColor="#9BA3B8"
                    className="flex-1 text-base text-neutral-900"
                    autoFocus
                  />
                  {searchQuery.length > 0 && (
                    <TouchableOpacity onPress={() => setSearchQuery('')}>
                      <Text className="text-neutral-400 text-lg">✕</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              <FlatList
                data={filteredLocations}
                keyExtractor={(item) => item}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => (
                  <TouchableOpacity
                    className="p-4 px-6 border-b border-neutral-50 flex-row justify-between items-center"
                    onPress={() => handleSelect(item)}
                  >
                    <Text className={`text-lg ${value === item || (!value && item === 'Anywhere in London') ? 'text-primary-600 font-semibold' : 'text-neutral-700'}`}>
                      {item}
                    </Text>
                    {(value === item || (!value && item === 'Anywhere in London')) && (
                      <Text className="text-primary-600 text-lg">✓</Text>
                    )}
                  </TouchableOpacity>
                )}
                ListEmptyComponent={
                  <View className="p-8 items-center">
                    <Text className="text-neutral-500 text-base">No locations found for "{searchQuery}"</Text>
                  </View>
                }
              />
            </View>
          </View>
        </Modal>
      )}
    </>
  );
}
