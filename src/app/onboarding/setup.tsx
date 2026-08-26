import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

const entryActions = [
  { id: 'camera', label: 'Take photo', icon: '📷' },
  { id: 'library', label: 'Choose photo', icon: '🖼️' },
  { id: 'voice', label: 'Speak', icon: '🎙️' }
] as const;

export default function MedicationSetupScreen() {
  const [message, setMessage] = useState('');
  const [sourceUri, setSourceUri] = useState<string | null>(null);

  async function chooseSource(id: (typeof entryActions)[number]['id']) {
    if (id === 'voice') {
      Alert.alert('Voice spike next', 'Push-to-talk is wired in the next implementation slice.');
      return;
    }

    const result = id === 'camera'
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.85 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85 });

    if (!result.canceled && result.assets[0]?.uri) {
      setSourceUri(result.assets[0].uri);
    }
  }

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" className="flex-1 bg-canvas" contentContainerClassName="gap-6 px-5 pb-10 pt-4">
      <View className="gap-2">
        <Text className="text-2xl font-bold text-ink">Show me or tell me.</Text>
        <Text className="text-base leading-6 text-muted">No forms. Add a medicine box, prescription, voice note, or plain text.</Text>
      </View>

      <View className="flex-row gap-3">
        {entryActions.map((action) => (
          <Pressable key={action.id} onPress={() => chooseSource(action.id)} className="flex-1 items-center gap-2 rounded-card bg-white px-2 py-5 active:opacity-70">
            <Text className="text-2xl">{action.icon}</Text>
            <Text className="text-center text-sm font-semibold text-ink">{action.label}</Text>
          </Pressable>
        ))}
      </View>

      {sourceUri ? (
        <View className="rounded-card bg-white p-4">
          <Text className="font-semibold text-ink">Photo ready</Text>
          <Text className="mt-1 text-sm text-muted" numberOfLines={1}>{sourceUri}</Text>
          <Text className="mt-3 text-sm text-muted">Next: send this source through the AI gateway and continue clarification inline.</Text>
        </View>
      ) : null}

      <View className="gap-3 rounded-card bg-white p-4">
        <Text className="text-sm font-semibold text-ink">Or describe it</Text>
        <TextInput
          value={message}
          onChangeText={setMessage}
          placeholder="Example: I take metformin twice a day after breakfast and dinner"
          multiline
          className="min-h-28 rounded-2xl bg-canvas px-4 py-3 text-base text-ink"
          textAlignVertical="top"
        />
        <Pressable disabled={!message.trim()} className="items-center rounded-2xl bg-brand px-4 py-3 disabled:opacity-40">
          <Text className="font-semibold text-white">Send to assistant</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
