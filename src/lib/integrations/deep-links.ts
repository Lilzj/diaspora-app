// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — integration deep links (Frontend Phase 16, §40 · §42 · §49)
//
// Callbacks arriving from outside the app: an OAuth redirect, a payment return,
// an email verification link.
//
// ── The sentence this file is built around ───────────────────────────────────
//
// §40: **"Do not assume the app is still alive when the callback arrives."**
//
// It usually is not. An OAuth flow puts the system browser in the foreground
// for as long as it takes somebody to find their password, and Android will
// happily reclaim a backgrounded React Native process in that time. When the
// browser redirects, the app cold-starts: new process, empty component tree,
// no `useState` anywhere holding the code verifier that the response needs.
//
// A flow whose pending state lives in component state therefore works in every
// manual test on a fast device and fails on the phones of the people most
// likely to be using this application. So the pending flow is **persisted**,
// and `resumePendingFlow` reads it from storage rather than from memory.
//
// ── What is persisted, and the three limits on it ────────────────────────────
//
// The record holds the provider, the intent, the code verifier and an opaque
// state token. It does **not** hold an access token, a refresh token or a
// session — there is nothing here worth stealing from a device that already has
// the app installed, and the verifier is single-use and expires.
//
//   1. **Short TTL.** Ten minutes. An OAuth flow a member abandoned an hour ago
//      must not complete when they happen to open a stale link.
//   2. **Member-scoped key.** §42: user A's pending link must not resume inside
//      user B's session on a shared device. The key contains the member id and
//      `clearPendingFlows` runs on sign-out.
//   3. **State token comparison.** The callback must carry the state token the
//      request generated. A callback that does not is discarded — this is the
//      CSRF defence OAuth's `state` parameter exists for, and it is also what
//      stops a link from a *different* pending flow completing the wrong one.
//
// ── Routing is not reimplemented ─────────────────────────────────────────────
//
// Notification taps route through `lib/notification-routes.ts`, which Phase 5
// wrote and Phases 12 and 13 extended, including its refusal behaviour for
// routes this build cannot render. This file adds the integration callbacks and
// nothing else. §49's requirement is met by the existing table plus the
// `integrations.*` extension made there rather than by a second router here.
// ─────────────────────────────────────────────────────────────────────────────

import AsyncStorage from '@react-native-async-storage/async-storage';
import { buildRedirectUri } from '@/config/integration-config';
import type { IntegrationProviderId } from '@/types/integrations';

// ═════════════════════════════════════════════════════════════════════════════
// PENDING FLOWS
// ═════════════════════════════════════════════════════════════════════════════

export interface PendingFlow {
  provider: IntegrationProviderId;
  intent: 'link' | 'signIn' | 'reauthorize' | 'payment' | 'verifyEmail';
  /** Opaque, single-use, compared on return. Never a member identifier. */
  state: string;
  /** PKCE. Present for OAuth flows only. */
  codeVerifier?: string;
  /** Where to send the member afterwards. A route, never a URL. */
  returnRoute?: string;
  /** Epoch milliseconds. */
  startedAt: number;
}

/** Ten minutes. See the header. */
const FLOW_TTL_MS = 10 * 60 * 1000;

/**
 * The storage key.
 *
 * Member-scoped, so §42's account switching cannot resume one member's
 * authorization inside another's session. A key without the member id would be
 * a shared slot on a shared phone.
 */
function storageKey(userId: string): string {
  return `diaspora_integration_pending_flow_${userId}`;
}

/**
 * An opaque state token.
 *
 * `Math.random` is adequate here and it is worth saying why rather than leaving
 * it to look like an oversight: this value is not a credential and guessing it
 * grants nothing. It is a correlation token whose only job is to stop a
 * callback completing a flow it did not start, and the attacker who would need
 * to guess it would need to already control a redirect into this app. The PKCE
 * verifier — which *is* security-relevant — comes from `expo-crypto` inside
 * `expo-auth-session`, not from here.
 */
function newStateToken(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export async function beginFlow(
  userId: string,
  flow: Omit<PendingFlow, 'state' | 'startedAt'>
): Promise<PendingFlow> {
  const record: PendingFlow = {
    ...flow,
    state: newStateToken(),
    startedAt: Date.now(),
  };

  try {
    await AsyncStorage.setItem(storageKey(userId), JSON.stringify(record));
  } catch {
    // Storage failure must not block the flow. The consequence is that a
    // cold-start return cannot be resumed — the member is dropped on the
    // connection centre rather than completing — which is a degradation, not a
    // failure, and is better than refusing to start.
  }

  return record;
}

/**
 * Reads the pending flow, if one is still valid.
 *
 * Expired records are deleted rather than returned, so a stale link cannot
 * complete an authorization the member abandoned.
 */
export async function readPendingFlow(userId: string): Promise<PendingFlow | null> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(userId));
    if (!raw) return null;

    const record = JSON.parse(raw) as PendingFlow;
    if (!record?.state || typeof record.startedAt !== 'number') return null;

    if (Date.now() - record.startedAt > FLOW_TTL_MS) {
      await clearPendingFlows(userId);
      return null;
    }

    return record;
  } catch {
    return null;
  }
}

