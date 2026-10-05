// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Email integration (Frontend Phase 16, §17)
//
// The frontend half of an integration whose delivery is entirely the backend's.
//
// Three states are kept apart that a simpler screen would merge, and each
// merge would be a false statement:
//
//   **Verified / not verified / not knowable.** Served since 5 Oct 2026 by
//   `GET /auth/email`. "Not knowable" now means only that the read failed: the
//   screen never turns a failed read into "not verified".
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

import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollEndScrollView } from '@/components/ScrollEndNavigationMenu';
import { router, useLocalSearchParams } from 'expo-router';
import { confirmEmailLink, type EmailConfirmOutcome } from '@/lib/auth-api';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Button } from '@/components/Button';
import { useTheme } from '@/design-system';
import { useEmailIdentity, useNotificationPreferences } from '@/hooks/integrations';
import { IntegrationGapNotice, IntegrationErrorNotice } from '@/components/integrations';
import { isIntegrationError } from '@/lib/integrations/errors';
import { useBottomInset } from '@/components/layout/bottom-inset';

const LINK_OUTCOME_TEXT: Record<EmailConfirmOutcome | 'Unknown', string> = {
  Verified: 'Thank you. Your email address is confirmed.',
  AlreadyVerified: 'This email address was already confirmed.',
  AddressChanged: 'That link was for an address no longer on your account. Send a new link below.',
  Invalid: 'That link has expired or is not valid. Links work for 12 hours. Send a new one below.',
  Unknown: 'We could not reach Diaspora to confirm the link. The status above is the latest we have.',
};

export default function EmailIntegrationScreen() {
  // The guard rail: the phone's gesture area plus breathing room.
  const bottomInset = useBottomInset();

  const { tokens } = useTheme();
  const { email, isLoading, isVerificationStateKnown, resend, isResending, refetch } = useEmailIdentity();

  // ── A verification link this app opened (App Link, 5 Oct 2026) ─────────────
  //
  // `lib/app-links.ts` maps `https://<api>/email/confirm?token=…` here as
  // `confirmToken`. The member tapped the link in their mail app, so confirming at
  // once is their action. Mail scanners never reach this path, because they do not
  // open apps. Run once per token, even if the screen re-renders.
  const { confirmToken } = useLocalSearchParams<{ confirmToken?: string }>();
  const confirmedToken = useRef<string | null>(null);
  const [linkOutcome, setLinkOutcome] = useState<EmailConfirmOutcome | 'Unknown' | null>(null);

  useEffect(() => {
    if (!confirmToken || confirmedToken.current === confirmToken) return;
    confirmedToken.current = confirmToken;

    confirmEmailLink(confirmToken)
      .then(setLinkOutcome)
      // Unanswered is not no: it may have landed, so the state below is reread
      // and the message says to check it rather than that it failed.
      .catch(() => setLinkOutcome('Unknown'))
      .finally(() => void refetch());
  }, [confirmToken, refetch]);
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
                  : 'Not confirmed yet. Confirming it proves this inbox is yours.'}
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

            {linkOutcome ? (
              <Text
                testID="email-link-outcome"
                style={{
                  color:
                    linkOutcome === 'Verified' || linkOutcome === 'AlreadyVerified'
                      ? tokens.color.success.default
                      : tokens.color.warning.default,
                }}
                className="text-xs font-bold leading-relaxed mt-2"
              >
                {LINK_OUTCOME_TEXT[linkOutcome]}
              </Text>
            ) : null}

            {/* What happens next, said once the server has accepted the send. */}
            {email?.verificationSentAt && !email.isVerified ? (
              <Text
                testID="email-verification-sent"
                style={{ color: tokens.color.text.secondary }}
                className="text-xs font-semibold leading-relaxed mt-2"
              >
                We sent a link to {email.address}. It works for 12 hours. Open it on any device,
                press Confirm, then come back here.
              </Text>
            ) : null}

            {isVerificationStateKnown && !email?.isVerified && email?.address ? (
              <View className="mt-3">
                <Button
                  label={
                    isResending
                      ? 'Sending…'
                      : email.verificationSentAt
                        ? 'Send the link again'
                        : 'Send confirmation email'
                  }
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
            detail="Changing your email address is not available yet. Confirming it is. Your email preferences below are real and take effect immediately."
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
