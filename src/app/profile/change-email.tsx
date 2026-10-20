import React, { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ScreenHeader } from '@/components/ScreenHeader';
import { KeyboardAwareScrollView } from '@/components/layout/KeyboardAwareScrollView';
import { Button } from '@/components/Button';
import { useTheme } from '@/design-system';
import { useEmailChange, useEmailIdentity } from '@/hooks/integrations';
import { isEmailChangeError } from '@/lib/auth-api';
import { isIntegrationError } from '@/lib/integrations/errors';
import { pendingExpiry } from '@/lib/pending-email-change';
import { backOr } from '@/lib/navigation';

/**
 * Changes the email address a member signs in with (`PUT /auth/email`, served
 * since 20 Oct 2026).
 *
 * ── Nothing changes when this screen succeeds ───────────────────────────────
 *
 * The server sends a link to the NEW address, and the old one stays the login
 * until that link is opened and its button pressed. So the success state says
 * where the link went and which address still signs in, and never "changed".
 * The link opens a page on the API, not this app: its path is not one of the
 * App Link filters, so the page does the confirming.
 *
 * ── Why it asks for the current password ────────────────────────────────────
 *
 * Moving the sign-in address is how an account is taken, so a live session on
 * an unlocked phone is not enough. The server requires the password and so
 * does the form.
 *
 * ── Unanswered is not no ────────────────────────────────────────────────────
 *
 * When no answer arrives the request may still have landed and the link may be
 * on its way. The screen says so rather than "failed", because a member told it
 * failed asks again, and every ask spends one of six emails a day.
 */

const ADDRESS_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** "in 40 seconds", "at about 14:05", "tomorrow at about 09:30". */
function describeWait(seconds: number, now: Date = new Date()): string {
  if (seconds < 90) return `in ${Math.max(1, Math.round(seconds))} seconds`;
  if (seconds < 60 * 60) return `in ${Math.ceil(seconds / 60)} minutes`;

  const at = new Date(now.getTime() + seconds * 1000);
  const clock = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
  const sameDay = at.toDateString() === now.toDateString();

  return sameDay ? `at about ${clock}` : `tomorrow at about ${clock}`;
}

