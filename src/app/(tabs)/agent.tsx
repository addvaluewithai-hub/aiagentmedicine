import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import type { AgentHistoryMessage } from '@/agent/agent-dose-action-schema';
import { executeDoseAgentTool } from '@/agent/execute-dose-tool';
import { getAgentRelevantPendingDoses } from '@/domain/dose-queries';
import { runDoseAgent } from '@/services/ai-gateway';

type ChatMessage = AgentHistoryMessage;

const quickActions = [
  'I took it',
  'Remind me in 30 minutes',
  'Skip this dose'
] as const;

export default function AgentScreen() {
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
    const now = Date.now();
    const doses = getAgentRelevantPendingDoses({ now }).map((dose) => ({
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
        now,
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

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      className="flex-1 bg-canvas"
      contentContainerClassName="gap-5 px-5 pb-10 pt-4"
    >
      <View className="gap-2">
        <Text className="text-3xl font-bold text-ink">Agent</Text>
        <Text className="leading-6 text-muted">Natural language controls the same local dose state as the deterministic buttons. The model never writes to the database directly.</Text>
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
            disabled={isSending}
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
          editable={!isSending}
          placeholder="Tell me: I took it, remind me in 30 minutes…"
          multiline
          className="min-h-24 rounded-2xl bg-canvas px-4 py-3 text-base text-ink"
          textAlignVertical="top"
        />
        <Pressable
          disabled={!input.trim() || isSending}
          onPress={() => void sendMessage(input)}
          className="items-center rounded-2xl bg-brand px-4 py-3 disabled:opacity-40"
        >
          <Text className="font-semibold text-white">{isSending ? 'Working…' : 'Send'}</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
