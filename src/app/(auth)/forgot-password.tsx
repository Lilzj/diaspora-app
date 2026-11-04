import React, { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ScreenHeader } from '@/components/ScreenHeader';
import { KeyboardAwareScrollView } from '@/components/layout/KeyboardAwareScrollView';
import { Button } from '@/components/Button';
import { useTheme } from '@/design-system';
import { forgotPassword } from '@/lib/auth-api';
import { isIntegrationError } from '@/lib/integrations/errors';

/**
 * Starts account recovery.
 *
 * ── Why this screen did not exist ───────────────────────────────────────────
 *
 * `POST /auth/forgot-password` and `POST /auth/reset-password` have been
 * deployed and answering the whole time, and **no screen, no client function
 * and no "Forgot" link anywhere in the application called them** (UAT-127).
 *
 * That was survivable while sign-in was a one-time code, because the password
 * was never needed. It stopped being survivable the moment
 * `settings/delete-account` began requiring it: the password was set once at
 * registration, never used again, never changeable and never recoverable — so a
 * member who forgot it, which is the expected outcome rather than the edge
 * case, could not delete their own account.
 *
 * ── Why this screen names no channel of its own ───────────────────────────
 *
 * The member is identified by the credential they actually use. Where the code
 * is then sent is the **deployment's** decision, not this screen's: with an
 * email provider configured the code goes to the mailbox just typed in, and
 * without one it goes by SMS to the phone on the account.
 *
 * So every channel-specific word here has been removed, and the confirmation
 * shown is the **server's own sentence**. A heading that said "check your
 * phone" would be a second place that can disagree with it, and the one that
 * is wrong would be the one in large type.
 */
export default function ForgotPasswordScreen() {
  const { tokens } = useTheme();

  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [acknowledgement, setAcknowledgement] = useState<string | null>(null);
  const [error, setError] = useState<{ message: string; hint: string | null } | null>(null);

  const canContinue = email.trim().includes('@');

  const handleSubmit = async () => {
    if (!canContinue) return;

    setIsLoading(true);
    setError(null);

    try {
      const result = await forgotPassword({ email: email.trim().toLowerCase() });

      // ── This is not confirmation the account exists ────────────────────────
      //
      // The server answers identically whether or not the address is registered,
      // deliberately, so that this endpoint cannot be used to discover who has
      // an account. The screen must not undo that by saying "we found you" — it
      // shows the server's own hedged sentence and moves on.
      setAcknowledgement(result.message ?? null);
    } catch (cause) {
      setError(
        isIntegrationError(cause)
          ? { message: cause.message, hint: cause.hint ?? null }
          : {
              message: 'We could not start account recovery.',
              hint: 'Check your connection and try again.',
            }
      );
    } finally {
      setIsLoading(false);
    }
  };

  if (acknowledgement !== null) {
    return (
      <SafeAreaView className="flex-1 bg-surface-card">
        <ScreenHeader title="" />

        <View className="flex-1 px-6 justify-between">
          <View className="pt-4">
            <View className="w-16 h-16 rounded-full bg-surface-muted items-center justify-center mb-6">
              {/* Neutral by intent — a chat bubble or an envelope would name a
                  channel this screen does not choose. */}
              <Ionicons name="shield-checkmark-outline" size={28} color={tokens.color.text.primary} />
            </View>

            <Text className="text-3xl font-extrabold text-content-primary mb-3 tracking-tight">
              Your code is on its way
            </Text>

            {/* The server's sentence, verbatim. It names the channel and hedges
                on whether the account exists; both of those are deliberate. */}
            <Text className="text-base text-content-muted leading-relaxed">{acknowledgement}</Text>
          </View>

          <View className="py-6">
            <Button
              label="I have the code"
              onPress={() =>
                router.push({
                  pathname: '/(auth)/reset-password',
                  params: { email: email.trim().toLowerCase() },
                })
              }
            />
            <TouchableOpacity
              onPress={() => router.replace('/(auth)/login')}
              className="mt-4 py-2 items-center active:opacity-75"
            >
              <Text className="text-sm text-content-muted font-medium">Back to sign in</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-surface-card">
      <ScreenHeader title="" />

      <KeyboardAwareScrollView
        className="flex-1"
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'space-between' }}
      >
        <View className="px-6">
          <Text className="text-3xl font-extrabold text-content-primary mb-2 tracking-tight">
            Reset your password
          </Text>
          <Text className="text-base text-content-muted mb-8 leading-relaxed">
            Enter the email address you registered with, and we will send you a recovery
            code.
          </Text>

          <Text className="text-sm font-semibold text-content-secondary mb-2">Email Address</Text>

          <View className="flex-row items-center border border-subtle rounded-2xl bg-surface-background px-4 h-14">
            <Ionicons
              name="mail-outline"
              size={18}
              color={tokens.color.text.placeholder}
              accessibilityElementsHidden
              importantForAccessibility="no"
            />
            <TextInput
              testID="email-input"
              placeholder="you@example.com"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="emailAddress"
              className="flex-1 text-base font-semibold ml-2"
              accessibilityLabel="Email address"
              placeholderTextColor={tokens.color.text.placeholder}
              style={{ color: tokens.color.text.primary }}
              onSubmitEditing={handleSubmit}
              returnKeyType="go"
            />
          </View>

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
            label="Send recovery code"
            isLoading={isLoading}
            disabled={!canContinue}
            onPress={handleSubmit}
          />
          <TouchableOpacity
            onPress={() => router.back()}
            className="mt-4 py-2 items-center active:opacity-75"
          >
            <Text className="text-sm text-content-muted font-medium">Back to sign in</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}
