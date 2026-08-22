import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ScrollEndScrollView } from '@/components/ScrollEndNavigationMenu';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useBottomInset } from '@/components/layout/bottom-inset';
import { useAuthStore } from '@/store/auth';
import {
  DELETION_CONFIRMATION,
  deleteMyAccount,
  describeErasureResult,
  previewAccountDeletion,
  type AccountErasureReceipt,
} from '@/lib/privacy-api';

/**
 * Delete Account.
 *
 * ── The shape of this screen is the point ────────────────────────────────────
 *
 * Three states, and the member passes through all of them in order: what *would*
 * happen, then the two credentials that prove they mean it, then the receipt for
 * what *did* happen.
 *
 * The preview is not a courtesy. "Delete my account" means something specific here
 * and not what most people assume: the account row survives — anonymised, because
 * two hundred and sixteen foreign keys point at it — while sessions, devices and
 * codes are removed outright and the security trail is deliberately kept. A member
 * is entitled to know that before choosing it, not after.
 *
 * ── Why it asks for the password as well as a word ───────────────────────────
 *
 * The server requires both and would refuse without them. The password is the real
 * control: a bearer token left on an unlocked phone can reach this endpoint, and
 * only a password says the person pressing the button owns the account. Typing
 * DELETE is the cheaper guard against a mis-tap.
 *
 * ── Why the receipt is shown before signing out ──────────────────────────────
 *
 * It is the last thing this account will ever see. Signing out first and showing a
 * toast would throw away the only record the member gets of what was kept and why.
 */
