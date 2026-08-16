import React from 'react';
import { View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollEndScrollView } from '@/components/ScrollEndNavigationMenu';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useTrustStore } from '@/store/trust';
import { useBottomInset } from '@/components/layout/bottom-inset';

export default function AuditLogScreen() {
  // The guard rail: the phone's gesture area plus breathing room.
  const bottomInset = useBottomInset();

  const trustStore = useTrustStore();
  const logs = trustStore.auditLogs;

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-surface-background">
      <ScreenHeader title="Security Audit Logs" />

      <ScrollEndScrollView className="flex-1 p-6" showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: bottomInset }}>
        <View className="bg-surface-card border border-subtle rounded-3xl p-5 shadow-sm">
          <Text className="text-xs font-extrabold text-content-faint uppercase tracking-widest mb-2">Account Activity Trace</Text>
          <Text className="text-sm font-extrabold text-content-primary mb-6">Sensitive Operations History</Text>

          <View className="space-y-6">
            {logs.map((item) => (
              <View key={item.eventId} className="border-b border-faint pb-4 mb-4 last:border-b-0 last:pb-0 last:mb-0">
                <View className="flex-row justify-between items-center mb-1.5">
                  <Text className="text-xs font-extrabold text-content-strong">{item.action}</Text>
                  <Text className="text-[9px] text-content-faint font-bold">
                    {new Date(item.timestamp).toLocaleString()}
                  </Text>
                </View>

                <Text className="text-xs text-content-muted mb-2 leading-relaxed">{item.details}</Text>

                <View className="flex-row flex-wrap gap-x-4 gap-y-1">
                  <Text className="text-[9px] font-bold text-content-faint">🌐 IP: {item.ipAddress}</Text>
                  <Text className="text-[9px] font-bold text-content-faint">🔑 ID: {item.deviceFingerprint}</Text>
                </View>
              </View>
            ))}

            {logs.length === 0 && (
              <Text className="text-xs text-content-faint italic text-center py-6">No security events found.</Text>
            )}
          </View>
        </View>

        <Text className="text-xs text-content-faint text-center leading-relaxed mt-6 px-4">
          Audit logs are tamper-proof read-only security events preserved on secure ledger storage to keep your profile secure.
        </Text>
      </ScrollEndScrollView>
    </SafeAreaView>
  );
}
