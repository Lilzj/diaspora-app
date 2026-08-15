// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Consent and permission explanation (Frontend Phase 16, §36 · §37)
//
// §37 in one sentence: **"Do not bury meaningful consent inside a generic
// Continue button."**
//
// The way that is enforced here is structural rather than editorial. The sheet
// takes an `IntegrationConsentCopy`, whose four fields are all required by the
// type — what will be accessed, why, what Diaspora stores, and what it does not
// — and renders all four. A screen cannot open an authorization flow with a
// one-line prompt, because the component that opens it is this one and this one
// draws the whole thing.
//
// ── The two design decisions worth defending ─────────────────────────────────
//
//   **"What Diaspora does not store" is given equal weight, not a footnote.**
//   It is usually the more informative list — "your Google password", "events
//   Diaspora did not create", "your contacts" — and it is the list that would
//   be cut first for space if it were prose. Giving it its own block with its
//   own icon means it survives a layout change.
//
//   **The confirm button says what it does, not "Continue".** "Connect Google
//   Calendar" is the whole of §37's complaint about generic buttons, and a
//   label that names the action is also what a screen reader announces in
//   isolation — a member navigating by controls hears the action rather than
//   "Continue, button".
//
// ── §36, and the permission list ─────────────────────────────────────────────
//
// `<PermissionExplainer>` renders each permission with its own rationale, and
// distinguishes mandatory from optional. That distinction is the visible half
// of §36's "do not request permissions unrelated to the selected capability" —
// a member can see that calendar *read* access is optional and only needed for
// two-way sync, which is both true and the reason the app does not ask for it.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/design-system';
import { Button } from '@/components/Button';
import { SimulationMarker } from './IntegrationNotices';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type {
  IntegrationConsentCopy,
  IntegrationMode,
  IntegrationPermission,
} from '@/types/integrations';

// ═════════════════════════════════════════════════════════════════════════════
// PERMISSION EXPLAINER — §36
// ═════════════════════════════════════════════════════════════════════════════

