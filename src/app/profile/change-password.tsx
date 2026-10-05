import React, { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ScreenHeader } from '@/components/ScreenHeader';
import { KeyboardAwareScrollView } from '@/components/layout/KeyboardAwareScrollView';
import { Button } from '@/components/Button';
import { useTheme } from '@/design-system';
import { changePassword } from '@/lib/auth-api';
import { isIntegrationError } from '@/lib/integrations/errors';
import { useNotification } from '@/providers/notification-provider';
import { meetsPasswordRules } from '@/lib/password-policy';
import { PasswordRequirements } from '@/components/PasswordRequirements';
import { backOr } from '@/lib/navigation';

/**
 * Changes the password of a member who is already signed in.
 *
 * ── Why this screen did not exist ───────────────────────────────────────────
 *
 * `POST /auth/change-password` has been deployed and answering the whole time,
 * and nothing in the application called it. Combined with there being no
 * recovery screen either, the password a member set at registration was
 * write-once: never used to sign in, never changeable, never recoverable — and
 * required to delete the account (UAT-127).
 *
 * ── Why it asks for the current password ────────────────────────────────────
 *
 * The server requires it, and it is right to. Without it, anyone holding an
 * unlocked handset with a live session could change the password and lock the
 * owner out of their own account. Possession of the phone is not proof of
 * ownership of the account; the password is what closes that gap.
 */
export default function ChangePasswordScreen() {
  const { tokens } = useTheme();
  const { showToast } = useNotification();

  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [isVisible, setIsVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<{ message: string; hint: string | null } | null>(null);

  const passwordsMatch = password.length > 0 && password === confirmation;
  const isDifferent = password !== currentPassword;
  const canSubmit =
    currentPassword.length > 0 &&
    meetsPasswordRules(password) &&
    passwordsMatch &&
    isDifferent;

  const handleSubmit = async () => {
    if (!canSubmit) return;

    setIsLoading(true);
    setError(null);

    try {
      const result = await changePassword({ currentPassword, newPassword: password });

      showToast({
        type: 'success',
        title: 'Password changed',
        // The server names how many sessions it ended. That number is the
        // member's business — it is how they find out something they did not
        // recognise was signed in.
        message: result.message ?? 'Use your new password the next time you sign in.',
      });

      backOr();
    } catch (cause) {
      // The server distinguishes a wrong current password from a policy refusal
      // and from a previously-used one. Its message names which; this screen
      // shows it rather than flattening all three into "something went wrong".
      setError(
        isIntegrationError(cause)
          ? { message: cause.message, hint: cause.hint ?? null }
          : {
              message: 'We could not change your password.',
              hint: 'Check your current password and try again.',
            }
      );
    } finally {
      setIsLoading(false);
    }
  };

  const field = (
    label: string,
    value: string,
    onChange: (next: string) => void,
    testID: string,
    placeholder: string,
    autoComplete: 'current-password' | 'new-password'
  ) => (
    <>
      <Text className="text-sm font-semibold text-content-secondary mb-2 mt-5">{label}</Text>
      <View className="flex-row items-center border border-subtle rounded-2xl bg-surface-background px-4 h-14">
        <Ionicons name="lock-closed-outline" size={18} color={tokens.color.text.placeholder} />
        <TextInput
          testID={testID}
          placeholder={placeholder}
          value={value}
          onChangeText={onChange}
          secureTextEntry={!isVisible}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete={autoComplete}
          className="flex-1 text-base font-semibold ml-2"
          accessibilityLabel={label}
          placeholderTextColor={tokens.color.text.placeholder}
          style={{ color: tokens.color.text.primary }}
        />
      </View>
    </>
  );

  return (
    <SafeAreaView className="flex-1 bg-surface-card">
      <ScreenHeader title="Change password" />

      <KeyboardAwareScrollView
        className="flex-1"
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'space-between' }}
      >
        <View className="px-6">
          {/* ── Say what the server actually does ─────────────────────────────
              This first read "You will stay signed in on this device. Your other
              devices are not affected." The server disagrees: it answered
              "Your password has been changed. 14 other session(s) were signed
              out." Writing the reassuring version would have been the same
              defect this release is full of — a screen describing an outcome the
              platform did not produce. */}
          <Text className="text-base text-content-muted leading-relaxed">
            You will stay signed in on this device. Every other device will be signed out.
          </Text>

          {field(
            'Current password',
            currentPassword,
            setCurrentPassword,
            'current-password-input',
            'The password you use now',
            'current-password'
          )}

          {field(
            'New password',
            password,
            setPassword,
            'password-input',
            'Your new password',
            'new-password'
          )}

          <PasswordRequirements password={password} />

          {field(
            'Confirm new password',
            confirmation,
            setConfirmation,
            'confirm-input',
            'Type it again',
            'new-password'
          )}

          <TouchableOpacity
            testID="toggle-visibility"
            onPress={() => setIsVisible((visible) => !visible)}
            className="mt-3 self-start py-2 flex-row items-center active:opacity-75"
            accessibilityRole="button"
            accessibilityLabel={isVisible ? 'Hide passwords' : 'Show passwords'}
          >
            <Ionicons
              name={isVisible ? 'eye-off-outline' : 'eye-outline'}
              size={16}
              color={tokens.color.text.placeholder}
            />
            <Text className="text-xs font-bold text-content-muted ml-2">
              {isVisible ? 'Hide passwords' : 'Show passwords'}
            </Text>
          </TouchableOpacity>

          {/* Both said as they happen, while the fields are still on screen. */}
          {confirmation.length > 0 && !passwordsMatch ? (
            <Text className="text-error-default text-xs font-semibold mt-3">
              The two new passwords do not match.
            </Text>
          ) : null}

          {password.length > 0 && !isDifferent ? (
            <Text className="text-error-default text-xs font-semibold mt-3">
              Your new password has to be different from your current one.
            </Text>
          ) : null}

          {error ? (
            <View accessibilityRole="alert" className="mt-4">
              <Text className="text-error-default text-sm font-semibold">{error.message}</Text>
              {error.hint ? (
                <Text className="text-content-muted text-xs font-semibold mt-1">{error.hint}</Text>
              ) : null}
            </View>
          ) : null}
        </View>

        <View className="px-6 py-6">
          <Button
            label="Change password"
            isLoading={isLoading}
            disabled={!canSubmit}
            onPress={handleSubmit}
          />
        </View>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}
