import { ScrollView, Text, TextInput, View } from 'react-native';

export default function AgentScreen() {
  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" className="flex-1 bg-canvas" contentContainerClassName="flex-grow justify-between gap-6 px-5 pb-10 pt-4">
      <View className="gap-2">
        <Text className="text-3xl font-bold text-ink">Agent</Text>
        <Text className="leading-6 text-muted">The agent will understand natural medication actions, but deterministic controls remain available when AI or the network is unavailable.</Text>
      </View>

      <TextInput placeholder="Tell me: I took it, remind me later…" className="rounded-2xl bg-white px-4 py-4 text-base text-ink" />
    </ScrollView>
  );
}