export default function DeleteAccountScreen() {
  const bottomInset = useBottomInset();
  const signOut = useAuthStore((state) => state.signOut);

  const [preview, setPreview] = useState<AccountErasureReceipt | null>(null);
  const [receipt, setReceipt] = useState<AccountErasureReceipt | null>(null);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        setPreview(await previewAccountDeletion());
      } catch {
        setError('We could not work out what deleting your account would do. Nothing was changed.');
      }
    })();
  }, []);

  const canSubmit =
    password.length > 0 &&
    confirmation.trim().toUpperCase() === DELETION_CONFIRMATION &&
    !busy;

  const onDelete = useCallback(async () => {
    setBusy(true);
    setError(null);

    try {
      setReceipt(await deleteMyAccount(password, confirmation.trim().toUpperCase()));
    } catch (caught: unknown) {
      const status = (caught as { response?: { status?: number } })?.response?.status;

      setError(
        status === 401
          ? 'That password is not right. Your account has not been changed.'
          : 'We could not complete the deletion. Your account has not been changed.',
      );
    } finally {
      setBusy(false);
    }
  }, [password, confirmation]);

  const onFinish = useCallback(async () => {
    // The session is already dead server-side — the security stamp was rotated as part of
    // the erasure — so this is about clearing the device, not about telling the server.
    await signOut();
    router.replace('/');
  }, [signOut]);

  // ── After ──────────────────────────────────────────────────────────────────
  if (receipt) {
    return (
      <SafeAreaView className="flex-1 bg-surface-background">
        <ScreenHeader title="Account deleted" />
        <ScrollEndScrollView
          className="flex-1 px-4 pt-4"
          contentContainerStyle={{ paddingBottom: bottomInset }}
        >
          <View className="bg-surface-card rounded-xl p-4 mb-4">
            <Text className="text-content-primary font-semibold mb-1">Your account is gone</Text>
            <Text className="text-content-muted text-sm leading-5">
              Everything that named you has been removed. This is what happened, and it is the
              last time this account will be shown it.
            </Text>
          </View>

          {receipt.results.map((result, index) => (
            <View key={`${result.module}-${result.dataSet}-${index}`} className="bg-surface-card rounded-xl px-4 py-3 mb-2">
              <Text className="text-content-primary text-sm">{describeErasureResult(result)}</Text>
              <Text className="text-content-faint text-xs mt-0.5">{result.module}</Text>
            </View>
          ))}

          {receipt.failures.length > 0 && (
            <View className="bg-surface-card rounded-xl p-4 mt-2">
              <Text className="text-error-default font-medium mb-1">
                Some parts could not be completed
              </Text>
              <Text className="text-content-muted text-sm leading-5">
                {receipt.failures.join(' · ')}. Contact support quoting this account so the rest can
                be finished.
              </Text>
            </View>
          )}

          <Pressable
            onPress={onFinish}
            accessibilityRole="button"
            className="bg-primary-500 rounded-xl py-4 items-center mt-6"
          >
            <Text className="text-white font-semibold">Done</Text>
          </Pressable>
        </ScrollEndScrollView>
      </SafeAreaView>
    );
  }

  // ── Before ─────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView className="flex-1 bg-surface-background">
      <ScreenHeader title="Delete Account" />
      <ScrollEndScrollView
        className="flex-1 px-4 pt-4"
        contentContainerStyle={{ paddingBottom: bottomInset }}
      >
        <View className="bg-surface-card rounded-xl p-4 mb-4">
          <Text className="text-error-default font-semibold mb-1">This cannot be undone</Text>
          <Text className="text-content-muted text-sm leading-5">
            You will be signed out everywhere and you will not be able to sign in again with this
            number.
          </Text>
        </View>

        {!preview && !error && (
          <View className="items-center py-8">
            <ActivityIndicator />
            <Text className="text-content-muted mt-3">Working out what this would do…</Text>
          </View>
        )}

        {preview && (
          <>
            <Text className="text-content-faint text-xs uppercase tracking-wider px-1 mb-2">
              What will happen
            </Text>

            {preview.results.map((result, index) => (
              <View key={`${result.module}-${result.dataSet}-${index}`} className="bg-surface-card rounded-xl px-4 py-3 mb-2">
                <Text className="text-content-primary text-sm">{describeErasureResult(result)}</Text>
                <Text className="text-content-faint text-xs mt-0.5">{result.module}</Text>
              </View>
            ))}

            {preview.modulesWithoutErasureProvider.length > 0 && (
              <View className="bg-surface-card rounded-xl p-4 mt-2 mb-4">
                <Text className="text-content-primary font-medium mb-1">
                  What this does not reach yet
                </Text>
                <Text className="text-content-muted text-sm leading-5">
                  {preview.modulesWithoutErasureProvider.length} part
                  {preview.modulesWithoutErasureProvider.length === 1 ? '' : 's'} of Diaspora cannot
                  erase their data automatically yet. Your account will be closed and anonymised, so
                  nothing there will name you — but ask support if you need it removed outright.
                </Text>
                <Text className="text-content-faint text-xs mt-2 leading-5">
                  {preview.modulesWithoutErasureProvider.join(' · ')}
                </Text>
              </View>
            )}

            <Text className="text-content-faint text-xs uppercase tracking-wider px-1 mt-4 mb-2">
              Confirm it is you
            </Text>

            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="Your password"
              secureTextEntry
              autoCapitalize="none"
              accessibilityLabel="Your password"
              className="bg-surface-card rounded-xl px-4 py-4 text-content-primary mb-2"
            />

            <TextInput
              value={confirmation}
              onChangeText={setConfirmation}
              placeholder={`Type ${DELETION_CONFIRMATION}`}
              autoCapitalize="characters"
              autoCorrect={false}
              accessibilityLabel={`Type ${DELETION_CONFIRMATION} to confirm`}
              className="bg-surface-card rounded-xl px-4 py-4 text-content-primary"
            />

            {error && <Text className="text-error-default text-sm mt-3">{error}</Text>}

            <Pressable
              onPress={onDelete}
              disabled={!canSubmit}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canSubmit }}
              accessibilityLabel="Delete my account permanently"
              className={`rounded-xl py-4 items-center mt-6 ${
                canSubmit ? 'bg-error-default' : 'bg-surface-muted'
              }`}
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text
                  className={`font-semibold ${canSubmit ? 'text-white' : 'text-content-faint'}`}
                >
                  Delete my account
                </Text>
              )}
            </Pressable>
          </>
        )}

        {error && !preview && <Text className="text-error-default text-sm mt-3">{error}</Text>}
      </ScrollEndScrollView>
    </SafeAreaView>
  );
}
