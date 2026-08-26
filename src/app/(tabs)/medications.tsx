import { Link } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';

export default function MedicationsScreen() {
  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" className="flex-1 bg-canvas" contentContainerClassName="gap-5 px-5 pb-10 pt-4">
      <View className="gap-1">
        <Text className="text-3xl font-bold text-ink">Medications</Text>
        <Text className="text-muted">Confirmed plans will appear here.</Text>
      </View>

      <Link href="/onboarding/setup" asChild>
        <Pressable className="items-center rounded-2xl border border-brand px-4 py-4">
          <Text className="font-semibold text-brand">Add medication with AI</Text>
        </Pressable>
      </Link>
    </ScrollView>
  );
}
