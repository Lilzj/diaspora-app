import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { isResolvableRoute } from '@/lib/notification-routes';

/**
 * `https://diaspora-api.fly.dev/open/<route>`: an email's button, opened by the app.
 *
 * Added 20 Oct 2026. Email buttons were the API host plus an in-app path
 * (`/profile/trust-center`), which the server does not serve, so tapping one
 * showed a 404 in the browser. They now go to `/open/<route>`: the server
 * answers a page that opens the app, and Android hands the link straight to the
 * app (App Link, `app.json`). This screen forwards to the route inside it, and
 * only to a route the app knows (the same check notification taps use).
 */
export default function OpenRouteScreen() {
  const { route } = useLocalSearchParams<{ route?: string | string[] }>();

  useEffect(() => {
    const path = `/${(Array.isArray(route) ? route : [route ?? '']).filter(Boolean).join('/')}`;
    // Replaced, not pushed: Back must not land on this screen and forward again.
    router.replace((isResolvableRoute(path) ? path : '/(tabs)') as never);
  }, [route]);

  return (
    <View className="flex-1 items-center justify-center bg-surface-background">
      <ActivityIndicator />
    </View>
  );
}
