import '../../global.css';

import { Stack } from 'expo-router';
import { AppProvider } from '@/providers/app-provider';
import { StatusBar } from 'expo-status-bar';
import { initMocks } from '@/mocks';

// Initialize mock API adapter
if (__DEV__) {
  initMocks();
}

export default function RootLayout() {
  return (
    <AppProvider>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
    </AppProvider>
  );
}
