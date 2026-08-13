import React, { useState } from 'react';
import { View, Text, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Input } from '@/components/Input';
import { Button } from '@/components/Button';
import { Avatar } from '@/components/Avatar';
import { mockUser } from '@/mocks/data';

export default function EditProfileScreen() {
  const [name, setName] = useState(mockUser.fullName);
  const [bio, setBio] = useState(mockUser.bio ?? '');

  return (
    <SafeAreaView className="flex-1 bg-surface-card">
      <ScreenHeader title="Edit Profile" />

      <KeyboardAvoidingView
        behavior="padding"
        className="flex-1"
      >
        <ScrollView className="flex-1 px-6 pt-4" keyboardShouldPersistTaps="handled">
          <View className="items-center mb-8">
            <Avatar name={name} size={96} />
            <Button label="Change Photo" variant="ghost" size="sm" className="mt-3" />
          </View>

          <Input label="Full Name" value={name} onChangeText={setName} autoCapitalize="words" />
          <Input
            label="Bio"
            value={bio}
            onChangeText={setBio}
            placeholder="Tell us about yourself..."
            multiline
            numberOfLines={3}
          />
          <Input label="Phone Number" value={mockUser.phone} editable={false} />
        </ScrollView>

        <View className="px-6 py-6">
          <Button label="Save Changes" onPress={() => router.back()} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