function clockOf(milliseconds: number): string {
  const at = new Date(milliseconds);
  return `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
}

interface Failure {
  message: string;
  hint: string | null;
  /** Which field it is about, so the words sit beside it. */
  field: 'password' | 'address' | null;
}

export default function ChangeEmailScreen() {
  const { tokens } = useTheme();
  const { email, pendingChange } = useEmailIdentity();
  const changeEmail = useEmailChange();

  const [address, setAddress] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [isVisible, setIsVisible] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [sent, setSent] = useState<{ to: string; from: string } | null>(null);

  const currentAddress = email?.address ?? '';
  const trimmed = address.trim();

  // ── What the form is waiting for, decided while it is filled in ───────────
  const stillNeeded: string[] = [];
  if (currentPassword.length === 0) stillNeeded.push('your current password');
  if (trimmed.length === 0) stillNeeded.push('the new email address');

  const addressProblem =
    trimmed.length > 0 && !ADDRESS_SHAPE.test(trimmed)
      ? 'That does not look like an email address yet.'
      : currentAddress && trimmed.toLowerCase() === currentAddress.toLowerCase()
        ? 'That is already the email address on your account.'
        : null;

  const canSubmit = stillNeeded.length === 0 && addressProblem === null;

  const handleSubmit = async () => {
    if (!canSubmit || changeEmail.isPending) return;

    setFailure(null);

    try {
      const state = await changeEmail.mutateAsync({ address: trimmed, currentPassword });
      setCurrentPassword('');
      setSent({ to: state.pendingAddress ?? trimmed, from: state.address });
    } catch (cause) {
      setFailure(describeFailure(cause, trimmed, currentAddress));
    }
  };

  if (sent) {
    return (
      <SafeAreaView className="flex-1 bg-surface-card">
        <ScreenHeader title="Change email" />
        <View className="flex-1 px-6 pt-4 justify-between">
          <View testID="email-change-sent" accessibilityRole="summary">
            <Ionicons name="mail-outline" size={28} color={tokens.color.primary[500]} />
            <Text className="text-base font-bold text-content-strong mt-3 leading-relaxed">
              {sent.from
                ? `We sent a link to ${sent.to}; your sign-in stays ${sent.from} until you open it.`
                : `We sent a link to ${sent.to}. Nothing changes until you open it.`}
            </Text>
            <Text className="text-sm text-content-muted mt-3 leading-relaxed">
              The link works for 2 hours. It opens a page from Diaspora in your browser: press the
              button there, then come back to the app. If nothing arrives, check the address and ask
              again.
            </Text>
          </View>
          <View className="py-6">
            <Button label="Done" onPress={() => backOr('/settings/integrations/email')} />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-surface-card">
      <ScreenHeader title="Change email" />

      <KeyboardAwareScrollView
        className="flex-1"
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'space-between' }}
      >
        <View className="px-6">
          <Text className="text-base text-content-muted leading-relaxed">
            {currentAddress
              ? `You sign in with ${currentAddress}. We will send a link to the new address, and nothing changes until you open it. Other devices are signed out when it changes.`
              : 'We will send a link to the new address, and nothing changes until you open it.'}
          </Text>

          {pendingChange ? (
            <Text testID="email-change-already-pending" className="text-xs font-semibold text-content-muted mt-3 leading-relaxed">
              You already asked to move to {pendingChange.to}. That link works until about{' '}
              {clockOf(pendingExpiry(pendingChange))}. Asking again sends a new link.
            </Text>
          ) : null}

          <Text className="text-sm font-semibold text-content-secondary mb-2 mt-5">New email address</Text>
          <View className="flex-row items-center border border-subtle rounded-2xl bg-surface-background px-4 h-14">
            <Ionicons name="mail-outline" size={18} color={tokens.color.text.placeholder} />
            <TextInput
              testID="new-email-input"
              placeholder="you@example.com"
              value={address}
              onChangeText={setAddress}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              className="flex-1 text-base font-semibold ml-2"
              accessibilityLabel="New email address"
              placeholderTextColor={tokens.color.text.placeholder}
              style={{ color: tokens.color.text.primary }}
            />
          </View>

          {addressProblem ? (
            <Text className="text-error-default text-xs font-semibold mt-2">{addressProblem}</Text>
          ) : null}

          <Text className="text-sm font-semibold text-content-secondary mb-2 mt-5">Current password</Text>
          <View className="flex-row items-center border border-subtle rounded-2xl bg-surface-background px-4 h-14">
            <Ionicons name="lock-closed-outline" size={18} color={tokens.color.text.placeholder} />
            <TextInput
              testID="current-password-input"
              placeholder="The password you use now"
              value={currentPassword}
              onChangeText={setCurrentPassword}
              secureTextEntry={!isVisible}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="current-password"
              className="flex-1 text-base font-semibold ml-2"
              accessibilityLabel="Current password"
              placeholderTextColor={tokens.color.text.placeholder}
              style={{ color: tokens.color.text.primary }}
            />
          </View>

          {failure?.field === 'password' ? (
            <Text className="text-error-default text-xs font-semibold mt-2">{failure.message}</Text>
          ) : null}

          <TouchableOpacity
            testID="toggle-visibility"
            onPress={() => setIsVisible((visible) => !visible)}
            className="mt-3 self-start py-2 flex-row items-center active:opacity-75"
            accessibilityRole="button"
            accessibilityLabel={isVisible ? 'Hide password' : 'Show password'}
          >
            <Ionicons
              name={isVisible ? 'eye-off-outline' : 'eye-outline'}
              size={16}
              color={tokens.color.text.placeholder}
            />
            <Text className="text-xs font-bold text-content-muted ml-2">
              {isVisible ? 'Hide password' : 'Show password'}
            </Text>
          </TouchableOpacity>

          {failure ? (
            <View testID="email-change-failure" accessibilityRole="alert" className="mt-4">
              {failure.field !== 'password' ? (
                <Text className="text-error-default text-sm font-semibold">{failure.message}</Text>
              ) : null}
              {failure.hint ? (
                <Text className="text-content-muted text-xs font-semibold mt-1">{failure.hint}</Text>
              ) : null}
            </View>
          ) : null}
        </View>

        <View className="px-6 py-6">
          {stillNeeded.length > 0 ? (
            <Text testID="email-change-still-needed" className="text-xs font-semibold text-content-muted mb-3">
              Still needed: {stillNeeded.join(' and ')}.
            </Text>
          ) : null}
          <Button
            testID="send-email-change"
            label="Send the link"
            isLoading={changeEmail.isPending}
            disabled={!canSubmit || changeEmail.isPending}
            onPress={() => void handleSubmit()}
          />
        </View>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

/** The words for a refusal, in the member's terms. */
function describeFailure(cause: unknown, requested: string, current: string): Failure {
  const staysWith = current ? ` You still sign in with ${current}.` : '';

  if (isEmailChangeError(cause)) {
    switch (cause.refusal) {
      case 'wrongPassword':
        return {
          message: 'That is not your current password.',
          hint: 'Nothing was changed and no email was sent.',
          field: 'password',
        };
      case 'sameAddress':
      case 'invalid':
        return { message: cause.message, hint: cause.hint ?? null, field: 'address' };
      case 'rateLimited':
        return {
          message: 'Too many tries for now.',
          hint:
            cause.retryAfterSeconds != null
              ? `You can try again ${describeWait(cause.retryAfterSeconds)}.${staysWith}`
              : `Wait a few minutes before trying again.${staysWith}`,
          field: null,
        };
      case 'emailUnavailable':
        return {
          message: 'Diaspora cannot send email right now, so your address was not changed.',
          hint: `Try again later.${staysWith}`,
          field: null,
        };
      case 'unanswered':
        return {
          message: 'No answer arrived from Diaspora, so we cannot tell whether the link was sent.',
          hint: `It may have been. Check ${requested} for an email from Diaspora before asking again.${staysWith}`,
          field: null,
        };
      default:
        return { message: cause.message, hint: cause.hint ?? null, field: null };
    }
  }

  if (isIntegrationError(cause)) {
    return { message: cause.message, hint: cause.hint ?? null, field: null };
  }

  return {
    message: 'We could not ask for the change.',
    hint: `Try again.${staysWith}`,
    field: null,
  };
}