/**
 * Clears the pending flow.
 *
 * Called on completion, on abandonment, and — the one that matters for §42 — on
 * sign-out, from `store/auth.ts` alongside the idempotency keys and the
 * community persistence that phases 5 and 13 already clear there.
 */
export async function clearPendingFlows(userId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(storageKey(userId));
  } catch {
    /* Fire-and-forget: a failure here must not block signing out. */
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// PARSING
// ═════════════════════════════════════════════════════════════════════════════

export type CallbackOutcome =
  | { kind: 'success'; params: Record<string, string> }
  | { kind: 'denied' }
  | { kind: 'cancelled' }
  | { kind: 'expired' }
  /** The callback did not match a pending flow, or there was none. */
  | { kind: 'unknown'; reason: string };

/** Which of this app's integration callbacks a URL is, if any. */
export function callbackKindFor(url: string): 'oauth' | 'payment' | 'verify' | null {
  const normalised = url.trim().toLowerCase();
  if (normalised.startsWith(buildRedirectUri('oauth').toLowerCase())) return 'oauth';
  if (normalised.startsWith(buildRedirectUri('payment').toLowerCase())) return 'payment';
  if (normalised.startsWith(buildRedirectUri('verify').toLowerCase())) return 'verify';
  return null;
}

/**
 * Query parameters from a callback URL.
 *
 * Hand-parsed rather than via `URL`, which is only partially implemented in
 * Hermes and does not reliably handle a custom scheme. The fragment is read as
 * well as the query because implicit-style responses put parameters after `#`,
 * and a parser that read only the query would silently see an empty response
 * for those.
 */
export function parseCallbackParams(url: string): Record<string, string> {
  const params: Record<string, string> = {};

  const separatorIndex = url.search(/[?#]/);
  if (separatorIndex === -1) return params;

  // Both separators are treated as one: `?a=1#b=2` yields both. Splitting on
  // only `?` would silently return an empty response for a fragment-style
  // callback, which is the failure this handles.
  const search = url.slice(separatorIndex + 1).replace(/[?#]/g, '&');
  if (!search) return params;

  for (const pair of search.split('&')) {
    if (!pair) continue;
    const separator = pair.indexOf('=');
    const key = separator === -1 ? pair : pair.slice(0, separator);
    const value = separator === -1 ? '' : pair.slice(separator + 1);
    try {
      params[decodeURIComponent(key)] = decodeURIComponent(value.replace(/\+/g, ' '));
    } catch {
      // A malformed escape is skipped rather than throwing. A callback with one
      // bad parameter should still deliver the others.
      params[key] = value;
    }
  }

  return params;
}

/**
 * Resolves a callback against the pending flow.
 *
 * Every path that does not produce `success` is enumerated, because §40 asks
 * for all five and because "unknown" is the one that actually happens most —
 * a stale link, a second tap on the same link, a callback after a sign-out —
 * and a flow that treated unknown as failure would show an error for a member
 * who did nothing wrong.
 */
export async function resolveCallback(
  userId: string,
  url: string
): Promise<{ outcome: CallbackOutcome; flow: PendingFlow | null }> {
  const params = parseCallbackParams(url);
  const flow = await readPendingFlow(userId);

  if (!flow) {
    return {
      outcome: { kind: 'expired' },
      flow: null,
    };
  }

  // The state comparison. A callback that does not carry the token this flow
  // generated is discarded — see the header's third limit.
  if (!params.state || params.state !== flow.state) {
    return {
      outcome: { kind: 'unknown', reason: 'This link does not match the request that started it.' },
      flow,
    };
  }

  // Single-use. Cleared before the outcome is returned so a replayed link
  // cannot complete the same flow twice — which for an OAuth code would produce
  // a provider error and for a payment return would double a status refresh.
  await clearPendingFlows(userId);

  const error = params.error ?? params.errorCode;
  if (error) {
    if (error === 'access_denied') return { outcome: { kind: 'denied' }, flow };
    if (error === 'user_cancelled' || error === 'cancelled') {
      return { outcome: { kind: 'cancelled' }, flow };
    }
    return { outcome: { kind: 'unknown', reason: 'The other app reported a problem.' }, flow };
  }

  return { outcome: { kind: 'success', params }, flow };
}

/**
 * Where a resolved callback should land.
 *
 * Returns a route this build can render, or the connection centre. Deliberately
 * never returns a route taken from the callback URL: a redirect target supplied
 * by whatever opened the link is an open-redirect inside the app, and on a
 * payment callback it is a route to a convincing fake receipt.
 */
export function routeForCallback(flow: PendingFlow, outcome: CallbackOutcome): string {
  if (flow.intent === 'payment') {
    return outcome.kind === 'success' ? '/wallet/payments' : '/wallet';
  }
  if (flow.intent === 'verifyEmail') {
    return '/settings/integrations/email';
  }
  // `returnRoute` comes from the code that *started* the flow, not from the
  // callback, which is why it is safe to use.
  return flow.returnRoute ?? '/settings/integrations';
}
