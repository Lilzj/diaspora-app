import '../../global.css';

import { useEffect } from 'react';
import { View } from 'react-native';
import { Stack, router, useSegments } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '@/store/auth';
import { AppProvider } from '@/providers/app-provider';
import { StatusBar } from 'expo-status-bar';
import { initMocks } from '@/mocks';

import { TourProvider } from '@/components/explore/TourProvider';
import { StartupLocationPrompt } from '@/components/StartupLocationPrompt';

// Initialize mock API adapter
initMocks();

export default function RootLayout() {



  const { isAuthenticated, user, isExploringLimited } = useAuthStore();
  const accountState = user?.accountState;
  const segments = useSegments();

  useEffect(() => {
    const inAuthGroup = segments[0] === '(auth)' || !segments[0];
    if (!isAuthenticated && !isExploringLimited && !inAuthGroup) {
      // Redirect to login when user is outside of auth group and not authenticated
      router.replace('/(auth)/login');
    }
  }, [isAuthenticated, segments, isExploringLimited]);

  useEffect(() => {
    if (isAuthenticated && accountState && !isExploringLimited) {
      if (
        accountState === 'DiasporaVerificationPending' ||
        accountState === 'VerificationUnderReview' ||
        accountState === 'VerificationRejected' ||
        accountState === 'RequiresMoreInformation' ||
        accountState === 'Suspended' ||
        accountState === 'Restricted' ||
        accountState === 'AppealPending'
      ) {
        // Intercept navigation and direct to gateway dashboard
        router.replace('/access-gateway');
      }
    }
  }, [isAuthenticated, accountState, isExploringLimited]);

  return (
    <AppProvider>
      <StatusBar style="auto" />
      {/* Inside AppProvider on purpose: it needs the NotificationProvider that
          provider mounts, so the permission prompt is the app's own alert modal
          rather than Android's system dialog (F-035). */}
      <StartupLocationPrompt />
      <TourProvider>
        <AppContainer>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(auth)" options={{ headerShown: false }} />
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="access-gateway" options={{ headerShown: false }} />
            <Stack.Screen name="conversation" options={{ headerShown: false }} />
            {/* Frontend Phase 8 — Maps & Navigation. A spatial presentation
                layer over the existing discovery surfaces, not a second one. */}
            <Stack.Screen name="map" options={{ headerShown: false }} />
            {/* Frontend Phase 13 — Multi-Community Expansion. §53's deep links
                live here: /community, /community/[slug] and the per-community
                content, statistics and governance routes beneath it. The
                `[slug]` layout restores the community context, so a link opened
                from outside the app lands with the right scope already applied. */}
            <Stack.Screen name="community" options={{ headerShown: false }} />
            {/* Frontend Phase 18 — Automation. §6 asks for one Automation
                Center rather than a management screen per module, so this is
                the only automation tree in the application: the centre, the
                builder, templates, history, run detail and saved searches all
                live beneath it. Contextual entry points on an event, a job or a
                listing create an automation and then bring the member here to
                manage it — an entry point, not a second management surface. */}
            <Stack.Screen name="automation" options={{ headerShown: false }} />
          </Stack>
        </AppContainer>
      </TourProvider>
    </AppProvider>
  );
}

function AppContainer({ children }: { children: React.ReactNode }) {
  return (
    // The root background. Hard-coded `bg-white` here would sit behind every
    // screen in dark mode; `bg-surface-background` follows the colour scheme
    // through the CSS variables in global.css.
    <View style={{ flex: 1 }} className="bg-surface-background">
      {children}
    </View>
  );
}

