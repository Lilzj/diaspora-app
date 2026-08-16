// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Email integration (Frontend Phase 16, §17)
//
// The frontend half of an integration whose delivery is entirely the backend's.
//
// Three states are kept apart that a simpler screen would merge, and each
// merge would be a false statement:
//
//   **Verified / not verified / not knowable.** With no verification contract
//   (GAP-008), Diaspora does not know whether the address is confirmed.
//   Rendering "not verified" would be a claim the platform has not made, so the
//   screen says the state cannot be checked in this build.
//
//   **Sent / delivered.** "We sent it" and "it arrived" are different, and an
//   address that is bouncing needs its own state or the member resends for ever
//   into a mailbox that will never receive it.
//
//   **Marketing / transactional.** Separate switches, never inferred from one
//   another. Turning off marketing must not stop a receipt, and turning on
//   receipts is not consent to marketing.
//
// The category and digest controls are B13's and live at
// `/settings/notifications`; §14 forbids duplicating them and this screen links
// there.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { ActivityIndicator, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollEndScrollView } from '@/components/ScrollEndNavigationMenu';
import { router } from 'expo-router';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Button } from '@/components/Button';
import { useTheme } from '@/design-system';
import { useEmailIdentity, useNotificationPreferences } from '@/hooks/integrations';
import { IntegrationGapNotice, IntegrationErrorNotice } from '@/components/integrations';
import { isIntegrationError } from '@/lib/integrations/errors';
import { useBottomInset } from '@/components/layout/bottom-inset';

export default function EmailIntegrationScreen() {
  // The guard rail: the phone's gesture area plus breathing room.
  const bottomInset = useBottomInset();

  const { tokens } = useTheme();
  const { email, isLoading, isVerificationStateKnown, resend, isResending } = useEmailIdentity();
  const preferences = useNotificationPreferences();
  const [resendError, setResendError] = useState<{ message: string; hint?: string | null; retryAfterSeconds?: number | null } | null>(null);

  const handleResend = async () => {
    setResendError(null);
    try {
      await resend();
    } catch (cause) {
      if (isIntegrationError(cause)) {
        setResendError({
          message: cause.message,
          hint: cause.hint,
          retryAfterSeconds: cause.retryAfterSeconds,
        });
      }
    }
  };

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: tokens.color.surface.background }}>
      <ScreenHeader title="Email" showBack />

      <ScrollEndScrollView className="flex-1 px-4 pt-4" contentContainerStyle={{ paddingBottom: bottomInset }}>
        <Heading title="Your address" />

        {isLoading ? (
          <ActivityIndicator color={tokens.color.primary[500]} />
        ) : (
          <View
            style={{ borderColor: tokens.color.border.default }}
            className="border rounded-2xl p-4 mb-3"
          >
            <Text style={{ color: tokens.color.text.primary }} className="text-sm font-black mb-1">
              {email?.address || 'No email address on your account'}
            </Text>

            {/* Not knowable is a third state, not a variant of "not verified". */}
            <Text
              style={{ color: tokens.color.text.secondary }}
              className="text-xs font-semibold leading-relaxed"
            >
              {!isVerificationStateKnown
                ? 'Diaspora cannot check whether this address is confirmed in this build.'
                : email?.isVerified
                  ? 'Confirmed.'
                  : 'Not confirmed yet. Some things will not be sent until it is.'}
            </Text>

            {/* "We sent it" and "it arrived" are different claims. */}
            {email?.deliveryState === 'bounced' || email?.deliveryState === 'suppressed' ? (
              <Text
                style={{ color: tokens.color.warning.default }}
                className="text-xs font-semibold leading-relaxed mt-2"
              >
                Mail to this address is not being delivered. Change it to start receiving email
                again.
              </Text>
            ) : null}

            {email?.pendingAddress ? (
              <Text
                style={{ color: tokens.color.text.secondary }}
                className="text-xs font-semibold leading-relaxed mt-2"
              >
                Waiting for you to confirm {email.pendingAddress}. Your current address stays in use
                until you do.
              </Text>
            ) : null}

            {isVerificationStateKnown && !email?.isVerified ? (
              <View className="mt-3">
                <Button
                  label={isResending ? 'Sending…' : 'Send confirmation email'}
                  variant="outline"
                  disabled={isResending}
                  onPress={() => void handleResend()}
                />
              </View>
            ) : null}
          </View>
        )}

        {resendError ? (
          <View className="mb-3">
            <IntegrationErrorNotice
              message={resendError.message}
              hint={resendError.hint}
              retryAfterSeconds={resendError.retryAfterSeconds}
            />
          </View>
        ) : null}

        <View className="mb-4">
          <IntegrationGapNotice
            gapKey="emailVerification"
            detail="Confirming and changing your email address needs a backend that does not exist yet. Your email preferences below are real and take effect immediately."
          />
        </View>

        {/* ── Real, live preferences from B13 ────────────────────────────── */}
        <Heading
          title="What Diaspora emails you"
          subtitle="These are saved to your account and apply everywhere you are signed in."
        />

        {preferences.isLoading ? (
          <ActivityIndicator color={tokens.color.primary[500]} />
        ) : preferences.preferences ? (
          <>
            <ToggleRow
              title="Email notifications"
              subtitle="The master switch for everything except security and payment mail."
              value={preferences.preferences.email}
              onChange={(next) => preferences.update({ email: next })}
            />

            <ToggleRow
              title="Marketing and product news"
              subtitle="Separate from receipts and alerts. Off unless you switch it on."
              value={preferences.preferences.communication.allowsMarketing}
              onChange={(next) => preferences.update({ allowsMarketing: next })}
            />

            {/* Rendered rather than hidden, because a member who cannot switch
                something off deserves to know why rather than to find no
                control at all. */}
            <View
              style={{
                backgroundColor: tokens.color.surface.card,
                borderColor: tokens.color.border.default,
              }}
              className="rounded-2xl border p-4 mb-2.5"
            >
              <Text style={{ color: tokens.color.text.primary }} className="text-sm font-bold mb-1">
                Security and payment email
              </Text>
              <Text
                style={{ color: tokens.color.text.secondary }}
                className="text-xs font-semibold leading-relaxed"
              >
                Always on. These tell you if somebody signs in from a new place or if money moves on
                your account, so they cannot be switched off.
              </Text>
            </View>

            <Button
              label="All notification settings"
              variant="outline"
              onPress={() => router.push('/settings/notifications')}
              className="mt-2"
            />
          </>
        ) : (
          <IntegrationErrorNotice
            message="Your email preferences could not be loaded."
            hint="Check your connection and try again."
          />
        )}
      </ScrollEndScrollView>
    </SafeAreaView>
  );
}

function ToggleRow({
  title,
  subtitle,
  value,
  onChange,
}: {
  title: string;
  subtitle: string;
  value: boolean;
  onChange: (next: boolean) => void;
}) {
  const { tokens } = useTheme();

  return (
    <View
      style={{ borderColor: tokens.color.border.default }}
      className="flex-row items-center border rounded-2xl p-4 mb-2.5"
    >
      <View className="flex-1 mr-3">
        <Text style={{ color: tokens.color.text.primary }} className="text-sm font-bold">
          {title}
        </Text>
        <Text
          style={{ color: tokens.color.text.secondary }}
          className="text-xs font-semibold leading-relaxed mt-1"
        >
          {subtitle}
        </Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        accessibilityLabel={title}
        accessibilityHint={subtitle}
      />
    </View>
  );
}

function Heading({ title, subtitle }: { title: string; subtitle?: string }) {
  const { tokens } = useTheme();
  return (
    <View className="mb-2.5 mt-4">
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
