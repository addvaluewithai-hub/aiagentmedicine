import { Stack } from 'expo-router';

export default function OnboardingLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="setup" options={{ title: 'Add medications' }} />
      <Stack.Screen name="review" options={{ title: 'Review plan' }} />
    </Stack>
  );
}
