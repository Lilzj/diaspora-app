import React, { useState } from 'react';
import { useNotification } from '@/providers/notification-provider';
import { View, Text, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';

interface ImagePickerInputProps {
  label: string;
  value: string | null;
  onChangeImage: (uri: string | null) => void;
  aspect?: [number, number];
  circle?: boolean;
}

export function ImagePickerInput({ label, value, onChangeImage, aspect = [16, 9], circle = false }: ImagePickerInputProps) {
  const { showAlert } = useNotification();
  const [loading, setLoading] = useState(false);

  const handlePickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      showAlert({ type: 'error', title: 'Permission Denied', message: 'We need access to your photo library to pick images.' });
      return;
    }

    try {
      setLoading(true);
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: aspect,
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        onChangeImage(result.assets[0].uri);
      }
    } catch (e) {
      console.error(e);
      showAlert({ type: 'error', title: 'Error', message: 'Failed to select photo.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <View className="mb-4 w-full">
      <Text className="text-xs font-bold text-content-faint uppercase tracking-widest mb-2">{label}</Text>
      
      <TouchableOpacity
        onPress={handlePickImage}
        activeOpacity={0.7}
        className={`bg-surface-background border border-subtle justify-center items-center overflow-hidden ${
          circle ? 'w-24 h-24 rounded-full' : 'h-40 rounded-2xl'
        }`}
      >
        {value ? (
          <View className="w-full h-full relative">
            <Image source={{ uri: value }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
            <View className="absolute inset-0 bg-black/20 justify-center items-center">
              <Ionicons name="camera-outline" size={24} color="#FFF" />
              <Text className="text-white text-[10px] font-bold mt-1 uppercase">Change Photo</Text>
            </View>
          </View>
        ) : (
          <View className="items-center px-4">
            <Ionicons name="images-outline" size={28} color="#F59300" />
            <Text className="text-xs font-extrabold text-content-muted mt-2">Tap to Select Photo</Text>
            <Text className="text-[10px] text-content-faint mt-1">From Photo Gallery</Text>
          </View>
        )}
      </TouchableOpacity>
    </View>
  );
}
