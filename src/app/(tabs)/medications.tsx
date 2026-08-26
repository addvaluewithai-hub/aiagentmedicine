import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';

import {
  getMedicationPlanSummaries,
  type MedicationPlanSummary
} from '@/domain/medication-management';
import {
  pauseMedicationPlanReminders,
  resumeMedicationPlanReminders
} from '@/services/medication-plan-lifecycle';

const DAY_LABELS: Record<string, string> = {
  sun: 'Sun',
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Sat'
};

function scheduleLabel(plan: MedicationPlanSummary) {
  const days = plan.scheduleDays === null
    ? 'Every day'
    : plan.scheduleDays.length
      ? plan.scheduleDays.map((day) => DAY_LABELS[day] ?? day).join(', ')
      : 'Schedule unavailable';
  const times = plan.reminderTimes.length ? plan.reminderTimes.join(', ') : 'No reminder times';
  return `${days} · ${times}`;
}

export default function MedicationsScreen() {
  const [plans, setPlans] = useState<MedicationPlanSummary[]>([]);
  const [pendingPlanId, setPendingPlanId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setPlans(getMedicationPlanSummaries());
  }, []);

  useFocusEffect(useCallback(() => {
    refresh();
  }, [refresh]));

  async function performPause(plan: MedicationPlanSummary) {
    setPendingPlanId(plan.planId);
    setNotice(null);
    try {
      const result = await pauseMedicationPlanReminders(plan.planId);
      if (!result.changed) {
        setNotice('That medication plan changed before it could be paused. The list has been refreshed.');
      } else if (result.notificationCleanupFailed) {
        setNotice('The plan is paused. One or more old system notifications could not be removed, but they cannot change the paused plan.');
      } else {
        setNotice(`${plan.medicationName} reminders are paused. Past dose history is unchanged.`);
      }
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : 'unknown-error';
      setNotice(`I could not pause that plan (${detail}).`);
    } finally {
      refresh();
      setPendingPlanId(null);
    }
  }

  function confirmPause(plan: MedicationPlanSummary) {
    Alert.alert(
      'Pause reminders?',
      `Future reminders for ${plan.medicationName} will stop until you resume them. Past dose history will stay unchanged.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Pause reminders', style: 'destructive', onPress: () => void performPause(plan) }
      ]
    );
  }

  async function resume(plan: MedicationPlanSummary) {
    setPendingPlanId(plan.planId);
    setNotice(null);
    try {
      const result = await resumeMedicationPlanReminders(plan.planId);
      if (!result.changed) {
        setNotice('That medication plan changed before it could be resumed. The list has been refreshed.');
      } else if (result.reminderRefreshFailed) {
        setNotice('The plan is active again, but local notifications could not be refreshed yet. The app will retry on the next open.');
      } else {
        setNotice(`${plan.medicationName} reminders are active again.`);
      }
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : 'unknown-error';
      setNotice(`I could not resume that plan (${detail}).`);
    } finally {
      refresh();
      setPendingPlanId(null);
    }
  }

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      className="flex-1 bg-canvas"
      contentContainerClassName="gap-5 px-5 pb-10 pt-4"
    >
      <View className="gap-1">
        <Text className="text-3xl font-bold text-ink">Medications</Text>
        <Text className="text-muted">Your confirmed local medication plans and reminder schedules.</Text>
      </View>

      {notice ? (
        <View className="rounded-2xl bg-white p-4">
          <Text selectable className="text-sm leading-5 text-ink">{notice}</Text>
        </View>
      ) : null}

      <View className="gap-3">
        {plans.length ? plans.map((plan) => {
          const busy = pendingPlanId === plan.planId;
          const isActive = plan.status === 'active';
          const isPaused = plan.status === 'paused';

          return (
            <View key={plan.planId} className="gap-3 rounded-card bg-white p-5">
              <View className="flex-row items-start justify-between gap-3">
                <View className="flex-1 gap-1">
                  <Text selectable className="text-xl font-bold text-ink">{plan.medicationName}</Text>
                  <Text selectable className="text-muted">
                    {[plan.strength, plan.doseAmount].filter(Boolean).join(' · ') || 'Dose details saved'}
                  </Text>
                </View>
                <View className={isActive ? 'rounded-full bg-green-50 px-3 py-1' : isPaused ? 'rounded-full bg-amber-50 px-3 py-1' : 'rounded-full bg-canvas px-3 py-1'}>
                  <Text className={isActive ? 'text-xs font-semibold text-green-700' : isPaused ? 'text-xs font-semibold text-amber-700' : 'text-xs font-semibold text-muted'}>
                    {isActive ? 'Active' : isPaused ? 'Paused' : 'Ended'}
                  </Text>
                </View>
              </View>

              {plan.frequency ? <Text selectable className="leading-5 text-muted">{plan.frequency}</Text> : null}
              <Text selectable className="text-sm leading-5 text-muted">{scheduleLabel(plan)}</Text>

              {isActive ? (
                <Pressable
                  disabled={busy || pendingPlanId !== null}
                  onPress={() => confirmPause(plan)}
                  className="items-center rounded-2xl bg-canvas px-4 py-3 disabled:opacity-40"
                >
                  <Text className="font-semibold text-ink">{busy ? 'Pausing…' : 'Pause reminders'}</Text>
                </Pressable>
              ) : null}

              {isPaused ? (
                <Pressable
                  disabled={busy || pendingPlanId !== null}
                  onPress={() => void resume(plan)}
                  className="items-center rounded-2xl bg-brand px-4 py-3 disabled:opacity-40"
                >
                  <Text className="font-semibold text-white">{busy ? 'Resuming…' : 'Resume reminders'}</Text>
                </Pressable>
              ) : null}
            </View>
          );
        }) : (
          <View className="gap-2 rounded-card bg-white p-5">
            <Text className="text-xl font-bold text-ink">No medication plans yet</Text>
            <Text className="leading-6 text-muted">Show or tell the assistant about a medication and it will build the plan with you.</Text>
          </View>
        )}
      </View>

      <Link href="/onboarding/setup" asChild>
        <Pressable disabled={pendingPlanId !== null} className="items-center rounded-2xl border border-brand px-4 py-4 disabled:opacity-40">
          <Text className="font-semibold text-brand">Add medication with AI</Text>
        </Pressable>
      </Link>
    </ScrollView>
  );
}
