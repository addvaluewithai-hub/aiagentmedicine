import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';

import { isMedicationDraftReady } from '@/ai/medication-draft-schema';
import { commitMedicationDraft } from '@/domain/medication-plans';
import {
  clearOnboardingDraft,
  getOnboardingDraft
} from '@/features/onboarding/draft-store';
import { replenishLocalReminderWindow } from '@/services/local-reminder-window';

export default function ReviewPlanScreen() {
  const router = useRouter();
  const [isConfirming, setIsConfirming] = useState(false);
  const draft = getOnboardingDraft();
  const ready = draft ? isMedicationDraftReady(draft) : false;

  async function confirmPlan() {
    if (!draft || !ready || isConfirming) return;
    setIsConfirming(true);

    try {
      commitMedicationDraft(draft);
      clearOnboardingDraft();
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : 'unknown-error';
      Alert.alert('Could not save the plan', `No medication plan was saved. ${detail}`);
      setIsConfirming(false);
      return;
    }

    try {
      const reminderResult = await replenishLocalReminderWindow({ requestPermission: true });
      if (!reminderResult.notificationsAllowed) {
        Alert.alert(
          'Plan saved, notifications are off',
          'Your medication plan is stored on this device, but reminders cannot appear until notification permission is enabled.'
        );
      }
    } catch {
      Alert.alert(
        'Plan saved, reminders need attention',
        'Your medication plan is stored on this device, but notification setup did not finish. You can continue using the app and fix reminder permissions later.'
      );
    }

    router.replace('/(tabs)/today');
  }

  if (!draft) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-canvas px-6">
        <Text className="text-center text-xl font-bold text-ink">No medication draft to review</Text>
        <Text className="text-center leading-6 text-muted">Go back and show or describe your medication first.</Text>
        <Pressable onPress={() => router.replace('/onboarding/setup')} className="rounded-2xl bg-brand px-5 py-3">
          <Text className="font-semibold text-white">Add medication</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      className="flex-1 bg-canvas"
      contentContainerClassName="gap-5 px-5 pb-10 pt-4"
    >
      <View className="gap-2">
        <Text className="text-2xl font-bold text-ink">Review before anything is scheduled</Text>
        <Text className="text-base leading-6 text-muted">This is the user-confirmation boundary. The AI draft becomes authoritative only after you confirm it here.</Text>
      </View>

      {draft.medications.map((item, index) => {
        const scheduleDays = item.scheduleDays === null
          ? 'Every day'
          : item.scheduleDays?.join(', ') || '—';

        return (
          <View key={`${item.name ?? 'medication'}-${index}`} className="gap-3 rounded-card bg-white p-5">
            <Text selectable className="text-xl font-bold text-ink">{item.name ?? 'Unknown medication'}</Text>
            <Text selectable className="text-muted">Strength: {item.strength ?? '—'}</Text>
            <Text selectable className="text-muted">Dose: {item.doseAmount ?? '—'}</Text>
            <Text selectable className="text-muted">Frequency: {item.frequency ?? '—'}</Text>
            {item.mealRelation ? <Text selectable className="text-muted">Meals: {item.mealRelation}</Text> : null}
            {item.timingText ? <Text selectable className="text-muted">Instructions: {item.timingText}</Text> : null}
            <Text selectable className="text-muted">Days: {scheduleDays}</Text>
            <Text selectable className="font-semibold text-ink">Reminder times: {item.reminderTimes.join(', ') || '—'}</Text>
          </View>
        );
      })}

      {!ready ? (
        <View className="rounded-2xl bg-amber-50 p-4">
          <Text className="text-sm leading-5 text-amber-800">This draft still has critical missing or uncertain fields. Go back and clarify them before saving.</Text>
        </View>
      ) : null}

      <Pressable
        disabled={!ready || isConfirming}
        onPress={confirmPlan}
        className="items-center rounded-2xl bg-brand px-4 py-4 disabled:opacity-35"
      >
        <Text className="font-semibold text-white">{isConfirming ? 'Saving & scheduling…' : 'Confirm medication plan'}</Text>
      </Pressable>

      <Pressable disabled={isConfirming} onPress={() => router.back()} className="items-center px-4 py-3">
        <Text className="font-semibold text-ink">Tell the assistant what to change</Text>
      </Pressable>
    </ScrollView>
  );
}
