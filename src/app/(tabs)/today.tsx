import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { markDoseTaken, skipDose, snoozeDose } from '@/domain/dose-actions';
import { getTodayDoses, getUpcomingPendingDoses, type DoseRow } from '@/domain/dose-queries';
import {
  cancelDoseNotifications,
  replenishLocalReminderWindow,
  snoozeDoseNotification
} from '@/services/local-reminder-window';

function formatDoseTime(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(timestamp));
}

function statusLabel(dose: DoseRow, now: number) {
  if (dose.status === 'taken') return 'Taken';
  if (dose.status === 'skipped') return 'Skipped';
  if (dose.status === 'missed') return 'Missed';
  if (dose.snoozedUntil && dose.snoozedUntil > now) {
    return `Snoozed to ${formatDoseTime(dose.snoozedUntil)}`;
  }
  return 'Pending';
}

export default function TodayScreen() {
  const [today, setToday] = useState<DoseRow[]>([]);
  const [upcoming, setUpcoming] = useState<DoseRow[]>([]);
  const [now, setNow] = useState(0);

  const refresh = useCallback(() => {
    setNow(Date.now());
    setToday(getTodayDoses());
    setUpcoming(getUpcomingPendingDoses(5));
  }, []);

  useFocusEffect(useCallback(() => {
    void replenishLocalReminderWindow().finally(refresh);
  }, [refresh]));

  const nextDose = upcoming[0] ?? today.find((dose) => dose.status === 'pending') ?? null;
  const nextDoseTime = nextDose?.snoozedUntil && nextDose.snoozedUntil > now
    ? nextDose.snoozedUntil
    : nextDose?.dueAt;

  async function take(doseId: string) {
    const changed = markDoseTaken(doseId, 'button');
    if (changed) await cancelDoseNotifications(doseId);
    refresh();
  }

  async function skip(doseId: string) {
    const changed = skipDose(doseId, 'button');
    if (changed) await cancelDoseNotifications(doseId);
    refresh();
  }

  async function snooze(dose: DoseRow) {
    const until = new Date(Date.now() + 15 * 60_000);
    const changed = snoozeDose(dose.doseId, until, 'button');
    if (!changed) {
      refresh();
      return;
    }

    await snoozeDoseNotification(dose, until).catch(() => undefined);
    refresh();
  }

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      className="flex-1 bg-canvas"
      contentContainerClassName="gap-6 px-5 pb-10 pt-4"
    >
      <View className="flex-row items-center justify-between gap-4">
        <View className="flex-1">
          <Text className="text-3xl font-bold text-ink">Today</Text>
          <Text className="mt-1 text-muted">Your local medication timeline.</Text>
        </View>
        <Link href="/settings" asChild>
          <Pressable className="rounded-full bg-white px-4 py-2">
            <Text className="font-semibold text-ink">Settings</Text>
          </Pressable>
        </Link>
      </View>

      <View className="gap-3 rounded-card bg-white p-5">
        <Text className="text-sm font-semibold uppercase tracking-wide text-muted">Next dose</Text>
        {nextDose ? (
          <>
            <Text selectable className="text-2xl font-bold text-ink">{nextDose.medicationName}</Text>
            <Text className="text-base text-muted">
              {[nextDose.strength, nextDose.doseAmount].filter(Boolean).join(' · ') || 'Dose details saved'}
            </Text>
            {nextDoseTime ? <Text className="text-lg font-semibold text-brand">{formatDoseTime(nextDoseTime)}</Text> : null}
            {nextDose.status === 'pending' ? (
              <View className="mt-2 flex-row gap-2">
                <Pressable onPress={() => void take(nextDose.doseId)} className="flex-1 items-center rounded-2xl bg-brand px-3 py-3">
                  <Text className="font-semibold text-white">Taken</Text>
                </Pressable>
                <Pressable onPress={() => void snooze(nextDose)} className="flex-1 items-center rounded-2xl bg-canvas px-3 py-3">
                  <Text className="font-semibold text-ink">Snooze 15m</Text>
                </Pressable>
                <Pressable onPress={() => void skip(nextDose.doseId)} className="items-center rounded-2xl bg-canvas px-3 py-3">
                  <Text className="font-semibold text-ink">Skip</Text>
                </Pressable>
              </View>
            ) : null}
          </>
        ) : (
          <>
            <Text className="text-xl font-bold text-ink">No pending doses</Text>
            <Text className="leading-6 text-muted">Add a medication plan and its next scheduled dose will appear here.</Text>
            <Link href="/onboarding/setup" asChild>
              <Pressable className="mt-2 items-center rounded-2xl bg-brand px-4 py-3">
                <Text className="font-semibold text-white">Add medication</Text>
              </Pressable>
            </Link>
          </>
        )}
      </View>

      <View className="gap-3">
        <Text className="text-lg font-bold text-ink">Today’s doses</Text>
        {today.length ? today.map((dose) => (
          <View key={dose.doseId} className="flex-row items-center justify-between gap-4 rounded-2xl bg-white p-4">
            <View className="flex-1">
              <Text selectable className="font-semibold text-ink">{dose.medicationName}</Text>
              <Text className="mt-1 text-sm text-muted">{formatDoseTime(dose.dueAt)} · {statusLabel(dose, now)}</Text>
            </View>
            {dose.status === 'pending' ? (
              <Pressable onPress={() => void take(dose.doseId)} className="rounded-xl bg-brand/10 px-3 py-2">
                <Text className="font-semibold text-brand">Taken</Text>
              </Pressable>
            ) : null}
          </View>
        )) : (
          <Text className="leading-6 text-muted">Nothing scheduled for the rest of this calendar day yet.</Text>
        )}
      </View>
    </ScrollView>
  );
}