export function PermissionExplainer({ permissions }: { permissions: IntegrationPermission[] }) {
  const { tokens } = useTheme();

  if (permissions.length === 0) return null;

  return (
    <View testID="integration-permission-explainer">
      {permissions.map((permission) => (
        <View
          key={permission.key}
          style={{ borderColor: tokens.color.border.default }}
          className="border rounded-2xl p-3.5 mb-2"
          accessible
          accessibilityRole="text"
          accessibilityLabel={`${permission.label}. ${
            permission.isMandatory ? 'Required.' : 'Optional.'
          } ${permission.rationale}`}
        >
          <View className="flex-row items-center justify-between mb-1">
            <Text
              style={{ color: tokens.color.text.primary }}
              className="text-xs font-black flex-1 mr-2"
            >
              {permission.label}
            </Text>
            <Text
              style={{
                color: permission.isMandatory
                  ? tokens.color.text.secondary
                  : tokens.color.text.placeholder,
              }}
              className="text-[9px] font-black uppercase tracking-widest"
            >
              {permission.isMandatory ? 'Required' : 'Optional'}
            </Text>
          </View>
          <Text
            style={{ color: tokens.color.text.secondary }}
            className="text-xs font-semibold leading-relaxed"
          >
            {permission.rationale}
          </Text>
        </View>
      ))}
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// CONSENT SHEET — §37
// ═════════════════════════════════════════════════════════════════════════════

export interface ConsentSheetProps {
  visible: boolean;
  /** The integration's own name. Appears in the confirm button. */
  integrationName: string;
  consent: IntegrationConsentCopy;
  permissions: IntegrationPermission[];
  /** So a member is never asked to consent to something simulated without knowing. */
  mode: IntegrationMode;
  onAccept: () => void;
  onDecline: () => void;
}

export function ConsentSheet({
  visible,
  integrationName,
  consent,
  permissions,
  mode,
  onAccept,
  onDecline,
}: ConsentSheetProps) {
  const insets = useSafeAreaInsets();
  const { tokens } = useTheme();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDecline}
      statusBarTranslucent
      navigationBarTranslucent>
      <View className="flex-1 justify-end bg-black/40">
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onDecline}
          accessibilityLabel={`Close without connecting ${integrationName}`}
        />

        <View
          style={{ backgroundColor: tokens.color.surface.elevated }}
          className="rounded-t-3xl max-h-[88%]"
          testID="integration-consent-sheet"
        >
          <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 8 }}>
            {/* The heading names the integration; the button names the action.
                They said the same words until a test found the duplicate, and a
                screen reader was announcing "Connect Apple Calendar" twice —
                once as a heading with nothing to do, once as the control. */}
            <Text
              style={{ color: tokens.color.text.primary }}
              className="text-xl font-black tracking-tight mb-1"
              accessibilityRole="header"
            >
              {integrationName}
            </Text>

            {/* Rendered before the consent text, not after. A member reading
                what they are agreeing to needs to know first whether it is
                real — §69. */}
            <View className="mb-4">
              <SimulationMarker mode={mode} />
            </View>

            <ConsentBlock
              icon="eye-outline"
              tone={tokens.color.info.default}
              title="What Diaspora will access"
              items={consent.accesses}
            />

            <ConsentBlock
              icon="help-circle-outline"
              tone={tokens.color.info.default}
              title="Why"
              items={consent.reasons}
            />

            <ConsentBlock
              icon="save-outline"
              tone={tokens.color.text.secondary}
              title="What Diaspora keeps"
              items={consent.stores}
            />

            {/* Equal weight, its own block. See the file header. */}
            <ConsentBlock
              icon="shield-checkmark-outline"
              tone={tokens.color.success.default}
              title="What Diaspora never keeps"
              items={consent.doesNotStore}
            />

            {permissions.length > 0 ? (
              <>
                <Text
                  style={{ color: tokens.color.text.placeholder }}
                  className="text-[10px] font-black uppercase tracking-widest mt-4 mb-2"
                >
                  Permissions
                </Text>
                <PermissionExplainer permissions={permissions} />
              </>
            ) : null}

            <View
              style={{
                backgroundColor: tokens.color.surface.card,
                borderColor: tokens.color.border.default,
              }}
              className="rounded-2xl border p-3.5 mt-2"
            >
              <Text
                style={{ color: tokens.color.text.secondary }}
                className="text-xs font-semibold leading-relaxed"
              >
                {consent.privacyNote}
              </Text>
              <Text
                style={{ color: tokens.color.text.placeholder }}
                className="text-xs font-semibold leading-relaxed mt-2"
              >
                {consent.disconnectSummary}
              </Text>
            </View>
          </ScrollView>

          <View
            style={{ borderTopColor: tokens.color.border.default, paddingBottom: insets.bottom + 16 }}
            className="border-t px-6 pt-4"
          >
            {/* Names the action. Never "Continue" — §37. */}
            <Button label={`Connect ${integrationName}`} onPress={onAccept} />
            <Button label="Not now" variant="ghost" onPress={onDecline} className="mt-2" />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function ConsentBlock({
  icon,
  tone,
  title,
  items,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  tone: string;
  title: string;
  items: string[];
}) {
  const { tokens } = useTheme();

  if (items.length === 0) return null;

  return (
    <View className="mb-4" accessible accessibilityRole="text" accessibilityLabel={`${title}: ${items.join('. ')}`}>
      <View className="flex-row items-center mb-1.5">
        <Ionicons name={icon} size={14} color={tone} />
        <Text
          style={{ color: tone }}
          className="text-[10px] font-black uppercase tracking-widest ml-1.5"
        >
          {title}
        </Text>
      </View>

      {items.map((item, index) => (
        <View key={`${title}-${index}`} className="flex-row items-start mb-1">
          <Text style={{ color: tokens.color.text.placeholder }} className="text-xs mr-2">
            •
          </Text>
          <Text
            style={{ color: tokens.color.text.primary }}
            className="text-xs font-semibold leading-relaxed flex-1"
          >
            {item}
          </Text>
        </View>
      ))}
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// PERMISSION RECOVERY — §13, §14
// ═════════════════════════════════════════════════════════════════════════════

/**
 * What to do about a permission that is not granted.
 *
 * The two recoveries are genuinely different and offering the wrong one
 * produces a control that cannot work:
 *
 *   `denied` and re-askable   → "Allow" re-triggers the OS prompt
 *   `blocked`                 → only Settings will do it; an "Allow" button
 *                               here does nothing at all and teaches the member
 *                               that the app is broken
 *
 * `restricted` gets neither, because the member cannot change it — it is a
 * managed-device policy — and asking them to try is asking them to fail.
 */
export function PermissionRecovery({
  state,
  canAskAgain,
  onRequest,
  onOpenSettings,
}: {
  state: 'denied' | 'blocked' | 'restricted' | 'notRequested';
  canAskAgain: boolean;
  onRequest: () => void;
  onOpenSettings: () => void;
}) {
  const { tokens } = useTheme();

  if (state === 'restricted') {
    return (
      <Text
        style={{ color: tokens.color.text.secondary }}
        className="text-xs font-semibold leading-relaxed"
      >
        This is managed by whoever set up this device, so it cannot be changed here.
      </Text>
    );
  }

  if (state === 'blocked' || !canAskAgain) {
    return <Button label="Open settings" variant="outline" onPress={onOpenSettings} />;
  }

  return <Button label="Allow" onPress={onRequest} />;
}
