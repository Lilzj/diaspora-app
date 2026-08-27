// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — what the hub says this deployment serves
//
// `RealtimeHub.OnConnectedAsync` sends a `ConnectionAcknowledged` handshake to
// every connecting client, carrying five booleans that say which live features
// are switched on. The client had no handler for it, so SignalR logged "No
// client method with the name 'connectionacknowledged' found" and discarded
// them — while rendering typing indicators, presence dots, read receipts and
// delivery ticks regardless.
//
// `lib/realtime.ts` now captures the handshake and refuses to dispatch an event
// whose feature is off, so a store can never fill with something the deployment
// does not serve. This hook is the other half: a surface that wants to *hide an
// affordance* — not merely render it empty — can ask.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';

import { peekRealtimeClient } from '@/lib/realtime';
import { NO_REALTIME_CAPABILITIES, type RealtimeCapabilities } from '@/types/conversation';

/**
 * The live features this connection's deployment actually serves.
 *
 * Everything is false until the hub says otherwise — including before a client
 * exists at all. That is the honest reading of "nobody has told us", and it is
 * the whole point: the defect this replaces was a client asserting four
 * capabilities it had never been granted.
 */
export function useRealtimeCapabilities(): RealtimeCapabilities {
  const [capabilities, setCapabilities] = useState<RealtimeCapabilities>(
    () => peekRealtimeClient()?.getCapabilities() ?? NO_REALTIME_CAPABILITIES
  );

  useEffect(() => {
    const client = peekRealtimeClient();

    // No client yet. `NO_REALTIME_CAPABILITIES` already stands, and a surface
    // that mounts before the hub connects will re-render when it does — the
    // conversation screens mount under the same provider that initialises it.
    if (!client) return;

    // `onCapabilities` calls back immediately with the current value, so a
    // subscriber arriving after the handshake is not left waiting for a second
    // one that never comes.
    return client.onCapabilities(setCapabilities);
  }, []);

  return capabilities;
}
