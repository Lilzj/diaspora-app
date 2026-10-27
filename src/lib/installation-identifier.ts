// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — one device identifier per installation (D-13)
//
// The server compares the identifier each sign-in sends to notice one phone
// running several accounts: a device another account already uses holds that
// member's points, and a referral they joined through, for a person to review.
// Sign-in used to send Expo's `sessionId`, which is new every time the app is
// opened, so the comparison matched only within one launch.
//
// This one is made up once, at random, and kept for as long as the app keeps
// its data. Where it lives decides what it is:
//
//   • AsyncStorage, app-sandbox storage that other apps cannot read. Not
//     SecureStore: on iOS the Keychain outlives an uninstall, and this belongs
//     to the installation, not the phone.
//   • Random, not read from hardware: §21 forbids shipping a device
//     fingerprint. It is stable, though, so the privacy notice says what it is.
// ─────────────────────────────────────────────────────────────────────────────

import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'diaspora.installation.id';

let pending: Promise<string> | null = null;

/**
 * This installation's identifier, made and stored the first time it is asked for.
 *
 * One promise per launch, so two token calls racing on a first launch store one
 * value rather than one each. Storage failures are not fatal: a member whose
 * disk is full can still sign in, with an identifier that lasts until the app
 * closes, which is what every launch had before.
 */
export function installationIdentifier(): Promise<string> {
  pending ??= resolveIdentifier();
  return pending;
}

async function resolveIdentifier(): Promise<string> {
  let stored: string | null;
  try {
    stored = await AsyncStorage.getItem(STORAGE_KEY);
  } catch {
    // Unreadable: one for this launch only. Writing it could replace the real
    // one, which would look to the server like a second device.
    return randomIdentifier();
  }

  if (stored) return stored;

  const fresh = randomIdentifier();
  try {
    await AsyncStorage.setItem(STORAGE_KEY, fresh);
  } catch {
    // Unwritable: this launch still has one.
  }
  return fresh;
}

/**
 * A random RFC 4122 v4 identifier.
 *
 * Not `newIdempotencyKey`, whose first block is a timestamp: an identifier kept
 * for a whole installation should not carry the moment the app first opened.
 * `Math.random` is enough for the same reason it is there: this is not a secret
 * and authorises nothing. The server treats a match as a reason for a person to
 * look, never as proof.
 */
function randomIdentifier(): string {
  const hex = (length: number) =>
    Array.from({ length }, () => Math.floor(Math.random() * 16).toString(16)).join('');

  return [
    hex(8),
    hex(4),
    `4${hex(3)}`,
    (8 + Math.floor(Math.random() * 4)).toString(16) + hex(3),
    hex(12),
  ].join('-');
}
