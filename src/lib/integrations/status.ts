// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Integration status model (Frontend Phase 16, §31 · §35 · §41 · §69)
//
// §31 asks for one status model and forbids "separate incompatible status
// systems". The union lives in `types/integrations.ts`; every transition
// between its members lives here, and nowhere else derives one.
//
// ── Why the transitions are centralised rather than obvious ──────────────────
//
// Most of them are obvious. Three are not, and those three are the reason this
// file exists rather than each provider setting its own status:
//
//   **A failure does not always mean ERROR.** A permission that was refused is
//   `PERMISSION_DENIED`, not `ERROR`; an expired grant is `REAUTH_REQUIRED`,
//   not `ERROR`. Both have a specific recovery the UI can offer, and both would
//   be flattened into a shrug by a provider that reached for `ERROR` because
//   something threw. `statusForError` is the single mapping.
//
//   **A disconnect must be visible immediately.** §41: "do not leave stale UI
//   saying Connected after disconnect." The transition to `DISCONNECTED` is
//   applied optimistically and the connection object is *replaced*, not
//   patched, so no stale `account` survives into the next render.
//
//   **A build that cannot reach a provider is not a broken connection.**
//   `UNAVAILABLE`, `BACKEND_GAP` and `NOT_CONNECTED` are three different claims
//   and a member reads them very differently: "your phone cannot do this",
//   "we have not built this yet", and "you have not turned this on". Collapsing
//   them — which a boolean `isConnected` would — produces a connection centre
//   that blames the member for a missing backend contract.
//
// ── The status/mode pairing (§69) ────────────────────────────────────────────
//
// Every helper here takes the pair, never the status alone. `CONNECTED` in
// `DEVELOPMENT_PROVIDER` mode must never render as a production connection, and
// the only way to make that unmissable is for the functions a screen calls to
// require both arguments.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  IntegrationConnection,
  IntegrationDomain,
  IntegrationErrorSummary,
  IntegrationMode,
  IntegrationProviderId,
  IntegrationStatus,
  IntegrationSyncState,
} from '@/types/integrations';
import { impliesProductionConnectivity, isSimulatedMode } from '@/types/integrations';
import type { IntegrationError } from './errors';

// ═════════════════════════════════════════════════════════════════════════════
// PREDICATES
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Whether the integration can currently do work.
 *
 * `SYNCING` and `SYNCED` are usable — a sync in progress does not stop an
 * export — and `PARTIALLY_CONNECTED` is too, because a partial connection is
 * one where *some* capabilities work and the per-capability check is
 * `hasCapability` below, not this.
 */
export function isUsable(status: IntegrationStatus): boolean {
  return (
    status === 'CONNECTED' ||
    status === 'SYNCING' ||
    status === 'SYNCED' ||
    status === 'PARTIALLY_CONNECTED' ||
    status === 'DEVELOPMENT'
  );
}

/** Whether a member action would help. Drives whether a call-to-action is offered at all. */
export function isActionable(status: IntegrationStatus): boolean {
  return (
    status === 'NOT_CONNECTED' ||
    status === 'DISCONNECTED' ||
    status === 'REAUTH_REQUIRED' ||
    status === 'PERMISSION_DENIED' ||
    status === 'ERROR' ||
    status === 'PARTIALLY_CONNECTED'
  );
}

/**
 * Whether nothing the member does in this build will change the state.
 *
 * These three render an explanation and no button. Offering "Connect" for a
 * capability whose backend contract does not exist is the "Coming Soon" screen
 * the phase brief forbids, wearing a different hat.
 */
export function isBlockedByBuild(status: IntegrationStatus): boolean {
  return status === 'UNAVAILABLE' || status === 'BACKEND_GAP';
}

/** Whether the UI may describe this as live and production-connected — §69. */
export function isProductionConnected(
  status: IntegrationStatus,
  mode: IntegrationMode
): boolean {
  return isUsable(status) && impliesProductionConnectivity(mode);
}

/** Whether a "simulated" marker must be rendered alongside this state — §69. */
export function requiresSimulationMarker(mode: IntegrationMode): boolean {
  return isSimulatedMode(mode);
}

