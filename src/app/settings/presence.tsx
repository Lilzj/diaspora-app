// ─────────────────────────────────────────────────────────────────────────────
// Settings — Location while the app is open
//
// The opt-in behind "I arrive in an area I chose" (`location.enteredArea`).
// Everything a member needs to decide is on this one screen, in plain words:
// off by default, only while the app is open, coarse, no history, and off
// forgets the last area. Switching on asks for the phone's foreground location
// permission first; nothing is switched on without it.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { ActivityIndicator, Linking, Pressable, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/components/ScreenHeader';
import { ScreenScrollView } from '@/components/layout/bottom-inset';
import { useTheme } from '@/design-system';
import { requestForegroundPermission, usePresence, useSetPresence } from '@/hooks/presence';
import { PRESENCE_EXPLANATION } from '@/lib/location/presence';


export default function PresenceSettingsScreen() {
  const { tokens } = useTheme();
  const { presence, isEnabled, isLoading, isError, refetch } = usePresence();
  const setPresence = useSetPresence();
  const [problem, setProblem] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);

  const busy = setPresence.isPending;

  const toggle = async (next: boolean) => {
    setProblem(null);
    setPermissionDenied(false);

    if (next) {
      let permission;
      try {
        permission = await requestForegroundPermission();
      } catch {
        permission = 'undetermined' as const;
      }
      if (permission !== 'granted') {
        setPermissionDenied(true);
        return;
      }
    }

    try {
      await setPresence.mutateAsync(next);
    } catch {
      setProblem(
        next
          ? 'It could not be switched on. Nothing has changed — try again in a moment.'
          : 'It could not be switched off. Try again in a moment; until then it stays on.'
      );
    }
  };

  return (
    <SafeAreaView style={{ backgroundColor: tokens.color.surface.background }} className="flex-1">
      <ScreenHeader title="Location while the app is open" />
      <ScreenScrollView contentContainerStyle={{ padding: 16 }}>
        <View
          style={{ backgroundColor: tokens.color.surface.card, borderColor: tokens.color.surface.border }}
          className="rounded-2xl border p-4 mb-4"
        >
          <View className="flex-row items-center">
            <View className="flex-1 pr-3">
              <Text style={{ color: tokens.color.text.primary }} className="text-sm font-black">
                Use my location while the app is open
              </Text>
              <Text style={{ color: tokens.color.text.secondary }} className="text-xs font-semibold mt-1">
                {isLoading
                  ? 'Checking…'
                  : isError
                    ? 'Your setting could not be read.'
                    : isEnabled
                      ? 'On'
                      : 'Off'}
              </Text>
            </View>
            {isLoading || busy ? (
              <ActivityIndicator />
            ) : (
              <Switch
                accessibilityLabel="Use my location while the app is open"
                value={isEnabled}
                disabled={isError}
                onValueChange={(value) => void toggle(value)}
              />
            )}
          </View>

          {isError ? (
            <Pressable accessibilityRole="button" onPress={() => void refetch()} className="mt-3">
              <Text style={{ color: tokens.color.primary[600] }} className="text-xs font-black">
                Try again
              </Text>
            </Pressable>
          ) : null}

          {isEnabled && presence?.lastArea ? (
            <Text style={{ color: tokens.color.text.secondary }} className="text-xs font-semibold mt-3">
              Last area: {presence.lastArea.name}
            </Text>
          ) : null}
        </View>

        {permissionDenied ? (
          <View
            style={{ backgroundColor: tokens.color.surface.card, borderColor: tokens.color.warning.default }}
            className="rounded-2xl border p-4 mb-4"
          >
            <Text style={{ color: tokens.color.text.primary }} className="text-xs font-bold">
              Your phone has not allowed Diaspora to use your location, so this stays off. You can
              allow “while using the app” in your phone’s settings.
            </Text>
            <Pressable accessibilityRole="button" onPress={() => void Linking.openSettings()} className="mt-2">
              <Text style={{ color: tokens.color.primary[600] }} className="text-xs font-black">
                Open phone settings
              </Text>
            </Pressable>
          </View>
        ) : null}

        {problem ? (
          <Text style={{ color: tokens.color.error.default }} className="text-xs font-bold mb-4">
            {problem}
          </Text>
        ) : null}

        <Text style={{ color: tokens.color.text.primary }} className="text-sm font-black mb-2">
          What this does
        </Text>
        {PRESENCE_EXPLANATION.map((line) => (
          <View key={line} className="flex-row mb-2">
            <Text style={{ color: tokens.color.text.secondary }} className="text-xs font-semibold mr-2">
              •
            </Text>
            <Text style={{ color: tokens.color.text.secondary }} className="text-xs font-semibold flex-1">
              {line}
            </Text>
          </View>
        ))}
      </ScreenScrollView>
    </SafeAreaView>
  );
}
