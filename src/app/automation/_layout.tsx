import { Stack } from 'expo-router';

/**
 * Frontend Phase 18 — the automation tree.
 *
 * Headers are off because every screen renders `<ScreenHeader>`, which is the
 * convention the settings and integration trees already follow.
 */
export default function AutomationLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
