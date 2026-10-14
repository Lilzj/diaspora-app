import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { isAwaitingDecision } from '@/lib/access-state';
import { useAuthStore } from '@/store/auth';
import { useNotification } from '@/providers/notification-provider';

/** How often a member waiting on a decision asks for it, while the app is open. */
const WAITING_CHECK_MS = 10_000;

/**
 * Tells a member, in so many words, that their verification was decided.
 *
 * Added 14 Oct 2026. The waiting screen only asked again when it came back into
 * view, so an approval reached a member 10 to 15 seconds late or not at all
 * while they watched, and when it did the screen simply changed underneath
 * them. Now, while a decision is awaited, it is asked for every ten seconds, and
 * the change is announced: a welcome on approval, a pointer on refusal.
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

  // Ask for the decision while one is awaited and the app is in front.
  useEffect(() => {
    if (!isAuthenticated || !isAwaitingDecision(accountState as never)) return undefined;

    const timer = setInterval(() => {
      if (AppState.currentState === 'active') void useAuthStore.getState().syncAccess();
    }, WAITING_CHECK_MS);
    return () => clearInterval(timer);
  }, [isAuthenticated, accountState]);

  return null;
}
