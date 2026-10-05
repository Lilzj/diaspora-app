// Going back from a screen that may have been opened on its own.
//
// A screen opened from a link (App Link, `diaspora://`, a notification) is the
// only screen in its stack, so `router.back()` has nowhere to go: it does
// nothing, and in development throws "The action 'GO_BACK' was not handled".
// Seen on 5 Oct 2026 on the event page's "Back to Events", which left a member
// on an error screen with no way off it.

import { router, type Href } from 'expo-router';

/** Goes back when there is somewhere to go back to, and to `fallback` otherwise. */
export function backOr(fallback: Href): void {
  if (router.canGoBack()) {
    router.back();
    return;
  }
  router.replace(fallback);
}
