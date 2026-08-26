import { Link } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';

export default function TodayScreen() {
  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" className="flex-1 bg-canvas" contentContainerClassName="gap-6 px-5 pb-10 pt-4">
      <View className="flex-row items-center justify-between">
        <View>
          <Text className="text-3xl font-bold text-ink">Today</Text>
          <Text className="mt-1 text-muted">Your medication timeline will live here.</Text>
        </View>
        <Link href="/settings" asChild>
          <Pressable className="rounded-full bg-white px-4 py-2"><Text className="font-semibold text-ink">Settings</Text></Pressable>
        </Link>
      </View>

      <View className="gap-3 rounded-card bg-white p-5">
        <Text className="text-sm font-semibold uppercase tracking-wide text-muted">Next dose</Text>
        <Text className="text-xl font-bold text-ink">No medications yet</Text>
        <Text className="leading-6 text-muted">Once a plan is confirmed, the next pending dose appears here with deterministic Taken, Snooze, and Skip actions.</Text>
      </View>
    </ScrollView>
  );
}
