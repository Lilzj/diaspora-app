import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { openRouteTarget } from '@/lib/platform/notification-routes';

/**
 * `https://diaspora-api.fly.dev/open/<route>`: an email's button, opened by the app.
 *
 * Added 20 Oct 2026. Email buttons were the API host plus an in-app path
 * (`/profile/trust-center`), which the server does not serve, so tapping one
 * showed a 404 in the browser. They now go to `/open/<route>`: the server
 * answers a page that opens the app, and Android hands the link straight to the
 * app (App Link, `app.json`). This screen forwards to the route inside it, and
 * only to a route the app knows (the same check notification taps use).
 *
 * The link's query goes with it (FBL-005, 25 Nov 2026). On Android this screen
 * is the only thing between the link and the route, and it rebuilt the path
 * alone, so a link's tab or filter never arrived. See `openRouteTarget`.
 */
export default function OpenRouteScreen() {
  const params = useLocalSearchParams<Record<string, string | string[]>>();
  const target = openRouteTarget(params);

  useEffect(() => {
    // Replaced, not pushed: Back must not land on this screen and forward again.
    router.replace(target);
  }, [target]);

  return (
    <View className="flex-1 items-center justify-center bg-surface-background">
      <ActivityIndicator />
    </View>
  );
}
