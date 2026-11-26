import { Stack } from 'expo-router';
import { RequireMember } from '@/components/RequireMember';

/**
 * Frontend Phase 18 — the automation tree.
 *
 * Headers are off because every screen renders `<ScreenHeader>`, which is the
 * convention the settings and integration trees already follow.
 */
export default function AutomationLayout() {
  return (
    <RequireMember>
      <Stack screenOptions={{ headerShown: false }} />
    </RequireMember>
  );
}
