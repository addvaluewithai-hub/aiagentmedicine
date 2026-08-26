import { useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import type { AgentHistoryMessage } from '@/agent/agent-dose-action-schema';
import { executeDoseAgentTool } from '@/agent/execute-dose-tool';
import { getAgentRelevantPendingDoses } from '@/domain/dose-queries';
import { usePushToTalk } from '@/hooks/use-push-to-talk';
import { runDoseAgent } from '@/services/ai-gateway';

type ChatMessage = AgentHistoryMessage;

const quickActions = [
  'I took it',
  'Remind me in 30 minutes',
  'Skip this dose'
] as const;

export default function AgentScreen() {
  const voice = usePushToTalk();
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      text: 'Tell me what you want to do with your medication reminders. I can mark a dose taken, snooze it, or skip it.'
    }
  ]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

    setMessages((current) => [...current, { role: 'user', text }]);
    setInput('');
    setIsSending(true);
    setError(null);

    try {
      const response = await runDoseAgent({
        text,
        doses,
        history,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
      });

      let assistantText = response.assistantMessage;

      if (response.toolCall) {
        const execution = await executeDoseAgentTool(response.toolCall);
        if (!execution.ok) {
          assistantText = 'That dose changed before I could update it. I refreshed the local state; tell me what you want to do now.';
        } else if (
          response.toolCall.name === 'snooze_dose' &&
          execution.notificationScheduled === false
        ) {
          assistantText += ' The dose is snoozed in the app, but I could not schedule the local notification.';
        }
      }

      setMessages((current) => [...current, { role: 'assistant', text: assistantText }]);
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : 'unknown-error';
      const fallbackText = 'I could not reach the agent right now. Your medication data was not changed. You can still use Taken, Snooze, and Skip from Today.';
      setMessages((current) => [...current, { role: 'assistant', text: fallbackText }]);
      setError(`Agent unavailable (${detail}).`);
    } finally {
      setIsSending(false);
    }
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
        <Text className="leading-6 text-muted">Say or type what happened. The agent can operate your local dose state, while the model never writes to the database directly.</Text>
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
          placeholder="Tell me: I took it, remind me in 30 minutes…"
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
