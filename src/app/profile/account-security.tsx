import React from 'react';
import { useNotification } from '@/providers/notification-provider';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useTrustStore } from '@/store/trust';
import { useBottomInset } from '@/components/layout/bottom-inset';

export default function AccountSecurityScreen() {
  // The guard rail: the phone's gesture area plus breathing room.
  const bottomInset = useBottomInset();

  const { showAlert } = useNotification();
  const trustStore = useTrustStore();
  const devices = trustStore.trustedDevices;

  const handleRevokeDevice = (deviceId: string, deviceName: string) => {
    showAlert({ type: 'question', title: 'Terminate Session', message: `Are you sure you want to terminate the active session for ${deviceName}? This device will be forced to log in again.`, buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Revoke',
          style: 'destructive',
          onPress: () => {
            trustStore.revokeDevice(deviceId);
            showAlert({ type: 'success', title: 'Session Terminated', message: 'Security credentials revoked successfully.' });
          },
        },
      ] });
  };

  const handleLogoutAll = () => {
    showAlert({ type: 'warning', title: 'Revoke All Other Sessions', message: 'This will log out all sessions on other devices except this current device.', buttons: [
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
            showAlert({ type: 'success', title: 'Success', message: 'All other device credentials revoked.' });
          },
        },
      ] });
  };

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-surface-background">
      <ScreenHeader title="Account Security" />

      <ScrollView className="flex-1 p-6" showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: bottomInset }}>
        
        {/* Trusted Devices Section */}
        <View className="bg-surface-card border border-subtle rounded-3xl p-5 shadow-sm mb-4">
          <View className="flex-row justify-between items-center mb-4">
            <View>
              <Text className="text-xs font-extrabold text-content-faint uppercase tracking-widest">Active Sessions</Text>
              <Text className="text-base font-black text-content-primary tracking-tight mt-0.5">Trusted Devices</Text>
            </View>
            {devices.length > 1 && (
              <TouchableOpacity onPress={handleLogoutAll}>
                <Text className="text-xs font-bold text-error-default">Revoke Others</Text>
              </TouchableOpacity>
            )}
          </View>

          <Text className="text-xs text-content-muted leading-relaxed mb-6">
            Review the devices authorized to access your Diaspora credentials. Terminate unrecognized active device logins.
          </Text>

          <View className="gap-4">
            {devices.map((item) => (
              <View key={item.deviceId} className="flex-row justify-between items-center border-b border-faint pb-3 last:border-b-0 last:pb-0">
                <View className="flex-1 mr-4">
                  <View className="flex-row items-center">
                    <Text className="text-xl mr-2">💻</Text>
                    <Text className="text-sm font-extrabold text-content-primary">{item.deviceName}</Text>
                    {item.isCurrent && (
                      <Text className="text-[8px] bg-success-surface text-success-default px-1.5 py-0.5 rounded font-black uppercase ml-2">Current</Text>
                    )}
                  </View>
                  <Text className="text-[10px] text-content-muted mt-1 leading-relaxed">
                    📍 {item.location} · Last active: {item.lastActive}
                  </Text>
                </View>

                {!item.isCurrent && (
                  <TouchableOpacity
                    onPress={() => handleRevokeDevice(item.deviceId, item.deviceName)}
                    className="bg-surface-muted border border-subtle px-3 py-1.5 rounded-xl"
                  >
                    <Text className="text-[9px] font-black text-error-default uppercase">Revoke</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}

            {devices.length === 0 && (
              <Text className="text-xs text-content-faint italic text-center py-4">No other active sessions detected.</Text>
            )}
          </View>
        </View>

        {/* Dynamic OTP Security configuration */}
        <View className="bg-surface-card border border-subtle rounded-3xl p-5 shadow-sm mb-6">
          <Text className="text-xs font-extrabold text-content-faint uppercase tracking-widest mb-3">Layered Authentication</Text>
          
          {/* Frontend Phase 16, §51. Identity linking is reachable from the
              security screen a member is already on, not only from Settings →
              Integrations. The screen it opens is the single implementation —
              §21 forbids a second authentication architecture and this adds
              none. */}
          <TouchableOpacity
            onPress={() => router.push('/settings/integrations/identity')}
            accessibilityRole="button"
            accessibilityLabel="Sign-in methods. Manage how you sign in and add another way in."
            className="flex-row justify-between items-center py-3 border-b border-faint"
          >
            <View className="flex-1 mr-4">
              <Text className="text-xs font-extrabold text-content-strong">Sign-in methods</Text>
              <Text className="text-[10px] text-content-muted mt-0.5">
                How you sign in, and adding another way in so you are not locked out
              </Text>
            </View>
            <Text className="text-content-faint text-lg">›</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => router.push('/verification/phone')}
            className="flex-row justify-between items-center py-3 border-b border-faint"
          >
            <View className="flex-1 mr-4">
              <Text className="text-xs font-extrabold text-content-strong">Phone Verification (SMS OTP)</Text>
              <Text className="text-[10px] text-content-muted mt-0.5">Link a phone number for SMS multi-factor login checks</Text>
            </View>
            <Text className="text-xs font-bold text-success-default uppercase">✓ Configured</Text>
          </TouchableOpacity>

          <View className="flex-row justify-between items-center py-3 border-b border-faint opacity-55">
            <View className="flex-1 mr-4">
              <Text className="text-xs font-extrabold text-content-strong">Biometric Verification PIN (MFA)</Text>
              <Text className="text-[10px] text-content-muted mt-0.5">Verify via FaceID/Fingerprint for high-value wallet payouts</Text>
            </View>
            <Text className="text-xs font-bold text-content-faint uppercase">Coming Soon</Text>
          </View>

          <View className="flex-row justify-between items-center py-3 opacity-55">
            <View className="flex-1 mr-4">
              <Text className="text-xs font-extrabold text-content-strong">Hardware Security Tokens</Text>
              <Text className="text-[10px] text-content-muted mt-0.5">Secure operations using FIDO2 WebAuthn keys</Text>
            </View>
            <Text className="text-xs font-bold text-content-faint uppercase">Coming Soon</Text>
          </View>
        </View>

        {/* Frontend Phase 16, §5/§50. The connection centre, reachable from the
            account surface as well as from Settings. */}
        <TouchableOpacity
          onPress={() => router.push('/settings/integrations')}
          accessibilityRole="button"
          accessibilityLabel="Connected services. Manage calendars, notifications, payments and connected accounts."
          className="bg-surface-card border border-subtle rounded-3xl p-5 shadow-sm mb-6 flex-row justify-between items-center"
        >
          <View className="flex-1 mr-4">
            <Text className="text-xs font-extrabold text-content-strong">Connected services</Text>
            <Text className="text-[10px] text-content-muted mt-0.5">
              Calendars, notifications, payments and the accounts you have linked
            </Text>
          </View>
          <Text className="text-content-faint text-lg">›</Text>
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}
