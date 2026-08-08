import { Stack } from 'expo-router';

export default function ConversationLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="[id]" options={{ headerShown: false }} />
      <Stack.Screen name="request" options={{ headerShown: false }} />
      <Stack.Screen name="blocked" options={{ headerShown: false }} />
      <Stack.Screen name="archived" options={{ headerShown: false }} />
      <Stack.Screen name="media/[id]" options={{ headerShown: false }} />
    </Stack>
  );
}
