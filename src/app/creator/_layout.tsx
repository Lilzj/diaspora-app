import { Stack } from 'expo-router';

/**
 * The creator stack.
 *
 * A sibling of `/wallet` and `/monetization` rather than a child of either, and
 * the split follows the information architecture the platform already has:
 *
 *   `/wallet`        the member's own money — balance, statement, giving
 *   `/monetization`  the business surface — what you sell and promote
 *   `/creator`       the creator programme — status, learning, rewards, grants
 *
 * The three are joined rather than separated. The revenue dashboard here opens
 * the real wallet for a withdrawal; sponsoring a guide from here goes through
 * `/monetization/promote` and B15's real checkout; converting points goes to
 * `/wallet/rewards/convert`, which Phase 5 built. Nothing in this stack owns
 * money, and nothing in it duplicates a payment flow.
 *
 * `/profile/creator-dashboard` — the existing Creator Studio workspace — stays
 * exactly where it is and keeps working. It answers a different question
 * ("manage my published content") from the one this stack answers ("how is my
 * creator career going"), and this dashboard links to it rather than absorbing
 * it. Phase 7 was explicitly not to create a second creator system.
 */
export default function CreatorLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
