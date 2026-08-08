import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useTrustStore } from '@/store/trust';

export default function AuditLogScreen() {
  const trustStore = useTrustStore();
  const logs = trustStore.auditLogs;

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-neutral-50/40">
      <ScreenHeader title="Security Audit Logs" />

      <ScrollView className="flex-1 p-6" showsVerticalScrollIndicator={false}>
        <View className="bg-white border border-neutral-200 rounded-3xl p-5 shadow-sm">
          <Text className="text-xs font-extrabold text-neutral-400 uppercase tracking-widest mb-2">Account Activity Trace</Text>
          <Text className="text-sm font-extrabold text-neutral-900 mb-6">Sensitive Operations History</Text>

          <View className="space-y-6">
            {logs.map((item) => (
              <View key={item.eventId} className="border-b border-neutral-100 pb-4 mb-4 last:border-b-0 last:pb-0 last:mb-0">
                <View className="flex-row justify-between items-center mb-1.5">
                  <Text className="text-xs font-extrabold text-neutral-800">{item.action}</Text>
                  <Text className="text-[9px] text-neutral-400 font-bold">
                    {new Date(item.timestamp).toLocaleString()}
                  </Text>
                </View>

                <Text className="text-xs text-neutral-500 mb-2 leading-relaxed">{item.details}</Text>

                <View className="flex-row flex-wrap gap-x-4 gap-y-1">
                  <Text className="text-[9px] font-bold text-neutral-400">🌐 IP: {item.ipAddress}</Text>
                  <Text className="text-[9px] font-bold text-neutral-400">🔑 ID: {item.deviceFingerprint}</Text>
                </View>
              </View>
            ))}

            {logs.length === 0 && (
              <Text className="text-xs text-neutral-400 italic text-center py-6">No security events found.</Text>
            )}
          </View>
        </View>

        <Text className="text-xs text-neutral-400 text-center leading-relaxed mt-6 px-4">
          Audit logs are tamper-proof read-only security events preserved on secure ledger storage to keep your profile secure.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
