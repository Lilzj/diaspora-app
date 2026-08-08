import { Stack } from 'expo-router';

/**
 * The monetization stack.
 *
 * A sibling of `/wallet` rather than a child of it, and the split follows the
 * information architecture that already exists: `/wallet` is the member's own
 * money — balance, statement, giving, receipts — and B13's billing notifications
 * already deep-link into five of its routes. Monetization is the business
 * surface above that: what you sell, what you promote, what you subscribe to.
 * Nesting fifteen business screens under the member wallet would bury the
 * balance the wallet exists to show.
 *
 * The two surfaces are joined rather than separated: `/wallet` links here for
 * purchases and subscriptions, every checkout on this side opens the wallet's
 * own `PaymentSheet`, and the routes B13 already emits — `/wallet/subscription`,
 * `/wallet/placements/{id}` — keep working and lead here for management.
 */
export default function MonetizationLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
