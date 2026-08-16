// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Notifications integration (Frontend Phase 16, §14 · §44 · §45)
//
// The device half of notifications: permission, this device's registration, and
// the other devices signed in to the same account.
//
// **The category preferences are not here.** They live at
// `/settings/notifications` against B13's real contract, and §14 forbids
// duplicating them. This screen links there rather than re-rendering them, so
// there is one place a member changes what they hear about and one cache entry
// behind it.
//
// ── §45, and why other devices are listed ────────────────────────────────────
//
// "Do not assume one user equals one device." A member with a phone and a
// tablet has two registrations, and the failure they experience — notifications
// arriving on the device they are not holding, or on one they have given away —
// is only diagnosable if they can see the list. B13 already returns it; this is
// the first surface to render it.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollEndScrollView } from '@/components/ScrollEndNavigationMenu';
import { router } from 'expo-router';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Button } from '@/components/Button';
import { useTheme } from '@/design-system';
import { usePushNotifications } from '@/hooks/integrations';
import {
  ConsentSheet,
  IntegrationErrorNotice,
  IntegrationStatusBadge,
  PermissionRecovery,
  ProviderGapNotice,
  SimulationMarker,
} from '@/components/integrations';
import { descriptorFor } from '@/lib/integrations/catalog';
import { hasPushModule } from '@/lib/integrations/providers/push';
import type { NotificationDevice } from '@/types/notification-preferences';
import { useBottomInset } from '@/components/layout/bottom-inset';

export default function PushIntegrationScreen() {
  // The guard rail: the phone's gesture area plus breathing room.
  const bottomInset = useBottomInset();

  const { tokens } = useTheme();
  const { registration, devices, isLoadingDevices, skippedReason, enable, disable, openSettings } =
    usePushNotifications();
  const [consentVisible, setConsentVisible] = useState(false);

  const descriptor = descriptorFor('push.expo');
  const permission = registration?.permission ?? 'notRequested';
  const isOn = permission === 'granted' && registration?.deviceId != null;

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: tokens.color.surface.background }}>
      <ScreenHeader title="Notifications" showBack />

      <ScrollEndScrollView className="flex-1 px-4 pt-4" contentContainerStyle={{ paddingBottom: bottomInset }}>
        {/* ── This device ───────────────────────────────────────────────── */}
        <Heading title="This device" />

        <View
          style={{ borderColor: tokens.color.border.default }}
          className="border rounded-2xl p-4 mb-3"
        >
          <IntegrationStatusBadge
            status={
              permission === 'granted'
                ? isOn
                  ? 'CONNECTED'
                  : 'PARTIALLY_CONNECTED'
                : permission === 'blocked'
                  ? 'PERMISSION_DENIED'
                  : permission === 'unavailable'
                    ? 'UNAVAILABLE'
                    : 'NOT_CONNECTED'
            }
            mode={registration?.mode ?? 'NOT_CONFIGURED'}
            showDescription
          />

          <View className="mt-4">
            {permission === 'granted' ? (
              <Button label="Turn off on this device" variant="outline" onPress={() => void disable()} />
            ) : permission === 'unavailable' ? null : (
              <PermissionRecovery
                state={permission === 'blocked' ? 'blocked' : permission === 'denied' ? 'denied' : 'notRequested'}
                canAskAgain={permission !== 'blocked'}
                // The explanation comes first. §37 applies to an OS prompt as
                // much as to a Continue button, and on Android 13 a denial is
                // effectively permanent — so a member who is asked before they
                // understand why has spent their one chance.
                onRequest={() => setConsentVisible(true)}
                onOpenSettings={() => void openSettings()}
              />
            )}
          </View>
        </View>

        {/* The honest statement about a simulated token. `skippedReason` is set
            only when a token was minted and deliberately not registered. */}
        {skippedReason ? (
          <View className="mb-3">
            <IntegrationErrorNotice
              message="Notifications are set up locally but not with the delivery service."
              hint={skippedReason}
            />
          </View>
        ) : null}

        {!hasPushModule() ? (
          <View className="mb-3">
            <ProviderGapNotice
              gapKey="pushToken"
              detail="This version of the app cannot receive push notifications. Your notification inbox inside the app still works normally."
            />
          </View>
        ) : null}

        {/* ── What you hear about — B13, not duplicated here ─────────────── */}
        <Heading
          title="What you hear about"
          subtitle="Categories, quiet hours and digests are managed in one place for every channel."
        />

        <Button
          label="Notification preferences"
          variant="outline"
          onPress={() => router.push('/settings/notifications')}
        />

        {/* ── Other devices — §45 ───────────────────────────────────────── */}
        <Heading
          title="Your devices"
          subtitle="Everywhere you are signed in and able to receive notifications."
        />

        {isLoadingDevices ? (
          <ActivityIndicator color={tokens.color.primary[500]} />
        ) : devices.length === 0 ? (
          <Text
            style={{ color: tokens.color.text.secondary }}
            className="text-xs font-semibold leading-relaxed"
          >
            No devices are registered for notifications yet.
          </Text>
        ) : (
          devices.map(({ device, isCurrentDevice }) => (
            <DeviceRow key={device.id} device={device} isCurrentDevice={isCurrentDevice} />
          ))
        )}
      </ScrollEndScrollView>

      {descriptor ? (
        <ConsentSheet
          visible={consentVisible}
          integrationName="notifications"
          consent={descriptor.consent}
          permissions={descriptor.permissions}
          mode={registration?.mode ?? 'NOT_CONFIGURED'}
          onAccept={() => {
            setConsentVisible(false);
            void enable();
          }}
          onDecline={() => setConsentVisible(false)}
        />
      ) : null}
    </SafeAreaView>
  );
}

