import { useEffect, useRef } from 'react';

import { isAwaitingDecision } from '@/lib/access-state';
import { getRealtimeClient } from '@/lib/realtime';
import { useAuthStore } from '@/store/auth';
import { useNotification } from '@/providers/notification-provider';

/** What the server sends a member's own socket when their access changes. */
const ACCESS_RESOURCE = 'account';
const ACCESS_CHANGED = 'access.changed';

/**
 * Tells a member, in so many words, that their verification was decided.
 *
 * Added 14 Oct 2026. The waiting screen only asked again when it came back into
 * view, so an approval reached a member 10 to 15 seconds late or not at all
 * while they watched, and when it did the screen simply changed underneath
 * them. Now the server says so over the realtime socket the moment the account
 * changes (`ResourceChanged`, `account` / `access.changed`), the app fetches its
 * access once, and the change is announced: a welcome on approval, a pointer on
 * refusal. No polling: the first version asked every ten seconds, which is a
 * token refresh every ten seconds for every waiting member.
 *
 * Renders nothing. Mounted inside the notification provider, like
 * `StartupLocationPrompt`, because it shows the app's own alert.
 */
export function VerificationDecisionNotice() {
  const { showAlert } = useNotification();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const accountState = useAuthStore((state) => state.user?.accountState ?? null);
  const firstName = useAuthStore((state) => state.user?.fullName?.trim().split(/\s+/)[0] ?? '');

  // The state this member was in when we last looked. Only a change seen while
  // the app is open is announced; a member who signs in already verified is not
  // congratulated again.
  const previous = useRef<string | null>(null);

  useEffect(() => {
    const before = previous.current;
    previous.current = accountState;
    if (!before || !isAwaitingDecision(before as never) || before === accountState) return;

    if (accountState === 'DiasporaVerified' || accountState === 'FullCommunityAccess') {
      showAlert({
        type: 'success',
        title: firstName ? `You're verified, ${firstName}!` : "You're verified!",
        message:
          'Diaspora has approved your verification. You now have full access: post, list, review and take part in your community.',
        buttons: [{ text: "Let's go" }],
      });
    } else if (accountState === 'VerificationRejected' || accountState === 'RequiresMoreInformation') {
      showAlert({
        type: 'warning',
        title: accountState === 'RequiresMoreInformation' ? 'We need a little more' : 'Verification not approved',
        message: 'Diaspora has reviewed your verification. Open it to see what the reviewer said and what to do next.',
        buttons: [{ text: 'OK' }],
      });
    }
  }, [accountState, firstName, showAlert]);

  // While a decision is awaited, listen on the member's socket for it. The
  // frame carries no state: it only says "your access changed", and the app
  // asks the server what it now is. A reconnect re-asks, in case the decision
  // landed while the socket was down; returning to the app re-asks too
  // (`_layout.tsx`), and so does opening the approval push.
  const userId = useAuthStore((state) => state.user?.userId ?? null);
  useEffect(() => {
    if (!isAuthenticated || !userId || !isAwaitingDecision(accountState as never)) return undefined;

    const client = getRealtimeClient(userId);
    const sync = () => void useAuthStore.getState().syncAccess();

    const offChange = client.onResourceChanged((change) => {
      if (change.resourceType === ACCESS_RESOURCE && change.changeKind === ACCESS_CHANGED) sync();
    });
    let wasConnected = client.getConnectionState() === 'connected';
    const offState = client.onConnectionStateChange((state) => {
      if (state === 'connected' && !wasConnected) sync();
      wasConnected = state === 'connected';
    });

    // Shared with Messages and the map, and idempotent. Left open afterwards:
    // it is the app's one socket, not this screen's.
    client.connect().catch(() => {
      // No socket: the foreground check and the push still bring the decision.
    });

    return () => {
      offChange();
      offState();
    };
  }, [isAuthenticated, userId, accountState]);

  return null;
}
