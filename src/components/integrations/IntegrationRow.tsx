// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Integration list row (Frontend Phase 16, §5 · §58)
//
// One row of the connection centre. Renders an `IntegrationListItem` — the
// catalogue entry joined to its live state — and nothing else.
//
// ── §58, and why the accessibility label is assembled rather than implied ────
//
// Visually this row is a name, a badge, a description and a chevron, read in
// that order by anybody who can see it. A screen reader traversing the same
// tree announces four separate fragments in whatever order the layout produces,
// and "Connected" announced on its own says nothing about what is connected.
//
// So the row is a single accessible element with a composed label built by
// `accessibilityLabelFor`, which puts the name, the state, the simulation
// caveat and the last error into one utterance. The visual tree stays as it is;
// the announced one is written deliberately.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/design-system';
import { accessibilityLabelFor, isBlockedByBuild } from '@/lib/integrations/status';
import { IntegrationStatusBadge } from './IntegrationNotices';
import type { IntegrationListItem } from '@/types/integrations';

export function IntegrationRow({
  item,
  onPress,
}: {
  item: IntegrationListItem;
  onPress: () => void;
}) {
  const { tokens } = useTheme();
  const { descriptor, connection } = item;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      // One utterance, composed. See the header.
      accessibilityLabel={accessibilityLabelFor(
        descriptor.name,
        connection.status,
        connection.mode,
        connection.lastError
      )}
      accessibilityHint={`Opens ${descriptor.name} settings`}
      style={{ borderColor: tokens.color.border.default }}
      className="border rounded-2xl p-4 mb-2.5 active:opacity-70"
      testID={`integration-row-${descriptor.provider}`}
    >
      <View className="flex-row items-start">
        <View className="flex-1 mr-3">
          <Text
            style={{ color: tokens.color.text.primary }}
            className="text-sm font-black tracking-tight mb-1"
          >
            {descriptor.name}
          </Text>
          <Text
            style={{ color: tokens.color.text.secondary }}
            className="text-xs font-semibold leading-relaxed mb-2.5"
          >
            {descriptor.description}
          </Text>

          <IntegrationStatusBadge status={connection.status} mode={connection.mode} />

          {connection.account ? (
            <Text
              style={{ color: tokens.color.text.placeholder }}
              className="text-[11px] font-bold mt-2"
              // Already in the composed label above; hidden here so it is not
              // announced twice.
              accessibilityElementsHidden
              importantForAccessibility="no"
            >
              {connection.account.accountLabel}
            </Text>
          ) : null}
        </View>

        {/* No chevron on a row that leads to an explanation rather than to a
            choice. A disclosure arrow promises somewhere to go. */}
        {isBlockedByBuild(connection.status) ? null : (
          <Ionicons name="chevron-forward" size={16} color={tokens.color.text.placeholder} />
        )}
      </View>
    </Pressable>
  );
}
