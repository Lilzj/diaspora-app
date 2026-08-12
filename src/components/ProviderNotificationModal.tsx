import React from 'react';
import { View, Text, Modal, TouchableOpacity, StyleSheet, TouchableWithoutFeedback, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useProviderNotificationStore, DEFAULT_PROVIDER_SETTINGS } from '@/store/provider-notifications';

interface ProviderNotificationModalProps {
  visible: boolean;
  onClose: () => void;
  providerId: string;
  providerName: string;
}

export function ProviderNotificationModal({
  visible,
  onClose,
  providerId,
  providerName,
}: ProviderNotificationModalProps) {
  const insets = useSafeAreaInsets();
  const toggleNotifications = useProviderNotificationStore((s) => s.toggleNotifications);
  const toggleService = useProviderNotificationStore((s) => s.toggleService);
  const settings = useProviderNotificationStore(
    (s) => s.settings[providerId] || DEFAULT_PROVIDER_SETTINGS
  );

  const servicesList = [
    { key: 'communityGuide', label: '📖 Community Guide' },
    { key: 'jobPosting', label: '💼 Job Posting' },
    { key: 'housing', label: '🏠 Housing' },
    { key: 'marketplace', label: '🛒 Marketplace' },
    { key: 'service', label: '🛠️ Service' },
  ] as const;

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
      <TouchableOpacity activeOpacity={1} onPress={onClose} style={styles.overlay}>
        <TouchableWithoutFeedback>
          <View 
            style={[styles.modalCard, { paddingBottom: Math.max(insets.bottom + 16, 28) }]} 
            className="bg-white rounded-t-[32px] border-t border-x border-neutral-100 px-6 pt-6 shadow-2xl w-full"
          >
            {/* Drag Handle Indicator */}
            <View className="w-12 h-1 bg-neutral-200 rounded-full mx-auto mb-4" />

            <View className="flex-row justify-between items-center mb-3">
              <Text className="text-base font-black text-neutral-900 tracking-tight flex-1">
                🔔 Alerts from {providerName}
              </Text>
              <TouchableOpacity onPress={onClose} className="p-1">
                <Ionicons name="close" size={20} color="#9CA3AF" />
              </TouchableOpacity>
            </View>

            <Text className="text-xs text-neutral-500 mb-4 font-semibold leading-relaxed">
              Configure which alerts you would like to receive when this provider publishes content.
            </Text>

            {/* Main Notifications Enable/Disable Switch */}
            <View className="flex-row items-center justify-between p-4 bg-neutral-50 rounded-2xl border border-neutral-100 mb-4">
              <View className="flex-1 mr-2">
                <Text className="text-xs font-black text-neutral-800">Alert Notifications</Text>
                <Text className="text-[10px] text-neutral-400 font-bold mt-0.5">Receive notifications from this provider</Text>
              </View>
              <Switch
                value={settings.enabled}
                onValueChange={(val) => toggleNotifications(providerId, val)}
                trackColor={{ false: '#E4E4E7', true: '#F59300' }}
                thumbColor={settings.enabled ? '#009688' : '#FFFFFF'}
                ios_backgroundColor="#E4E4E7"
              />
            </View>

            {/* Detailed Preferences (Only if main notifications are enabled) */}
            {settings.enabled && (
              <View className="w-full mb-4">
                <Text className="text-[10px] font-black text-neutral-450 uppercase tracking-widest mb-2 ml-1">
                  Notify Me About
                </Text>
                <View className="bg-white border border-neutral-100 rounded-2xl px-4 py-1 gap-1">
                  {servicesList.map((service, index) => {
                    const isOn = settings.services[service.key];
                    const isLast = index === servicesList.length - 1;
                    return (
                      <View 
                        key={service.key} 
                        className={`flex-row items-center justify-between py-3 ${
                          !isLast ? 'border-b border-neutral-100' : ''
                        }`}
                      >
                        <Text className="text-xs font-bold text-neutral-700">{service.label}</Text>
                        <Switch
                          value={isOn}
                          onValueChange={(val) => toggleService(providerId, service.key, val)}
                          trackColor={{ false: '#E4E4E7', true: '#F59300' }}
                          thumbColor={isOn ? '#009688' : '#FFFFFF'}
                          ios_backgroundColor="#E4E4E7"
                        />
                      </View>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Done Button */}
            <TouchableOpacity
              onPress={onClose}
              activeOpacity={0.8}
              className="w-full bg-primary-500 py-3 rounded-2xl items-center justify-center shadow-lg shadow-primary-500/10 mt-2 mb-2"
              style={{ height: 48 }}
            >
              <Text className="text-white font-black text-xs uppercase tracking-wider">
                Done
              </Text>
            </TouchableOpacity>
          </View>
        </TouchableWithoutFeedback>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    maxHeight: '90%',
  },
});
