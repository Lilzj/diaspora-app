import type { ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useAuthStore } from '@/store/auth';
import { memberRouteDecision } from '@/lib/platform/member-route';

/**
 * A route group for signed-in members, declared by the group itself (FARCH-006).
 *
 * The root layout still decides where a member goes. It sends a caller with no
 * session to the login screen and a held member to the access gateway, from any
 * route. What it could not do is stop a screen being drawn: its redirects run in
 * effects, after a render, so a wallet screen painted one more frame of a
 * balance after a session ended, and a deep link opened on a cold start drew its
 * screen before the session had been read.
 *
 * A group wrapped in this renders only when {@link memberRouteDecision} says
 * `enter`, and a plain splash otherwise. It does not navigate. The root layout's
 * redirects already cover every other case, by the same rule, and a second
 * `router.replace` to the same screen would mount that screen twice.
 */
export function RequireMember({ children }: { readonly children: ReactNode }) {
  const decision = useAuthStore((state) =>
    memberRouteDecision({
      status: state.status,
      isAuthenticated: state.isAuthenticated,
      isExploringLimited: state.isExploringLimited,
      accountState: state.user?.accountState,
    })
  );

  if (decision === 'enter') return <>{children}</>;

  return (
    <View
      testID="member-route-splash"
      accessibilityLabel="Loading"
      className="flex-1 items-center justify-center bg-surface-background"
    >
      <ActivityIndicator />
    </View>
  );
}