function DeviceRow({
  device,
  isCurrentDevice,
}: {
  device: NotificationDevice;
  isCurrentDevice: boolean;
}) {
  const { tokens } = useTheme();

  return (
    <View
      style={{ borderColor: tokens.color.border.default }}
      className="border rounded-2xl p-4 mb-2.5"
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${device.friendlyName ?? device.platform}${
        isCurrentDevice ? ', this device' : ''
      }. ${device.isActive ? 'Active' : 'Inactive'}.${
        device.suppressionReason ? ` ${device.suppressionReason}` : ''
      }`}
    >
      <View className="flex-row items-center justify-between mb-1">
        <Text style={{ color: tokens.color.text.primary }} className="text-sm font-bold">
          {device.friendlyName ?? device.platform}
        </Text>
        {isCurrentDevice ? (
          <Text
            style={{ color: tokens.color.text.placeholder }}
            className="text-[9px] font-black uppercase tracking-widest"
          >
            This device
          </Text>
        ) : null}
      </View>

      <Text style={{ color: tokens.color.text.secondary }} className="text-xs font-semibold">
        Registered {new Date(device.registeredAt).toLocaleDateString()}
        {device.lastDeliveredAt
          ? ` · last delivery ${new Date(device.lastDeliveredAt).toLocaleDateString()}`
          : ' · nothing delivered yet'}
      </Text>

      {/* B13 already models why a device stopped receiving. Rendering it is
          what turns "notifications randomly stopped" into something a member
          can act on. */}
      {device.suppressionReason ? (
        <Text
          style={{ color: tokens.color.warning.default }}
          className="text-xs font-semibold leading-relaxed mt-1.5"
        >
          {device.suppressionReason}
        </Text>
      ) : null}
    </View>
  );
}

function Heading({ title, subtitle }: { title: string; subtitle?: string }) {
  const { tokens } = useTheme();
  return (
    <View className="mb-2.5 mt-5">
      <Text
        style={{ color: tokens.color.text.primary }}
        className="text-xs font-black uppercase tracking-widest"
        accessibilityRole="header"
      >
        {title}
      </Text>
      {subtitle ? (
        <Text
          style={{ color: tokens.color.text.secondary }}
          className="text-xs font-semibold leading-relaxed mt-1"
        >
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}
