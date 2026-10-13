import React, { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/components/ScreenHeader';
import { KeyboardAwareScrollView } from '@/components/layout/KeyboardAwareScrollView';
import { Button } from '@/components/Button';
import { useTheme } from '@/design-system';
import { Ionicons } from '@expo/vector-icons';
import { loginWithPassword } from '@/lib/auth-api';
import { isIntegrationError } from '@/lib/integrations/errors';
import { useAuthStore } from '@/store/auth';
import { routeForAccess } from '@/lib/auth-destination';

/**
 * Sign in with an email address and a password.
 *
 * ── Why this is no longer a one-time code ───────────────────────────────────
 *
 * This screen used to take a phone number and call `POST /auth/otp/start`,
 * which sent an **SMS on every single sign-in**. That is a per-session cost for
 * something a password does for nothing, and it made the product's only door
 * depend on a message actually arriving: while the deployment was pointed at
 * the Africa's Talking sandbox, nobody could sign in at all (UAT-101).
 *
 * SMS still earns its cost in exactly one place — proving a member holds the
 * phone number they claim — and that is a once-per-account event, not a
 * once-per-session one. `verify-phone` is unchanged.
 *
 * ── What this screen no longer needs ────────────────────────────────────────
 *
 * The calling-code matcher, the flag echo and the ambiguity handling for +1 and
 * +7 all belonged to the phone field and have gone with it. They are still in
 * `lib/calling-code.ts`, still used by registration, which is where a phone
 * number is genuinely required.
 */
export default function LoginScreen() {
  const { tokens } = useTheme();
  const adoptSession = useAuthStore((state) => state.adoptSession);
  const signOutReason = useAuthStore((state) => state.signOutReason);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<{ message: string; hint: string | null } | null>(null);

  // Deliberately shallow. The server is the authority on whether an address
  // exists, and a stricter client-side pattern only ever rejects real addresses
  // — the member finds out on submit either way.
  const canContinue = email.trim().includes('@') && password.length > 0;

  /**
   * Signs in.
   *
   * ── Why the failure is deliberately vague ─────────────────────────────────
   *
   * The server answers "no such address" and "wrong password" with the same
   * error and the same timing, so that this endpoint cannot be used to discover
   * who has registered. This screen must not undo that by guessing which it was
   * — so it shows one message for both, and points at recovery rather than
   * speculating about which half was wrong.
   */
  const handleSignIn = async () => {
    if (!canContinue) return;

    setIsLoading(true);
    setError(null);

    try {
      const session = await loginWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      await adoptSession(session);

      // Where a member lands depends on what their account may do — an
      // unverified one goes to the gateway, not to a gated tab. `routeForAccess`
      // is shared with the one-time code screen so the two cannot drift.
      try {
        router.replace(routeForAccess(session.access) as never);
      } catch {
        router.replace('/access-gateway');
      }
    } catch (cause) {
      setError(
        isIntegrationError(cause)
          ? { message: cause.message, hint: cause.hint ?? null }
          : {
              message: 'That email address and password do not match an account.',
              hint: 'Check both and try again, or reset your password.',
            }
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-surface-card">
      <ScreenHeader title="" />

      {/* A KeyboardAvoidingView alone is not enough here, and this screen is the
          proof. On Android `behavior` is deliberately undefined because the
          window already resizes for the keyboard — but a *plain View* inside
          that shrunken viewport has nowhere to put its overflow, so the bottom
          of the layout is simply clipped. Confirmed on device: with the keyboard
          open the submit button disappeared from the screen and from the view
          hierarchy entirely, on the first screen every member uses.

          The scroll container is what actually fixes it. */}
      <KeyboardAwareScrollView
        className="flex-1"
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'space-between' }}
      >
        <View className="px-6">
          <Text className="text-3xl font-extrabold text-content-primary mb-2 tracking-tight">
            Welcome back
          </Text>
          <Text className="text-base text-content-muted mb-8 leading-relaxed">
            Sign in with the email address and password you registered with.
          </Text>

          {/* Without this the member meets a sign-in screen with no idea why. */}
          {signOutReason === 'inactivity' ? (
            <View
              accessibilityRole="alert"
              className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-2xl p-4 mb-6"
            >
              <Text className="text-sm font-bold text-content-primary">
                You were signed out to keep your account safe
              </Text>
              <Text className="text-xs text-content-muted mt-1 leading-relaxed">
                Diaspora signed you out after a period without activity. Sign in again to carry on.
              </Text>
            </View>
          ) : null}

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
              // The visible label is a sibling Text, which a screen reader does
              // not associate with the field, so the field is named here too.
              accessibilityLabel="Email address"
              placeholderTextColor={tokens.color.text.placeholder}
              style={{ color: tokens.color.text.primary }}
            />
          </View>

          <Text className="text-sm font-semibold text-content-secondary mb-2 mt-5">Password</Text>

          <View className="flex-row items-center border border-subtle rounded-2xl bg-surface-background px-4 h-14">
            <Ionicons
              name="lock-closed-outline"
              size={18}
              color={tokens.color.text.placeholder}
              accessibilityElementsHidden
              importantForAccessibility="no"
            />
            <TextInput
              testID="password-input"
              placeholder="Your password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!isPasswordVisible}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="current-password"
              textContentType="password"
              className="flex-1 text-base font-semibold ml-2"
              accessibilityLabel="Password"
              placeholderTextColor={tokens.color.text.placeholder}
              style={{ color: tokens.color.text.primary }}
              onSubmitEditing={handleSignIn}
              returnKeyType="go"
            />
            {/* A password field with no way to see what was typed is the single
                largest cause of "wrong password" on a phone keyboard. */}
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

          <TouchableOpacity
            testID="forgot-password"
            onPress={() => router.push('/(auth)/forgot-password')}
            className="mt-3 self-end py-2 active:opacity-75"
            accessibilityRole="button"
          >
            <Text className="text-sm font-bold text-primary-500">Forgot password?</Text>
          </TouchableOpacity>

          {/* Reported where it happened. The member stays on the screen with the
              fields they need rather than being advanced past the failure. */}
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
            label="Sign in"
            isLoading={isLoading}
            disabled={!canContinue}
            onPress={handleSignIn}
          />
          <TouchableOpacity
            onPress={() => router.push('/(auth)/register')}
            className="mt-4 py-2 items-center active:opacity-75"
          >
            <Text className="text-sm text-content-muted font-medium">
              Don't have an account? <Text className="font-bold text-primary-500">Sign up</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}
