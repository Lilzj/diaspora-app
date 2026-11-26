import { Stack } from 'expo-router';
import { RequireMember } from '@/components/RequireMember';

/**
 * The employer stack: an employer's profile and employer registration.
 *
 * It had no layout, so nothing here said the group was for members: the root
 * layout's redirect covered it only because it covers everything outside
 * `(auth)`. The requirement is the group's own now (FARCH-006).
 */
export default function EmployerLayout() {
  return (
    <RequireMember>
      <Stack screenOptions={{ headerShown: false }} />
    </RequireMember>
  );
}
