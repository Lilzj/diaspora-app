/**
 * AttachmentPicker — Bottom sheet for selecting attachment type
 */

import React from 'react';
import { View, Text, TouchableOpacity, Modal, Pressable, Platform, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

interface Props {
  visible: boolean;
  onClose: () => void;
  onImageSelected: (uri: string) => void;
  onDocumentSelected?: (name: string, size: number) => void;
  onVoiceNote?: () => void;
}

const OPTIONS = [
  { key: 'camera', icon: '📷', label: 'Camera', sublabel: 'Take a photo' },
  { key: 'gallery', icon: '🖼️', label: 'Gallery', sublabel: 'Choose from library' },
  { key: 'document', icon: '📄', label: 'Document', sublabel: 'PDF, Word, Excel' },
  { key: 'location', icon: '📍', label: 'Location', sublabel: 'Share your location' },
];

export function AttachmentPicker({ visible, onClose, onImageSelected, onDocumentSelected }: Props) {
  const handleOption = async (key: string) => {
    onClose();
    await new Promise((r) => setTimeout(r, 200)); // Let modal close first

    if (key === 'camera') {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission required', 'Camera access is needed to take photos.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.8,
        allowsEditing: true,
      });
      if (!result.canceled && result.assets[0]) {
        onImageSelected(result.assets[0].uri);
      }
    } else if (key === 'gallery') {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission required', 'Photo library access is needed.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
        allowsMultipleSelection: true,
        selectionLimit: 5,
      });
      if (!result.canceled && result.assets[0]) {
        onImageSelected(result.assets[0].uri);
      }
    } else if (key === 'document') {
      // Mock document selection — expo-document-picker not installed
      Alert.alert(
        'Select Document',
        'Document sharing is available in the full release.',
        [{ text: 'OK' }]
      );
    } else if (key === 'location') {
      Alert.alert('Location Sharing', 'Location sharing coming soon!');
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}
        onPress={onClose}
      >
        <Pressable onPress={() => {}}>
          <View className="bg-white rounded-t-3xl pt-2"
            style={{ paddingBottom: Platform.OS === 'ios' ? 34 : 24 }}>
            <View className="w-10 h-1 bg-neutral-200 rounded-full self-center mb-6" />
            <Text className="text-base font-black text-neutral-900 px-6 mb-4">Attach</Text>

            <View className="flex-row flex-wrap px-4 gap-4 pb-4">
              {OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt.key}
                  onPress={() => handleOption(opt.key)}
                  activeOpacity={0.75}
                  className="items-center"
                  style={{ width: 72 }}
                >
                  <View className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-100 items-center justify-center mb-1.5">
                    <Text className="text-3xl">{opt.icon}</Text>
                  </View>
                  <Text className="text-[11px] font-bold text-neutral-800 text-center">{opt.label}</Text>
                  <Text className="text-[9px] text-neutral-400 text-center">{opt.sublabel}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
