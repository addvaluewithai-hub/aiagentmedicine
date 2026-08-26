import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import {
  getMedicationBlockingFields,
  isMedicationDraftReady,
  type MedicationDraft
} from '@/ai/medication-draft-schema';
import { setOnboardingDraft } from '@/features/onboarding/draft-store';
import { extractMedication } from '@/services/ai-gateway';

const entryActions = [
  { id: 'camera', label: 'Take photo', icon: '📷' },
  { id: 'library', label: 'Choose photo', icon: '🖼️' },
  { id: 'voice', label: 'Speak', icon: '🎙️' }
] as const;

type SupportedMime = 'image/jpeg' | 'image/png' | 'image/webp';

function normalizeMime(mimeType: string | undefined, uri: string): SupportedMime {
  if (mimeType === 'image/png' || mimeType === 'image/webp' || mimeType === 'image/jpeg') {
    return mimeType;
  }
  if (uri.toLowerCase().endsWith('.png')) return 'image/png';
  if (uri.toLowerCase().endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}

export default function MedicationSetupScreen() {
  const router = useRouter();
  const [message, setMessage] = useState('');
  const [sourceUri, setSourceUri] = useState<string | null>(null);
  const [draft, setDraft] = useState<MedicationDraft | null>(null);
  const [assistantMessage, setAssistantMessage] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function analyze(input: {
    text?: string;
    imageBase64?: string;
    mimeType?: SupportedMime;
  }) {
    setIsSending(true);
    setError(null);
    try {
      const result = await extractMedication({
        ...input,
        existingDraft: draft ?? undefined
      });
      setDraft(result.draft);
      setOnboardingDraft(result.draft);
      setAssistantMessage(result.assistantMessage);
      setMessage('');
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : 'unknown-error';
      setError(`I couldn't process that yet (${detail}). Your medication data was not changed.`);
    } finally {
      setIsSending(false);
    }
  }

  async function chooseSource(id: (typeof entryActions)[number]['id']) {
    if (id === 'voice') {
      Alert.alert('Voice is next', 'Push-to-talk is the next spike. Text and photos are live in this slice.');
      return;
    }

    if (id === 'camera') {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Camera permission needed', 'You can still choose a photo or describe your medications in text.');
        return;
      }
    }

    const result = id === 'camera'
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.72, base64: true })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.72, base64: true });

    const asset = !result.canceled ? result.assets[0] : undefined;
    if (!asset?.uri) return;
    setSourceUri(asset.uri);

    if (!asset.base64) {
      setError('The selected image could not be prepared for analysis. Please try another image.');
      return;
    }

    await analyze({
      text: message.trim() || undefined,
      imageBase64: asset.base64,
      mimeType: normalizeMime(asset.mimeType, asset.uri)
    });
  }

  async function sendText() {
    const text = message.trim();
    if (!text || isSending) return;
    await analyze({ text });
  }

  function reviewDraft() {
    if (!draft || !isMedicationDraftReady(draft)) return;
    setOnboardingDraft(draft);
    router.push('/onboarding/review');
  }

  const ready = draft ? isMedicationDraftReady(draft) : false;

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      className="flex-1 bg-canvas"
      contentContainerClassName="gap-6 px-5 pb-10 pt-4"
      keyboardShouldPersistTaps="handled"
    >
      <View className="gap-2">
        <Text className="text-2xl font-bold text-ink">Show me or tell me.</Text>
        <Text className="text-base leading-6 text-muted">No forms. Add a medicine box, prescription, or plain text. I’ll ask only for what’s missing.</Text>
      </View>

      <View className="flex-row gap-3">
        {entryActions.map((action) => (
          <Pressable
            key={action.id}
            disabled={isSending}
            onPress={() => chooseSource(action.id)}
            className="flex-1 items-center gap-2 rounded-card bg-white px-2 py-5 active:opacity-70 disabled:opacity-40"
          >
            <Text className="text-2xl">{action.icon}</Text>
            <Text className="text-center text-sm font-semibold text-ink">{action.label}</Text>
          </Pressable>
        ))}
      </View>

      {sourceUri ? (
        <View className="rounded-card bg-white p-4">
          <Text className="font-semibold text-ink">Photo added</Text>
          <Text className="mt-1 text-sm text-muted" numberOfLines={1}>{sourceUri}</Text>
        </View>
      ) : null}

      {assistantMessage ? (
        <View className="rounded-card bg-brand/10 p-4">
          <Text className="text-sm font-semibold text-brand">Assistant</Text>
          <Text selectable className="mt-2 text-base leading-6 text-ink">{assistantMessage}</Text>
        </View>
      ) : null}

      {draft ? (
        <View className="gap-3">
          {draft.medications.map((item, index) => {
            const blocking = getMedicationBlockingFields(item);
            return (
              <View key={`${item.name ?? 'medication'}-${index}`} className="gap-2 rounded-card bg-white p-4">
                <View className="flex-row items-center justify-between gap-3">
                  <Text selectable className="flex-1 text-lg font-bold text-ink">{item.name ?? 'Medication name unclear'}</Text>
                  <Text className={blocking.length ? 'text-sm font-semibold text-amber-700' : 'text-sm font-semibold text-green-700'}>
                    {blocking.length ? 'Needs details' : 'Ready'}
                  </Text>
                </View>
                <Text selectable className="text-muted">Strength: {item.strength ?? '—'}</Text>
                <Text selectable className="text-muted">Dose: {item.doseAmount ?? '—'}</Text>
                <Text selectable className="text-muted">Frequency: {item.frequency ?? '—'}</Text>
                <Text selectable className="text-muted">Reminder times: {item.reminderTimes.length ? item.reminderTimes.join(', ') : '—'}</Text>
                {blocking.length ? (
                  <Text selectable className="text-sm text-amber-700">Still needed: {blocking.join(', ')}</Text>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : null}

      {error ? (
        <View className="rounded-2xl bg-red-50 p-4">
          <Text selectable className="text-sm text-red-800">{error}</Text>
        </View>
      ) : null}

      <View className="gap-3 rounded-card bg-white p-4">
        <Text className="text-sm font-semibold text-ink">{draft ? 'Reply to the assistant' : 'Or describe your medications'}</Text>
        <TextInput
          value={message}
          onChangeText={setMessage}
          placeholder={draft ? 'Example: I take it at 8 AM and 8 PM' : 'Example: I take metformin 500 mg, one tablet twice a day at 8 AM and 8 PM'}
          multiline
          editable={!isSending}
          className="min-h-28 rounded-2xl bg-canvas px-4 py-3 text-base text-ink"
          textAlignVertical="top"
        />
        <Pressable
          disabled={!message.trim() || isSending}
          onPress={sendText}
          className="items-center rounded-2xl bg-brand px-4 py-3 disabled:opacity-40"
        >
          <Text className="font-semibold text-white">{isSending ? 'Thinking…' : draft ? 'Send reply' : 'Send to assistant'}</Text>
        </Pressable>
      </View>

      {draft ? (
        <Pressable
          disabled={!ready || isSending}
          onPress={reviewDraft}
          className="items-center rounded-2xl bg-ink px-4 py-4 disabled:opacity-30"
        >
          <Text className="font-semibold text-white">{ready ? 'Review medication plan' : 'Finish the missing details first'}</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}
