import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';

import { correctDoseToPending } from '@/domain/dose-actions';
import { getDoseHistory, type DoseHistoryRow } from '@/domain/dose-queries';
import { replenishLocalReminderWindow } from '@/services/local-reminder-window';

function formatDateTime(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(timestamp));
}

function statusLabel(status: DoseHistoryRow['status']) {
  if (status === 'taken') return 'Taken';
  if (status === 'skipped') return 'Skipped';
  if (status === 'missed') return 'Missed';
  return 'Pending';
}

function resolutionText(dose: DoseHistoryRow) {
  if (dose.status === 'taken' && dose.takenAt) {
    return `Reported taken ${formatDateTime(dose.takenAt)}`;
  }
  if (dose.status === 'skipped' && dose.skippedAt) {
    return `Skipped ${formatDateTime(dose.skippedAt)}`;
  }
  if (dose.status === 'pending' && dose.snoozedUntil) {
    return `Snoozed until ${formatDateTime(dose.snoozedUntil)}`;
  }
  return null;
}

export default function HistoryScreen() {
  const [doses, setDoses] = useState<DoseHistoryRow[]>([]);

  const refresh = useCallback(() => {
    setDoses(getDoseHistory());
  }, []);

  useFocusEffect(useCallback(() => {
    refresh();
  }, [refresh]));

  async function correct(dose: DoseHistoryRow) {
    const changed = correctDoseToPending(dose.doseId, 'button');
    if (!changed) {
      refresh();
      return;
    }

    await replenishLocalReminderWindow().catch(() => undefined);
    refresh();
  }

  function confirmCorrection(dose: DoseHistoryRow) {
    Alert.alert(
      'Correct dose record?',
      `Return this ${dose.medicationName} record from ${statusLabel(dose.status)} to Pending? This changes the app record only and does not make a medication decision.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Correct record', onPress: () => void correct(dose) }
      ]
    );
  }

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      className="flex-1 bg-canvas"
      contentContainerClassName="gap-5 px-5 pb-10 pt-4"
    >
      <View className="gap-2">
        <Text className="text-3xl font-bold text-ink">History</Text>
        <Text className="leading-6 text-muted">Recent local dose records. Corrections append an audit event instead of deleting history.</Text>
      </View>

      {doses.length ? doses.map((dose) => {
        const canCorrect = dose.status === 'taken' || dose.status === 'skipped';
        const resolution = resolutionText(dose);
        return (
          <View key={dose.doseId} className="gap-3 rounded-card bg-white p-4">
            <View className="flex-row items-start justify-between gap-4">
              <View className="flex-1 gap-1">
                <Text selectable className="text-lg font-bold text-ink">{dose.medicationName}</Text>
                <Text selectable className="text-sm text-muted">
                  {[dose.strength, dose.doseAmount].filter(Boolean).join(' · ') || 'Dose details saved'}
                </Text>
              </View>
              <Text className="text-sm font-semibold text-brand">{statusLabel(dose.status)}</Text>
            </View>

            <View className="gap-1">
              <Text selectable className="text-sm text-muted">Due {formatDateTime(dose.dueAt)}</Text>
              {resolution ? <Text selectable className="text-sm text-muted">{resolution}</Text> : null}
              {dose.resolutionSource ? (
                <Text selectable className="text-xs text-muted">Source: {dose.resolutionSource}</Text>
              ) : null}
            </View>

            {canCorrect ? (
              <Pressable
                onPress={() => confirmCorrection(dose)}
                className="items-center rounded-2xl bg-canvas px-4 py-3"
              >
                <Text className="font-semibold text-ink">Correct record</Text>
              </Pressable>
            ) : null}
          </View>
        );
      }) : (
        <View className="rounded-card bg-white p-5">
          <Text className="text-lg font-bold text-ink">No dose history yet</Text>
          <Text className="mt-2 leading-6 text-muted">Dose records will appear here after reminders are scheduled and resolved.</Text>
        </View>
      )}
    </ScrollView>
  );
}
