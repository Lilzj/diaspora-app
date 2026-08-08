import '../../global.css';

import { useEffect } from 'react';
import { Alert, Platform, View } from 'react-native';
import { Stack, router, useSegments } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '@/store/auth';
import { AppProvider } from '@/providers/app-provider';
import { StatusBar } from 'expo-status-bar';
import { initMocks } from '@/mocks';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocationStore } from '@/store/location';

import { TourProvider } from '@/components/explore/TourProvider';

// Initialize mock API adapter
initMocks();

export default function RootLayout() {
  const store = useLocationStore();

  useEffect(() => {
    // Request location permissions immediately on startup
    const requestStartupPermission = async () => {
      try {
        const savedStatus = await AsyncStorage.getItem('diaspora_location_permission');
        if (savedStatus === 'granted') {
          store.setPermissionStatus('granted');
          await store.detectLocation();
          return;
        } else if (savedStatus === 'denied') {
          store.setPermissionStatus('denied');
          return;
        }
      } catch (err) {
        console.error('Failed to read location permission from AsyncStorage', err);
      }

      // Use platform-specific prompt if undetermined
      if (Platform.OS === 'web') {
        const accept = window.confirm(
          'Allow Diaspora to access your location?\n\nWe use your location to show nearby providers, jobs, housing, and community events.'
        );
        if (accept) {
          try {
            await AsyncStorage.setItem('diaspora_location_permission', 'granted');
            store.setPermissionStatus('granted');
            await store.detectLocation();
          } catch (err) {
            console.error('Startup location detection failed', err);
          }
        } else {
          store.setPermissionStatus('denied');
          await AsyncStorage.setItem('diaspora_location_permission', 'denied');
        }
      } else {
        Alert.alert(
          'Allow Diaspora to access your location?',
          'We use your location to show nearby providers, jobs, housing, and community events.',
          [
            {
              text: "Don't Allow",
              onPress: async () => {
                store.setPermissionStatus('denied');
                await AsyncStorage.setItem('diaspora_location_permission', 'denied');
              },
              style: 'cancel',
            },
            {
              text: 'Allow While Using App',
              onPress: async () => {
                try {
                  await AsyncStorage.setItem('diaspora_location_permission', 'granted');
                  store.setPermissionStatus('granted');
                  await store.detectLocation();
                } catch (err) {
                  console.error('Startup location detection failed', err);
                }
              },
            },
          ]
        );
      }
    };

    // Small delay to let initial UI mount
    const timer = setTimeout(() => {
      requestStartupPermission();
    }, 500);

    return () => clearTimeout(timer);
  }, []);

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
      <TourProvider>
        <AppContainer>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(auth)" options={{ headerShown: false }} />
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="access-gateway" options={{ headerShown: false }} />
            <Stack.Screen name="conversation" options={{ headerShown: false }} />
          </Stack>
        </AppContainer>
      </TourProvider>
    </AppProvider>
  );
}

function AppContainer({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ flex: 1 }} className="bg-white">
      {children}
    </View>
  );
}

