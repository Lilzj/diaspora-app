// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Legacy subscription route (Frontend Phase 6)
//
// **This route must keep resolving.** B15's billing notification templates deep
// link `billing.subscription.activated` and `billing.subscription.ended` to
// `/wallet/subscription`, and PSR-1.1 named it as one of "the names the backend
// already emits". A backend deployment sends that path to whatever version of
// the app is installed; deleting the route would send every subscription
// notification to the inbox instead.
//
// Phase 6 rebuilt the screen at `/monetization/subscription` as a superset —
// status, grace period, trial, entitlements, limits, plan change, cancellation
// and billing — so this redirects rather than keeping a second implementation
// that would drift from it. §37-16: no regression; §3: do not duplicate.
// ─────────────────────────────────────────────────────────────────────────────

import { Redirect } from 'expo-router';

export default function LegacySubscriptionScreen() {
  return <Redirect href="/monetization/subscription" />;
}
