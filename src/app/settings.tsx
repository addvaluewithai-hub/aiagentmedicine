import { ScrollView, Text, View } from 'react-native';

export default function SettingsScreen() {
  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" className="flex-1 bg-canvas" contentContainerClassName="gap-4 px-5 pb-10 pt-4">
      <View className="rounded-card bg-white p-5">
        <Text className="text-lg font-bold text-ink">Reminder health</Text>
        <Text className="mt-2 leading-6 text-muted">Notification permission, exact-alarm availability, and battery restrictions will be surfaced here instead of silently assuming reminders are reliable.</Text>
      </View>
    </ScrollView>
  );
}
