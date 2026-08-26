import { Link } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';

export default function ReviewPlanScreen() {
  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" className="flex-1 bg-canvas" contentContainerClassName="gap-5 px-5 pb-10 pt-4">
      <View className="gap-2">
        <Text className="text-2xl font-bold text-ink">Review before anything is scheduled</Text>
        <Text className="text-base leading-6 text-muted">AI-created values remain drafts until you confirm them here.</Text>
      </View>

      <View className="gap-3 rounded-card bg-white p-5">
        <Text className="text-lg font-bold text-ink">Example medication draft</Text>
        <Text className="text-muted">Medication: —</Text>
        <Text className="text-muted">Strength: —</Text>
        <Text className="text-muted">Instruction: —</Text>
        <Text className="text-muted">Reminder times: —</Text>
      </View>

      <Link href="/(tabs)/today" asChild>
        <Pressable className="items-center rounded-2xl bg-brand px-4 py-4">
          <Text className="font-semibold text-white">Confirm plan</Text>
        </Pressable>
      </Link>
    </ScrollView>
  );
}
