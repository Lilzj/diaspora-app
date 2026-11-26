import { Stack } from 'expo-router';
import { RequireMember } from '@/components/RequireMember';

export default function ConversationLayout() {
  return (
    <RequireMember>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="[id]" options={{ headerShown: false }} />
        <Stack.Screen name="request" options={{ headerShown: false }} />
        <Stack.Screen name="blocked" options={{ headerShown: false }} />
        <Stack.Screen name="archived" options={{ headerShown: false }} />
        <Stack.Screen name="media/[id]" options={{ headerShown: false }} />
      </Stack>
    </RequireMember>
  );
}
