import React, { useState } from 'react';
import { View, Text, ScrollView, Switch, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Button } from '@/components/Button';
import { useTrustStore } from '@/store/trust';

export default function PrivacySettingsScreen() {
  const trustStore = useTrustStore();
  const currentSettings = trustStore.privacySettings;

  const [profileVis, setProfileVis] = useState(currentSettings.profileVisibility);
  const [phoneVis, setPhoneVis] = useState(currentSettings.phoneVisibility);
  const [precision, setPrecision] = useState(currentSettings.locationPrecision);
  const [activity, setActivity] = useState(currentSettings.activityVisibility);
  const [followers, setFollowers] = useState(currentSettings.followersAllowed);
  const [verificationVis, setVerificationVis] = useState(currentSettings.verificationVisibility);

  const handleSave = () => {
    trustStore.updatePrivacySettings({
      profileVisibility: profileVis,
      phoneVisibility: phoneVis,
      locationPrecision: precision,
      activityVisibility: activity,
      followersAllowed: followers,
      verificationVisibility: verificationVis,
    });
    router.back();
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-neutral-50/40">
      <ScreenHeader title="Privacy Settings" />

      <ScrollView className="flex-1 p-6" showsVerticalScrollIndicator={false}>
        
        {/* Profile Visibility */}
        <View className="bg-white border border-neutral-200 rounded-3xl p-5 shadow-sm mb-4">
          <Text className="text-xs font-extrabold text-neutral-400 uppercase tracking-widest mb-3">Profile Discovery</Text>
          
          <Text className="text-sm font-extrabold text-neutral-800 mb-1">Who can view your profile?</Text>
          <Text className="text-[10px] text-neutral-500 mb-4 leading-relaxed">
            Configure who can see your country verifications, ranks, and shared contributions.
          </Text>

          <View className="flex-row gap-2">
            {[
              { id: 'Public' as const, label: 'Public' },
              { id: 'Members' as const, label: 'Members Only' },
              { id: 'Private' as const, label: 'Private' },
            ].map((opt) => (
              <TouchableOpacity
                key={opt.id}
                onPress={() => setProfileVis(opt.id)}
                className={`flex-1 py-3 px-2 rounded-xl border items-center ${profileVis === opt.id ? 'bg-primary-50 border-primary-500' : 'bg-neutral-50 border-neutral-200'}`}
              >
                <Text className={`text-xs font-bold ${profileVis === opt.id ? 'text-primary-500' : 'text-neutral-600'}`}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Location Precision */}
        <View className="bg-white border border-neutral-200 rounded-3xl p-5 shadow-sm mb-4">
          <Text className="text-xs font-extrabold text-neutral-400 uppercase tracking-widest mb-3">Location Precision</Text>
          
          <Text className="text-sm font-extrabold text-neutral-800 mb-1">GPS Telemetry Precision</Text>
          <Text className="text-[10px] text-neutral-500 mb-4 leading-relaxed">
            Exact precision is used for local Job & Housing distance search indices. Approximate shows neighborhood boundaries.
          </Text>

          <View className="flex-row gap-2">
            {[
              { id: 'Exact' as const, label: 'Precise (Exact GPS)' },
              { id: 'Approximate' as const, label: 'Neighborhood level' },
            ].map((opt) => (
              <TouchableOpacity
                key={opt.id}
                onPress={() => setPrecision(opt.id)}
                className={`flex-1 py-3 px-2 rounded-xl border items-center ${precision === opt.id ? 'bg-primary-50 border-primary-500' : 'bg-neutral-50 border-neutral-200'}`}
              >
                <Text className={`text-xs font-bold text-center ${precision === opt.id ? 'text-primary-500' : 'text-neutral-600'}`}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Switched Toggles */}
        <View className="bg-white border border-neutral-200 rounded-3xl p-5 shadow-sm mb-6 gap-4">
          <Text className="text-xs font-extrabold text-neutral-400 uppercase tracking-widest mb-1">Exposure Toggles</Text>
          
          {/* Phone Visibility */}
          <View className="flex-row justify-between items-center pb-3 border-b border-neutral-50">
            <View className="flex-1 mr-4">
              <Text className="text-xs font-extrabold text-neutral-800">Phone Number visibility</Text>
              <Text className="text-[10px] text-neutral-500 mt-0.5">Let verified providers or buyers request your contact details</Text>
            </View>
            <Switch
              value={phoneVis === 'Members'}
              onValueChange={(val) => setPhoneVis(val ? 'Members' : 'Private')}
              trackColor={{ true: '#F59300', false: '#E5E7EB' }}
            />
          </View>

          {/* Activity status */}
          <View className="flex-row justify-between items-center pb-3 border-b border-neutral-50">
            <View className="flex-1 mr-4">
              <Text className="text-xs font-extrabold text-neutral-800">Show Online status</Text>
              <Text className="text-[10px] text-neutral-500 mt-0.5">Expose when you are active on the portal feed</Text>
            </View>
            <Switch
              value={activity}
              onValueChange={setActivity}
              trackColor={{ true: '#F59300', false: '#E5E7EB' }}
            />
          </View>

          {/* Followers allowed */}
          <View className="flex-row justify-between items-center pb-3 border-b border-neutral-50">
            <View className="flex-1 mr-4">
              <Text className="text-xs font-extrabold text-neutral-800">Enable Following</Text>
              <Text className="text-[10px] text-neutral-500 mt-0.5">Allow members to subscribe to your published guides and updates</Text>
            </View>
            <Switch
              value={followers}
              onValueChange={setFollowers}
              trackColor={{ true: '#F59300', false: '#E5E7EB' }}
            />
          </View>

          {/* Verification Badge Visibility */}
          <View className="flex-row justify-between items-center">
            <View className="flex-1 mr-4">
              <Text className="text-xs font-extrabold text-neutral-800">Show Ranks & Badges</Text>
              <Text className="text-[10px] text-neutral-500 mt-0.5">Display Country Verified badge next to your posts</Text>
            </View>
            <Switch
              value={verificationVis}
              onValueChange={setVerificationVis}
              trackColor={{ true: '#F59300', false: '#E5E7EB' }}
            />
          </View>
        </View>

        <Button label="Save Changes" onPress={handleSave} className="w-full mb-10" />

      </ScrollView>
    </SafeAreaView>
  );
}

// Inline router mock if route fails
import { router as expoRouter } from 'expo-router';
const router = {
  back: () => expoRouter.back(),
};
