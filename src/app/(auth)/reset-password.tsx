import React, { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ScreenHeader } from '@/components/ScreenHeader';
import { KeyboardAwareScrollView } from '@/components/layout/KeyboardAwareScrollView';
import { Button } from '@/components/Button';
import { useTheme } from '@/design-system';
import { resetPassword } from '@/lib/auth-api';
import { isIntegrationError } from '@/lib/integrations/errors';
import { MIN_PASSWORD_LENGTH } from '@/lib/password-policy';

/**
 * Completes account recovery with the code from `forgot-password`.
 *
 * ── Every session ends here, including this one ─────────────────────────────
 *
 * `POST /auth/reset-password` revokes **all** sessions on success, which is the
 * right behaviour: a member resetting a password they may have lost control of
 * should not leave somebody else's session alive. So this screen never tries to
 * continue into the app — it sends them to sign in with the password they just
 * chose, which is also the only way to confirm it took.
 */
export default function ResetPasswordScreen() {
  const { tokens } = useTheme();
  const params = useLocalSearchParams<{ email?: string }>();

  const [email, setEmail] = useState(params.email ?? '');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<{ message: string; hint: string | null } | null>(null);

  const passwordsMatch = password.length > 0 && password === confirmation;
  const canSubmit =
    email.trim().includes('@') &&
    code.trim().length === 6 &&
    password.length >= MIN_PASSWORD_LENGTH &&
    passwordsMatch;

  const handleSubmit = async () => {
    if (!canSubmit) return;

    setIsLoading(true);
    setError(null);

    try {
      await resetPassword({
        email: email.trim().toLowerCase(),
        code: code.trim(),
        newPassword: password,
      });

      // Not `push`: there is no session to come back to. Every token was
      // revoked by the call that just succeeded.
      router.replace({ pathname: '/(auth)/login', params: { reset: '1' } });
    } catch (cause) {
      setError(
        isIntegrationError(cause)
          ? { message: cause.message, hint: cause.hint ?? null }
          : {
              message: 'We could not reset your password.',
              hint: 'Check the code and try again. Codes expire after a few minutes.',
            }
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-surface-card">
      <ScreenHeader title="" />

      <KeyboardAwareScrollView
        className="flex-1"
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'space-between' }}
      >
        <View className="px-6">
          <Text className="text-3xl font-extrabold text-content-primary mb-2 tracking-tight">
            Choose a new password
          </Text>
          <Text className="text-base text-content-muted mb-8 leading-relaxed">
            {/* Channel-neutral, like the screen that sent it. Which wire carries a
                recovery code is the deployment's decision — the mailbox with an email
                provider configured, SMS without one — and the previous wording said
                "texted you" on both. */}
            Enter the six-digit code we sent you, then set a new password.
          </Text>

          {/* Prefilled from the previous screen, and still editable: a member who
              mistyped their address there should not have to start over. */}
          <Text className="text-sm font-semibold text-content-secondary mb-2">Email Address</Text>
          <View className="flex-row items-center border border-subtle rounded-2xl bg-surface-background px-4 h-14">
            <Ionicons name="mail-outline" size={18} color={tokens.color.text.placeholder} />
            <TextInput
              testID="email-input"
              placeholder="you@example.com"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              className="flex-1 text-base font-semibold ml-2"
              accessibilityLabel="Email address"
              placeholderTextColor={tokens.color.text.placeholder}
              style={{ color: tokens.color.text.primary }}
            />
          </View>

          <Text className="text-sm font-semibold text-content-secondary mb-2 mt-5">
            Recovery code
          </Text>
          <View className="flex-row items-center border border-subtle rounded-2xl bg-surface-background px-4 h-14">
            <Ionicons name="keypad-outline" size={18} color={tokens.color.text.placeholder} />
            <TextInput
              testID="code-input"
              placeholder="123456"
              value={code}
              onChangeText={(next) => setCode(next.replace(/[^0-9]/g, '').slice(0, 6))}
              keyboardType="number-pad"
              autoComplete="sms-otp"
              textContentType="oneTimeCode"
              maxLength={6}
              className="flex-1 text-base font-semibold ml-2 tracking-[8px]"
              accessibilityLabel="Six-digit recovery code"
              placeholderTextColor={tokens.color.text.placeholder}
              style={{ color: tokens.color.text.primary }}
            />
          </View>

          <Text className="text-sm font-semibold text-content-secondary mb-2 mt-5">
            New password
          </Text>
          <View className="flex-row items-center border border-subtle rounded-2xl bg-surface-background px-4 h-14">
            <Ionicons name="lock-closed-outline" size={18} color={tokens.color.text.placeholder} />
            <TextInput
              testID="password-input"
              placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!isPasswordVisible}
              autoCapitalize="none"
              autoComplete="new-password"
              textContentType="newPassword"
              className="flex-1 text-base font-semibold ml-2"
              accessibilityLabel="New password"
              placeholderTextColor={tokens.color.text.placeholder}
              style={{ color: tokens.color.text.primary }}
            />
            <TouchableOpacity
              testID="toggle-password"
              onPress={() => setIsPasswordVisible((visible) => !visible)}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={isPasswordVisible ? 'Hide password' : 'Show password'}
            >
              <Ionicons
                name={isPasswordVisible ? 'eye-off-outline' : 'eye-outline'}
                size={18}
                color={tokens.color.text.placeholder}
              />
            </TouchableOpacity>
          </View>

          <Text className="text-sm font-semibold text-content-secondary mb-2 mt-5">
            Confirm new password
          </Text>
          <View className="flex-row items-center border border-subtle rounded-2xl bg-surface-background px-4 h-14">
            <Ionicons name="lock-closed-outline" size={18} color={tokens.color.text.placeholder} />
            <TextInput
              testID="confirm-input"
              placeholder="Type it again"
              value={confirmation}
              onChangeText={setConfirmation}
              secureTextEntry={!isPasswordVisible}
              autoCapitalize="none"
              autoComplete="new-password"
              className="flex-1 text-base font-semibold ml-2"
              accessibilityLabel="Confirm new password"
              placeholderTextColor={tokens.color.text.placeholder}
              style={{ color: tokens.color.text.primary }}
              onSubmitEditing={handleSubmit}
              returnKeyType="go"
            />
          </View>

          {/* Said as it happens rather than on submit. A mismatch the member can
              see while both fields are still on screen costs nothing to fix. */}
          {confirmation.length > 0 && !passwordsMatch ? (
            <Text className="text-error-default text-xs font-semibold mt-2">
              These two do not match.
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
          {/* Said before the button, not after it. Everything the member is
              signed in on will end, and that should not be a surprise. */}
          <Text className="text-xs text-content-muted font-semibold text-center mb-4 leading-relaxed">
            Resetting your password signs you out everywhere, on every device.
          </Text>

          <Button
            label="Reset password"
            isLoading={isLoading}
            disabled={!canSubmit}
            onPress={handleSubmit}
          />
          <TouchableOpacity
            onPress={() => router.replace('/(auth)/login')}
            className="mt-4 py-2 items-center active:opacity-75"
          >
            <Text className="text-sm text-content-muted font-medium">Back to sign in</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}
