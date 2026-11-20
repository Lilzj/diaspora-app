// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Connectivity (Frontend Phase 5)
//
// §23 of the phase brief: financial operations must not be blindly queued
// offline, and when offline the unsupported actions are disabled with an
// explanation. That needs an answer to "is there a connection", and the answer
// has to be honest about how confident it is.
//
// Three sources, in descending order of trust:
//
//   1. `expo-network` when the module is present. A real radio/interface state.
//   2. `navigator.onLine` on web.
//   3. Observed request outcomes. A financial request that failed with no
//      response at all is evidence; a request that succeeded is proof.
//
// (3) exists because the first two can both be unavailable, and because both
// can be wrong in the same direction: a device attached to a captive portal
// reports a perfectly good Wi-Fi connection and cannot reach the API. Treating
// a completed request as the strongest signal means a captive portal reads as
// offline, which is what the member experiences.
//
// **This never queues anything.** It gates. A financial mutation attempted
// while offline is refused immediately with `offlineError`, and the member is
// told nothing was sent — rather than being told it will happen later, which
// would eventually make it happen twice.
// ─────────────────────────────────────────────────────────────────────────────

import { create } from 'zustand';
import { onlineManager } from '@tanstack/react-query';

export type ConnectivitySource = 'device' | 'observed' | 'assumed';

interface ConnectivityState {
  isOnline: boolean;
  /** How the current answer was arrived at. Surfaced in the UI's wording. */
  source: ConnectivitySource;
  /** When a request last completed successfully. Drives "showing data from…". */
  lastSuccessAt: number | null;
  setFromDevice: (isOnline: boolean) => void;
  recordSuccess: () => void;
  recordNetworkFailure: () => void;
}

export const useConnectivityStore = create<ConnectivityState>((set) => ({
  // Assume online until told otherwise. Starting offline would blank every
  // financial screen for the second it takes the first request to answer.
  isOnline: true,
  source: 'assumed',
  lastSuccessAt: null,

  setFromDevice: (isOnline) => set({ isOnline, source: 'device' }),

  recordSuccess: () =>
    set({ isOnline: true, source: 'observed', lastSuccessAt: Date.now() }),

  recordNetworkFailure: () => set({ isOnline: false, source: 'observed' }),
}));

/** Read the current answer outside React — used by the API layer's guards. */
export function isOnlineNow(): boolean {
  return useConnectivityStore.getState().isOnline;
}

/**
 * Wires the device's own network state in, when a source for it exists.
 *
 * `expo-network` is loaded through a guarded dynamic require rather than a
 * static import: the module is optional, and a static import would turn "the
 * app was built without it" into a startup crash on the one screen that most
 * needs to degrade gracefully.
 *
 * Returns a teardown function.
 */
export function startConnectivityWatch(): () => void {
  const { setFromDevice } = useConnectivityStore.getState();

  // ── Web ───────────────────────────────────────────────────────────────────
  if (
    typeof navigator !== 'undefined' &&
    typeof window !== 'undefined' &&
    typeof window.addEventListener === 'function' &&
    typeof navigator.onLine === 'boolean'
  ) {
    const update = () => setFromDevice(navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }

  // ── Native ────────────────────────────────────────────────────────────────
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const network = require('expo-network') as {
      addNetworkStateListener?: (listener: (state: { isInternetReachable?: boolean | null; isConnected?: boolean | null }) => void) => { remove: () => void };
      getNetworkStateAsync?: () => Promise<{ isInternetReachable?: boolean | null; isConnected?: boolean | null }>;
    };

    // `isInternetReachable` is the one that matters. `isConnected` is true on a
    // device attached to a router with no upstream, which is exactly the case
    // that must not read as online on a payment screen.
    const resolve = (state: { isInternetReachable?: boolean | null; isConnected?: boolean | null }) =>
      state.isInternetReachable ?? state.isConnected ?? true;

    network.getNetworkStateAsync?.()
      .then((state) => setFromDevice(resolve(state)))
      .catch(() => {
        /* Leave the assumption in place. */
      });

    const subscription = network.addNetworkStateListener?.((state) =>
      setFromDevice(resolve(state))
    );

    return () => subscription?.remove();
  } catch {
    // No module. Observed outcomes carry the whole load, which is degraded but
    // correct: nothing claims to be online that has not just talked to the API.
    return () => undefined;
  }
}

/**
 * Keeps TanStack Query's own online manager in step.
 *
 * Without this, React Query on native assumes it is always online and retries
 * into a dead radio. With it, queries pause while offline and resume when the
 * connection comes back — which is the correct behaviour for *reads*. Financial
 * *writes* are gated separately and never resume automatically.
 */
export function bindQueryOnlineManager(): () => void {
  let unsubscribe: (() => void) | undefined;

  onlineManager.setEventListener((setOnline) => {
    unsubscribe = useConnectivityStore.subscribe((state) => setOnline(state.isOnline));
    setOnline(useConnectivityStore.getState().isOnline);
    return () => unsubscribe?.();
  });

  return () => unsubscribe?.();
}
