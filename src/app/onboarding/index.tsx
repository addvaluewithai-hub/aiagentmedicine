import { Link } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';

export default function WelcomeScreen() {
  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" className="flex-1 bg-canvas" contentContainerClassName="flex-grow justify-end gap-8 px-6 pb-12 pt-20">
      <View className="gap-4">
        <View className="h-14 w-14 items-center justify-center rounded-2xl bg-brand">
          <Text className="text-2xl text-white">✦</Text>
        </View>
        <Text className="text-4xl font-bold leading-tight text-ink">Show me your medicines. I’ll handle the setup.</Text>
        <Text className="text-lg leading-7 text-muted">Take a photo, speak, or type. The assistant will build a draft and confirm everything with you before scheduling reminders.</Text>
      </View>

      <Link href="/onboarding/setup" asChild>
        <Pressable accessibilityRole="button" className="items-center rounded-2xl bg-brand px-5 py-4 active:opacity-80">
          <Text className="text-base font-semibold text-white">Set up my medications</Text>
        </Pressable>
      </Link>
    </ScrollView>
  );
}
