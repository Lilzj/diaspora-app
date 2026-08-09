import { Stack } from 'expo-router';

/**
 * Frontend Phase 16 — the integration settings tree.
 *
 * Headers are off because every screen renders `<ScreenHeader>`, which is the
 * convention the rest of the settings tree already follows.
 */
export default function IntegrationsLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
