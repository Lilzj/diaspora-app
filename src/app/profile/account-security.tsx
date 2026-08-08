import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useTrustStore } from '@/store/trust';

export default function AccountSecurityScreen() {
  const trustStore = useTrustStore();
  const devices = trustStore.trustedDevices;

  const handleRevokeDevice = (deviceId: string, deviceName: string) => {
    Alert.alert(
      'Terminate Session',
      `Are you sure you want to terminate the active session for ${deviceName}? This device will be forced to log in again.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Revoke',
          style: 'destructive',
          onPress: () => {
            trustStore.revokeDevice(deviceId);
            Alert.alert('Session Terminated', 'Security credentials revoked successfully.');
          },
        },
      ]
    );
  };

  const handleLogoutAll = () => {
    Alert.alert(
      'Revoke All Other Sessions',
      'This will log out all sessions on other devices except this current device.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout Others',
          style: 'destructive',
          onPress: () => {
            const current = devices.find((d) => d.isCurrent);
            useTrustStore.setState({
              trustedDevices: current ? [current] : [],
            });
            trustStore.addAuditLog('Revoked All Sessions', 'Revoked access tokens for all other active trusted devices.');
            Alert.alert('Success', 'All other device credentials revoked.');
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-neutral-50/40">
      <ScreenHeader title="Account Security" />

      <ScrollView className="flex-1 p-6" showsVerticalScrollIndicator={false}>
        
        {/* Trusted Devices Section */}
        <View className="bg-white border border-neutral-200 rounded-3xl p-5 shadow-sm mb-4">
          <View className="flex-row justify-between items-center mb-4">
            <View>
              <Text className="text-xs font-extrabold text-neutral-400 uppercase tracking-widest">Active Sessions</Text>
              <Text className="text-base font-black text-neutral-900 tracking-tight mt-0.5">Trusted Devices</Text>
            </View>
            {devices.length > 1 && (
              <TouchableOpacity onPress={handleLogoutAll}>
                <Text className="text-xs font-bold text-error-default">Revoke Others</Text>
              </TouchableOpacity>
            )}
          </View>

          <Text className="text-xs text-neutral-500 leading-relaxed mb-6">
            Review the devices authorized to access your Diaspora credentials. Terminate unrecognized active device logins.
          </Text>

          <View className="gap-4">
            {devices.map((item) => (
              <View key={item.deviceId} className="flex-row justify-between items-center border-b border-neutral-50 pb-3 last:border-b-0 last:pb-0">
                <View className="flex-1 mr-4">
                  <View className="flex-row items-center">
                    <Text className="text-xl mr-2">💻</Text>
                    <Text className="text-sm font-extrabold text-neutral-850">{item.deviceName}</Text>
                    {item.isCurrent && (
                      <Text className="text-[8px] bg-success-surface text-success-default px-1.5 py-0.5 rounded font-black uppercase ml-2">Current</Text>
                    )}
                  </View>
                  <Text className="text-[10px] text-neutral-500 mt-1 leading-relaxed">
                    📍 {item.location} · Last active: {item.lastActive}
                  </Text>
                </View>

                {!item.isCurrent && (
                  <TouchableOpacity
                    onPress={() => handleRevokeDevice(item.deviceId, item.deviceName)}
                    className="bg-neutral-100 border border-neutral-200 px-3 py-1.5 rounded-xl"
                  >
                    <Text className="text-[9px] font-black text-error-default uppercase">Revoke</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}

            {devices.length === 0 && (
              <Text className="text-xs text-neutral-400 italic text-center py-4">No other active sessions detected.</Text>
            )}
          </View>
        </View>

        {/* Dynamic OTP Security configuration */}
        <View className="bg-white border border-neutral-200 rounded-3xl p-5 shadow-sm mb-6">
          <Text className="text-xs font-extrabold text-neutral-400 uppercase tracking-widest mb-3">Layered Authentication</Text>
          
          <TouchableOpacity
            onPress={() => router.push('/verification/phone')}
            className="flex-row justify-between items-center py-3 border-b border-neutral-50"
          >
            <View className="flex-1 mr-4">
              <Text className="text-xs font-extrabold text-neutral-800">Phone Verification (SMS OTP)</Text>
              <Text className="text-[10px] text-neutral-500 mt-0.5">Link a phone number for SMS multi-factor login checks</Text>
            </View>
            <Text className="text-xs font-bold text-success-default uppercase">✓ Configured</Text>
          </TouchableOpacity>

          <View className="flex-row justify-between items-center py-3 border-b border-neutral-50 opacity-55">
            <View className="flex-1 mr-4">
              <Text className="text-xs font-extrabold text-neutral-800">Biometric Verification PIN (MFA)</Text>
              <Text className="text-[10px] text-neutral-500 mt-0.5">Verify via FaceID/Fingerprint for high-value wallet payouts</Text>
            </View>
            <Text className="text-xs font-bold text-neutral-400 uppercase">Coming Soon</Text>
          </View>

          <View className="flex-row justify-between items-center py-3 opacity-55">
            <View className="flex-1 mr-4">
              <Text className="text-xs font-extrabold text-neutral-800">Hardware Security Tokens</Text>
              <Text className="text-[10px] text-neutral-500 mt-0.5">Secure operations using FIDO2 WebAuthn keys</Text>
            </View>
            <Text className="text-xs font-bold text-neutral-400 uppercase">Coming Soon</Text>
          </View>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}
