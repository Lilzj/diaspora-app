import { Stack } from 'expo-router';
import { RequireMember } from '@/components/RequireMember';

/**
 * Frontend Phase 16 — the integration settings tree.
 *
 * Headers are off because every screen renders `<ScreenHeader>`, which is the
 * convention the rest of the settings tree already follows.
 */
export default function IntegrationsLayout() {
  return (
    <RequireMember>
      <Stack screenOptions={{ headerShown: false }} />
    </RequireMember>
  );
}
