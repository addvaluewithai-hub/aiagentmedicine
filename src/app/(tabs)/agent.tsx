import { useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import type {
  AgentHistoryMessage,
  AgentPendingConfirmation
} from '@/agent/agent-dose-action-schema';
import { executeDoseAgentTool } from '@/agent/execute-dose-tool';
import { executePlanAgentTool } from '@/agent/execute-plan-tool';
import { getAgentRelevantPendingDoses } from '@/domain/dose-queries';
import { getMedicationPlanSummaries } from '@/domain/medication-management';
import { usePushToTalk } from '@/hooks/use-push-to-talk';
import { runMedicationAgent } from '@/services/ai-gateway';

type ChatMessage = AgentHistoryMessage;

const quickActions = [
  'I took it',
  'Remind me in 30 minutes',
  'Skip this dose',
  'Pause medication reminders'
] as const;

function planConfirmationLabel(pending: AgentPendingConfirmation) {
  return pending.name === 'pause_medication_plan'
    ? `Pause reminders for ${pending.medicationName}?`
    : `Resume reminders for ${pending.medicationName}?`;
}

function planConfirmationDetails(pending: AgentPendingConfirmation) {
  const scheduleDays = pending.scheduleDays === null
    ? 'Every day'
    : pending.scheduleDays.length
      ? pending.scheduleDays.join(', ')
      : 'Schedule days unavailable';
  const details = [
    pending.strength,
    `Days: ${scheduleDays}`,
    pending.reminderTimes.length
      ? `Reminders: ${pending.reminderTimes.join(', ')}`
      : 'No reminder times saved'
  ];
  return details.filter(Boolean).join(' · ');
}

export default function AgentScreen() {
  const voice = usePushToTalk();
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      text: 'Tell me what you want to do with your medication reminders. I can log dose actions, snooze reminders, or manage confirmed reminder plans.'
    }
  ]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingConfirmation, setPendingConfirmation] = useState<AgentPendingConfirmation | null>(null);

  async function sendMessage(rawText: string) {
    const text = rawText.trim();
    if (!text || isSending) return;

    const history = messages.slice(-8);
    const doses = getAgentRelevantPendingDoses().map((dose) => ({
      doseId: dose.doseId,
      dueAt: dose.dueAt,
      snoozedUntil: dose.snoozedUntil,
      medicationName: dose.medicationName,
      strength: dose.strength,
      doseAmount: dose.doseAmount
    }));
    const plans = getMedicationPlanSummaries().map((plan) => ({
      planId: plan.planId,
      medicationName: plan.medicationName,
      strength: plan.strength,
      status: plan.status,
      reminderTimes: plan.reminderTimes,
      scheduleDays: plan.scheduleDays
    }));

    setMessages((current) => [...current, { role: 'user', text }]);
    setInput('');
    setIsSending(true);
    setError(null);

    try {
      const response = await runMedicationAgent({
        text,
        doses,
        plans,
        history,
        pendingConfirmation,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
      });

      let assistantText = response.assistantMessage;
      let nextPendingConfirmation = response.pendingConfirmation;

      if (response.toolCall) {
        nextPendingConfirmation = null;

        if ('doseId' in response.toolCall) {
          const execution = await executeDoseAgentTool(response.toolCall);
          if (!execution.ok) {
            assistantText = 'That dose changed before I could update it. I refreshed the local state; tell me what you want to do now.';
          } else if (
            response.toolCall.name === 'snooze_dose' &&
            execution.notificationScheduled === false
          ) {
            assistantText += ' The dose is snoozed in the app, but I could not schedule the local notification.';
          }
        } else {
          const execution = await executePlanAgentTool(response.toolCall);
          if (!execution.ok) {
            assistantText = 'That reminder plan changed before I could update it. No additional change was made.';
          } else if (execution.notificationWarning) {
            assistantText += response.toolCall.name === 'pause_medication_plan'
              ? ' The plan is paused, but one or more old system notifications could not be removed.'
              : ' The plan is active, but local notifications could not be refreshed yet. The app will retry.';
          }
        }
      }

      setPendingConfirmation(nextPendingConfirmation);
      setMessages((current) => [...current, { role: 'assistant', text: assistantText }]);
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : 'unknown-error';

      if (detail === 'stale-pending-confirmation') {
        setPendingConfirmation(null);
        const fallbackText = 'That reminder plan changed since I asked for confirmation. I cleared the pending change; tell me what you want to do now.';
        setMessages((current) => [...current, { role: 'assistant', text: fallbackText }]);
        setError(null);
      } else {
        const fallbackText = 'I could not reach the agent right now. Your medication data was not changed. You can still use Today and Medications directly.';
        setMessages((current) => [...current, { role: 'assistant', text: fallbackText }]);
        setError(`Agent unavailable (${detail}).`);
      }
    } finally {
      setIsSending(false);
    }
  }

  async function confirmPendingAction() {
    const pending = pendingConfirmation;
    if (!pending || isSending || voice.isRecording || voice.isTranscribing) return;

    setMessages((current) => [...current, { role: 'user', text: 'Confirm' }]);
    setIsSending(true);
    setError(null);

    try {
      const execution = await executePlanAgentTool(pending);
      if (!execution.ok) {
        setMessages((current) => [...current, {
          role: 'assistant',
          text: 'That reminder plan changed before confirmation, so I did not apply another change.'
        }]);
        return;
      }

      const actionText = pending.name === 'pause_medication_plan'
        ? `Paused reminders for ${pending.medicationName}. Your recorded medication instructions were not changed.`
        : `Resumed reminders for ${pending.medicationName}. Your recorded medication instructions were not changed.`;
      const warningText = execution.notificationWarning
        ? pending.name === 'pause_medication_plan'
          ? ' One or more old system notifications could not be removed.'
          : ' Local notifications could not be refreshed yet; the app will retry.'
        : '';

      setMessages((current) => [...current, { role: 'assistant', text: actionText + warningText }]);
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : 'unknown-error';
      setMessages((current) => [...current, {
        role: 'assistant',
        text: 'I could not apply that confirmed reminder change. Your current plan state is still authoritative in Medications.'
      }]);
      setError(`Reminder change failed (${detail}).`);
    } finally {
      setPendingConfirmation(null);
      setIsSending(false);
    }
  }

  function cancelPendingAction() {
    if (!pendingConfirmation || isSending) return;
    setMessages((current) => [
      ...current,
      { role: 'user', text: 'Cancel' },
      { role: 'assistant', text: 'Canceled. No reminder settings were changed.' }
    ]);
    setPendingConfirmation(null);
    setError(null);
  }

  async function toggleVoice() {
    setError(null);
    const result = await voice.toggle();

    if (result.type === 'permission-denied') {
      Alert.alert('Microphone permission needed', 'You can still control your medication reminders by typing or using Today.');
      return;
    }

    if (result.type === 'error') {
      setError(`I couldn't use that recording (${result.message}). You can try again or type instead.`);
      return;
    }

    if (result.type === 'transcript') {
      await sendMessage(result.transcript);
    }
  }

  const isBusy = isSending || voice.isTranscribing;

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      className="flex-1 bg-canvas"
      contentContainerClassName="gap-5 px-5 pb-10 pt-4"
    >
      <View className="gap-2">
        <Text className="text-3xl font-bold text-ink">Agent</Text>
        <Text className="leading-6 text-muted">Say or type what happened. Dose actions can execute directly; reminder-plan changes always require confirmation first.</Text>
      </View>

      <View className="gap-3">
        {messages.map((message, index) => (
          <View
            key={`${message.role}-${index}`}
            className={message.role === 'user'
              ? 'ml-10 rounded-2xl bg-ink p-4'
              : 'mr-10 rounded-2xl bg-white p-4'}
          >
            <Text
              selectable
              className={message.role === 'user' ? 'leading-6 text-white' : 'leading-6 text-ink'}
            >
              {message.text}
            </Text>
          </View>
        ))}
      </View>

      {pendingConfirmation ? (
        <View className="gap-3 rounded-card border border-amber-200 bg-amber-50 p-4">
          <Text className="text-sm font-semibold uppercase tracking-wide text-amber-800">Confirm reminder change</Text>
          <Text selectable className="text-lg font-bold text-ink">{planConfirmationLabel(pendingConfirmation)}</Text>
          <Text selectable className="text-sm font-medium text-ink">{planConfirmationDetails(pendingConfirmation)}</Text>
          <Text className="text-sm leading-5 text-muted">This changes app reminders only. It does not change the medication instructions you recorded.</Text>
          <View className="flex-row gap-3">
            <Pressable
              disabled={isBusy || voice.isRecording}
              onPress={cancelPendingAction}
              className="flex-1 items-center rounded-2xl bg-white px-4 py-3 disabled:opacity-40"
            >
              <Text className="font-semibold text-ink">Cancel</Text>
            </Pressable>
            <Pressable
              disabled={isBusy || voice.isRecording}
              onPress={() => void confirmPendingAction()}
              className="flex-1 items-center rounded-2xl bg-brand px-4 py-3 disabled:opacity-40"
            >
              <Text className="font-semibold text-white">Confirm</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {error ? (
        <View className="rounded-2xl bg-red-50 p-4">
          <Text selectable className="text-sm leading-5 text-red-800">{error}</Text>
        </View>
      ) : null}

      <View className="flex-row flex-wrap gap-2">
        {quickActions.map((action) => (
          <Pressable
            key={action}
            disabled={isBusy || voice.isRecording}
            onPress={() => void sendMessage(action)}
            className="rounded-full bg-white px-4 py-2 disabled:opacity-40"
          >
            <Text className="text-sm font-semibold text-ink">{action}</Text>
          </Pressable>
        ))}
      </View>

      <View className="gap-3 rounded-card bg-white p-4">
        <TextInput
          value={input}
          onChangeText={setInput}
          editable={!isBusy && !voice.isRecording}
          placeholder="Tell me: I took it, remind me in 30 minutes, pause my reminders…"
          multiline
          className="min-h-24 rounded-2xl bg-canvas px-4 py-3 text-base text-ink"
          textAlignVertical="top"
        />

        <View className="flex-row gap-3">
          <Pressable
            disabled={isSending || voice.isTranscribing}
            onPress={() => void toggleVoice()}
            className={`flex-1 items-center rounded-2xl px-4 py-3 disabled:opacity-40 ${voice.isRecording ? 'bg-red-50' : 'bg-canvas'}`}
          >
            <Text className="font-semibold text-ink">
              {voice.isRecording
                ? `Stop · ${voice.recordingSeconds}s`
                : voice.isTranscribing
                  ? 'Transcribing…'
                  : '🎙️ Speak'}
            </Text>
          </Pressable>

          <Pressable
            disabled={!input.trim() || isBusy || voice.isRecording}
            onPress={() => void sendMessage(input)}
            className="flex-1 items-center rounded-2xl bg-brand px-4 py-3 disabled:opacity-40"
          >
            <Text className="font-semibold text-white">{isSending ? 'Working…' : 'Send'}</Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}
