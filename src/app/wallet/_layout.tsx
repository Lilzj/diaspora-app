import { Stack } from 'expo-router';

/**
 * The wallet stack.
 *
 * The route names are not a client-side choice. B13's billing notification
 * templates already deep-link to `/wallet`, `/wallet/payments/{id}`,
 * `/wallet/subscription`, `/wallet/placements/{id}` and
 * `/wallet/receipts/{reference}` — those routes were declared by the backend
 * before this surface existed, and PSR-1.1's readiness report names them as
 * "the names the backend already emits". Building against anything else would
 * mean every billing notification falling back to the inbox.
 */
export default function WalletLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