// ═════════════════════════════════════════════════════════════════════════════
// TRANSITIONS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * The status a given failure produces.
 *
 * The mapping §32 implies but does not spell out, and the reason a provider
 * never picks its own status: three of these are recoveries rather than errors,
 * and a provider that reached for `ERROR` because something threw would lose
 * the recovery.
 */
export function statusForError(error: IntegrationError): IntegrationStatus {
  switch (error.kind) {
    case 'PermissionDenied':
      return 'PERMISSION_DENIED';
    case 'ExpiredCredential':
    case 'AuthenticationRequired':
      return 'REAUTH_REQUIRED';
    case 'BackendGap':
      return 'BACKEND_GAP';
    case 'ConfigurationMissing':
    case 'UnsupportedCapability':
      return 'UNAVAILABLE';
    default:
      return 'ERROR';
  }
}

/** The starting point for an integration nobody has touched. */
export function notConnected(
  provider: IntegrationProviderId,
  domain: IntegrationDomain,
  mode: IntegrationMode,
  now: string
): IntegrationConnection {
  return {
    provider,
    domain,
    status: mode === 'BACKEND_GAP' ? 'BACKEND_GAP' : mode === 'NOT_CONFIGURED' ? 'UNAVAILABLE' : 'NOT_CONNECTED',
    mode,
    account: null,
    grantedCapabilities: [],
    scopes: [],
    expiresAt: null,
    lastSyncedAt: null,
    lastError: null,
    gapId: null,
    observedAt: now,
  };
}

/**
 * Apply a failure to a connection.
 *
 * Preserves the account rather than clearing it, deliberately. A grant that
 * expired is still a grant *for a known account*, and "Reconnect
 * amara@example.com" is a materially better prompt than "Connect a Google
 * account" — the member knows which of their three accounts is meant.
 */
export function withError(
  connection: IntegrationConnection,
  error: IntegrationError,
  now: string
): IntegrationConnection {
  const status = statusForError(error);

  return {
    ...connection,
    status,
    // A failure means the capabilities are not currently usable, whatever the
    // provider last said. Leaving them populated is how a screen ends up
    // offering an action that will immediately fail again.
    grantedCapabilities: status === 'REAUTH_REQUIRED' ? connection.grantedCapabilities : [],
    lastError: error.toSummary(now),
    gapId: error.gapId ?? connection.gapId ?? null,
    observedAt: now,
  };
}

/**
 * Apply a disconnect.
 *
 * The account, scopes, capabilities and expiry are **cleared**, not preserved —
 * §41's requirement that no stale "Connected" state survives, applied to every
 * field rather than only to the status. A disconnect that left `account`
 * populated would render "Disconnected · amara@example.com", which reads as a
 * connection in a bad state rather than as an absence.
 *
 * `lastError` is cleared too: an error from before a disconnect describes a
 * connection that no longer exists.
 */
export function withDisconnect(
  connection: IntegrationConnection,
  now: string
): IntegrationConnection {
  return {
    ...connection,
    status: 'DISCONNECTED',
    account: null,
    grantedCapabilities: [],
    scopes: [],
    expiresAt: null,
    lastSyncedAt: null,
    lastError: null,
    observedAt: now,
  };
}

/**
 * Fold a sync state into a connection's status.
 *
 * §35's requirement that synchronisation never be claimed without backend
 * confirmation is enforced by what this function *cannot* do: there is no path
 * from a local success to `SYNCED`. The caller must pass an
 * `IntegrationSyncState` whose `lastSyncedAt` came from a server response —
 * `phase: 'synced'` with a null `lastSyncedAt` produces `CONNECTED`, not
 * `SYNCED`, so an adapter that forgot to carry the timestamp degrades to the
 * weaker, true claim rather than the stronger, false one.
 */
