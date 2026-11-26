import { Stack } from 'expo-router';
import { RequireMember } from '@/components/RequireMember';

/**
 * The moderation stack: the moderation queue, community deletions and grant review.
 *
 * It had no layout, so nothing here said the group was for members: the root
 * layout's redirect covered it only because it covers everything outside
 * `(auth)`. The requirement is the group's own now (FARCH-006).
 */
export default function ModerationLayout() {
  return (
    <RequireMember>
      <Stack screenOptions={{ headerShown: false }} />
    </RequireMember>
  );
}
