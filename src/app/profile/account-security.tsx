// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Account security (Remediation Wave B′)
//
// **This screen told members a lie with security consequences.**
//
// It listed "trusted devices" from `store/trust.ts` — local state seeded with
// fixtures — and "revoked" one by removing a row from that store, then said
// *"Security credentials revoked successfully."* Nothing was revoked. The
// refresh token on the device the member was worried about stayed valid for its
// full lifetime, and before Wave A sign-out did not revoke server-side either,
// so no path existed by which that device ever lost access.
//
// Of the twelve inert affordances the audit found, this is the one that made a
// promise the platform could not keep. It now reads `GET /api/v1/auth/sessions`
// and revokes through `DELETE /auth/sessions/{id}` and `DELETE /auth/sessions`.
//
// ── One thing deliberately removed ───────────────────────────────────────────
//
// The old rows showed "📍 London". `SessionResponse` has no city, country or
// geo field — only `ipAddress`. Rendering a place name would mean geolocating an
// IP on the device and presenting the guess as fact on a security screen, which
// is exactly the kind of confident-and-wrong detail that makes somebody dismiss
// a session they should have revoked. Platform and last-seen time are shown
// instead; those are what the server actually knows.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useState } from 'react';
import { useNotification } from '@/providers/notification-provider';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollEndScrollView } from '@/components/ScrollEndNavigationMenu';
import { router } from 'expo-router';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useBottomInset } from '@/components/layout/bottom-inset';
import { fetchSessions, revokeOtherSessions, revokeSession } from '@/lib/auth-api';
import type { AuthSession } from '@/types/auth';

/** "2 hours ago" from an ISO timestamp, without pulling in a date library. */
function lastSeenLabel(iso: string): string {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return 'Unknown';

  const minutes = Math.max(0, Math.round((Date.now() - then) / 60_000));
  if (minutes < 2) return 'Active now';
  if (minutes < 60) return `${minutes} minutes ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;

  const days = Math.round(hours / 24);
  return `${days} ${days === 1 ? 'day' : 'days'} ago`;
}

export default function AccountSecurityScreen() {
  // The guard rail: the phone's gesture area plus breathing room.
  const bottomInset = useBottomInset();

  const { showAlert } = useNotification();
  const [devices, setDevices] = useState<AuthSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      setDevices(await fetchSessions());
    } catch {
      // An empty list and an unreachable server must not look the same on a
      // security screen: "no other sessions" is a reassurance, and it would be
      // the wrong one.
      setLoadError('We could not load your active sessions.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleRevokeDevice = (sessionId: string, deviceName: string) => {
    showAlert({ type: 'question', title: 'Terminate Session', message: `Are you sure you want to terminate the active session for ${deviceName}? This device will be forced to log in again.`, buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Revoke',
          style: 'destructive',
          onPress: async () => {
            try {
              await revokeSession(sessionId);
              // Re-read rather than splice the row out locally. The server is
              // the authority on what is still live, and the whole defect this
              // replaces was a client that decided that for itself.
              await load();
              showAlert({ type: 'success', title: 'Session Terminated', message: 'That device has been signed out.' });
            } catch {
              showAlert({ type: 'error', title: 'Not revoked', message: 'We could not end that session. It is still active — please try again.' });
            }
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
          onPress: async () => {
            try {
              await revokeOtherSessions();
              await load();
              showAlert({ type: 'success', title: 'Success', message: 'Every other device has been signed out.' });
            } catch {
              showAlert({ type: 'error', title: 'Not revoked', message: 'We could not end those sessions. They are still active — please try again.' });
            }
          },
        },
      ] });
  };

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-surface-background">
      <ScreenHeader title="Account Security" />

      <ScrollEndScrollView className="flex-1 p-6" showsVerticalScrollIndicator={false}
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
              <View key={item.id} className="flex-row justify-between items-center border-b border-faint pb-3 last:border-b-0 last:pb-0">
                <View className="flex-1 mr-4">
                  <View className="flex-row items-center">
                    <Text className="text-xl mr-2">💻</Text>
                    <Text className="text-sm font-extrabold text-content-primary">{item.deviceName}</Text>
                    {item.isCurrent && (
                      <Text className="text-[8px] bg-success-surface text-success-default px-1.5 py-0.5 rounded font-black uppercase ml-2">Current</Text>
                    )}
                  </View>
                  {/* Platform and last-seen, not a geolocated guess. See the
                      file header. */}
                  <Text className="text-[10px] text-content-muted mt-1 leading-relaxed">
                    {item.platform}
                    {item.appVersion ? ` · v${item.appVersion}` : ''} · Last active: {lastSeenLabel(item.lastSeenAt)}
                  </Text>
                </View>

                {!item.isCurrent && (
                  <TouchableOpacity
                    onPress={() => handleRevokeDevice(item.id, item.deviceName)}
                    className="bg-surface-muted border border-subtle px-3 py-1.5 rounded-xl"
                  >
                    <Text className="text-[9px] font-black text-error-default uppercase">Revoke</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}

            {isLoading && (
              <View className="py-4 items-center">
                <ActivityIndicator size="small" />
              </View>
            )}

            {/* An unreachable server and an empty list must not read the same. */}
            {!isLoading && loadError && (
              <View className="py-3">
                <Text className="text-xs text-error-default text-center">{loadError}</Text>
                <TouchableOpacity onPress={load} className="mt-2 items-center">
                  <Text className="text-xs font-bold text-primary-500">Try again</Text>
                </TouchableOpacity>
              </View>
            )}

            {!isLoading && !loadError && devices.length === 0 && (
              <Text className="text-xs text-content-faint italic text-center py-4">No other active sessions detected.</Text>
            )}
          </View>
        </View>

        {/* Dynamic OTP Security configuration */}
        <View className="bg-surface-card border border-subtle rounded-3xl p-5 shadow-sm mb-6">
          <Text className="text-xs font-extrabold text-content-faint uppercase tracking-widest mb-3">Layered Authentication</Text>
          
          {/* ── The way in to a password that could not be changed ────────────
              Until sign-in moved to an email address and a password, this screen
              listed every security control except the one for the credential the
              member actually holds. `POST /auth/change-password` was deployed and
              answering, and nothing in the application called it (UAT-127). */}
          <TouchableOpacity
            testID="change-password"
            onPress={() => router.push('/profile/change-password')}
            className="flex-row justify-between items-center py-3 border-b border-faint"
          >
            <View className="flex-1 mr-4">
              <Text className="text-xs font-extrabold text-content-strong">Password</Text>
              <Text className="text-[10px] text-content-muted mt-0.5">
                Change the password you sign in with
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

      </ScrollEndScrollView>
    </SafeAreaView>
  );
}