export function withSync(
  connection: IntegrationConnection,
  sync: IntegrationSyncState,
  now: string
): IntegrationConnection {
  if (!isUsable(connection.status)) return connection;

  const status: IntegrationStatus =
    sync.phase === 'syncing'
      ? 'SYNCING'
      : sync.phase === 'synced' && sync.lastSyncedAt
        ? 'SYNCED'
        : sync.phase === 'partial'
          ? 'PARTIALLY_CONNECTED'
          : sync.phase === 'failed'
            ? 'ERROR'
            : connection.status;

  return {
    ...connection,
    status,
    lastSyncedAt: sync.lastSyncedAt,
    observedAt: now,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// PRESENTATION
// ═════════════════════════════════════════════════════════════════════════════

/**
 * The member-facing label for a status.
 *
 * Deliberately not derived from the enum name. `REAUTH_REQUIRED` means nothing
 * to anybody outside this codebase, and a screen that rendered the constant —
 * or a title-cased version of it — would be leaking an implementation detail
 * into the one place it is least useful.
 *
 * These strings are also what a screen reader announces (§58), which is why
 * each is a complete statement rather than a fragment: "Connected" alone,
 * announced out of context, does not say what is connected.
 */
export function statusLabel(status: IntegrationStatus): string {
  switch (status) {
    case 'NOT_CONNECTED':
      return 'Not connected';
    case 'CONNECTING':
      return 'Connecting';
    case 'CONNECTED':
      return 'Connected';
    case 'SYNCING':
      return 'Syncing';
    case 'SYNCED':
      return 'Synced';
    case 'PARTIALLY_CONNECTED':
      return 'Partly connected';
    case 'REAUTH_REQUIRED':
      return 'Needs reconnecting';
    case 'PERMISSION_DENIED':
      return 'Permission needed';
    case 'DISCONNECTED':
      return 'Disconnected';
    case 'ERROR':
      return 'Something went wrong';
    case 'UNAVAILABLE':
      return 'Not available on this device';
    case 'BACKEND_GAP':
      return 'Not available yet';
    case 'DEVELOPMENT':
      return 'Development mode';
  }
}

/**
 * The sentence under the label.
 *
 * Every status gets one, because a status word on its own leaves the member to
 * infer what to do. "Not available yet" invites "when?"; the description
 * answers it.
 */
export function statusDescription(status: IntegrationStatus, mode: IntegrationMode): string {
  if (isSimulatedMode(mode) && isUsable(status)) {
    // Overrides whatever the status would otherwise say. §69: the UI must never
    // imply production connectivity, and this is the sentence that stops it.
    return 'This is a development build. Nothing has been sent to the real service.';
  }

  switch (status) {
    case 'NOT_CONNECTED':
      return 'Connect this to use it.';
    case 'CONNECTING':
      return 'Waiting for you to finish in the other app.';
    case 'CONNECTED':
      return 'Working normally.';
    case 'SYNCING':
      return 'Bringing things up to date.';
    case 'SYNCED':
      return 'Up to date.';
    case 'PARTIALLY_CONNECTED':
      return 'Some things worked and some did not.';
    case 'REAUTH_REQUIRED':
      return 'Your permission has expired or was withdrawn. Reconnect to continue.';
    case 'PERMISSION_DENIED':
      return 'Diaspora needs permission from your device to do this.';
    case 'DISCONNECTED':
      return 'You disconnected this. Nothing is being shared.';
    case 'ERROR':
      return 'The last attempt failed.';
    case 'UNAVAILABLE':
      return 'This version of the app cannot use this.';
    case 'BACKEND_GAP':
      return 'This capability is still being built. Everything else on this screen works.';
    case 'DEVELOPMENT':
      return 'Simulated for development. Nothing leaves this device.';
  }
}

/**
 * The action to offer, or null when none would help.
 *
 * Returning null for `UNAVAILABLE` and `BACKEND_GAP` is the point: a button
 * that cannot work is worse than no button, and this is where that decision is
 * made once rather than in every row.
 */
export function primaryAction(
  status: IntegrationStatus
): { label: string; kind: 'connect' | 'reconnect' | 'retry' | 'settings' | 'disconnect' } | null {
  switch (status) {
    case 'NOT_CONNECTED':
    case 'DISCONNECTED':
      return { label: 'Connect', kind: 'connect' };
    case 'REAUTH_REQUIRED':
      return { label: 'Reconnect', kind: 'reconnect' };
    case 'PERMISSION_DENIED':
      return { label: 'Open settings', kind: 'settings' };
    case 'ERROR':
      return { label: 'Try again', kind: 'retry' };
    case 'CONNECTED':
    case 'SYNCED':
    case 'SYNCING':
    case 'PARTIALLY_CONNECTED':
    case 'DEVELOPMENT':
      return { label: 'Disconnect', kind: 'disconnect' };
    case 'CONNECTING':
    case 'UNAVAILABLE':
    case 'BACKEND_GAP':
      return null;
  }
}

/**
 * The accessibility announcement for a connection row — §58.
 *
 * One string containing the name, the state, the mode caveat and the error, so
 * a screen reader user gets the whole row in one utterance rather than four
 * fragments in an order that depends on the layout.
 */
export function accessibilityLabelFor(
  name: string,
  status: IntegrationStatus,
  mode: IntegrationMode,
  lastError?: IntegrationErrorSummary | null
): string {
  const parts = [name, statusLabel(status)];

  if (requiresSimulationMarker(mode) && isUsable(status)) {
    parts.push('simulated, not connected to the real service');
  }
  if (lastError) {
    parts.push(`last error: ${lastError.message}`);
  }

  return parts.join('. ') + '.';
}

// ═════════════════════════════════════════════════════════════════════════════
// SYNC STATE — §35
// ═════════════════════════════════════════════════════════════════════════════

/** The state of a sync that has never run. Distinct from one that ran and found nothing. */
export function neverSynced(): IntegrationSyncState {
  return {
    phase: 'never',
    lastSyncedAt: null,
    startedAt: null,
    itemsSynced: 0,
    itemsFailed: 0,
    failureReasons: [],
    needsAttention: false,
  };
}

/**
 * Fold per-item outcomes into a sync state.
 *
 * The `partial` case is the one worth having a function for. A batch where nine
 * of ten items succeeded is neither a success nor a failure, and rounding it to
 * either is how a member ends up believing an event reached their calendar when
 * it did not. `needsAttention` is set for exactly that case, plus outright
 * failure, so the connection centre can surface it without the member opening
 * the integration.
 */
export function summariseSync(
  outcomes: { ok: boolean; reason?: string }[],
  confirmedAt: string | null
): IntegrationSyncState {
  const succeeded = outcomes.filter((outcome) => outcome.ok).length;
  const failed = outcomes.length - succeeded;

  const phase = failed === 0 ? 'synced' : succeeded === 0 ? 'failed' : 'partial';

  return {
    phase,
    // §35 again: only a confirmed timestamp may be recorded. A caller with no
    // server confirmation passes null and the connection stays CONNECTED rather
    // than advancing to SYNCED — see `withSync`.
    lastSyncedAt: phase === 'synced' ? confirmedAt : confirmedAt,
    startedAt: null,
    itemsSynced: succeeded,
    itemsFailed: failed,
    failureReasons: Array.from(
      new Set(outcomes.filter((outcome) => !outcome.ok && outcome.reason).map((outcome) => outcome.reason as string))
    ),
    needsAttention: failed > 0,
  };
}

/**
 * A member-facing sentence for a sync state.
 *
 * `never` deliberately does not say "not synced yet" — that implies a sync is
 * coming. For an export-only integration none ever is, and the honest sentence
 * is about what has happened rather than what has not.
 */
export function syncDescription(sync: IntegrationSyncState): string {
  switch (sync.phase) {
    case 'never':
      return 'Nothing has been sent to this calendar yet.';
    case 'syncing':
      return 'Working…';
    case 'synced':
      return sync.itemsSynced === 1 ? '1 item up to date.' : `${sync.itemsSynced} items up to date.`;
    case 'partial':
      return `${sync.itemsSynced} of ${sync.itemsSynced + sync.itemsFailed} items went through. The rest did not.`;
    case 'failed':
      return 'Nothing went through on the last attempt.';
  }
}
