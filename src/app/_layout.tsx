import '../../global.css';

import * as Notifications from 'expo-notifications';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Text, View } from 'react-native';

import { initializeDatabaseAsync } from '@/db/client';
import { markDoseTaken, skipDose, snoozeDose } from '@/domain/dose-actions';
import { getDoseById } from '@/domain/dose-queries';
import {
  cancelDoseNotifications,
  replenishLocalReminderWindow,
  snoozeDoseNotification
} from '@/services/local-reminder-window';
import { configureMedicationNotifications, getDoseNotificationAction } from '@/services/notifications';

const handledNotificationResponses = new Set<string>();

async function handleMedicationNotificationResponse(response: Notifications.NotificationResponse) {
  const parsed = getDoseNotificationAction(response);
  if (!parsed) return;

  const responseKey = `${response.notification.request.identifier}:${parsed.action}`;
  if (handledNotificationResponses.has(responseKey)) return;
  handledNotificationResponses.add(responseKey);

  try {
    if (parsed.action === 'TAKEN') {
      const changed = markDoseTaken(parsed.doseId, 'button');
      if (changed) await cancelDoseNotifications(parsed.doseId);
      return;
    }

    if (parsed.action === 'SKIP') {
      const changed = skipDose(parsed.doseId, 'button');
      if (changed) await cancelDoseNotifications(parsed.doseId);
      return;
    }

    const dose = getDoseById(parsed.doseId);
    if (!dose) return;

    const until = new Date(Date.now() + 15 * 60_000);
    const changed = snoozeDose(parsed.doseId, until, 'button');
    if (!changed) return;

    await snoozeDoseNotification(dose, until);
  } finally {
    await Notifications.clearLastNotificationResponseAsync().catch(() => undefined);
    void replenishLocalReminderWindow();
  }
}

export default function RootLayout() {
  const [databaseState, setDatabaseState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [databaseError, setDatabaseError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    void initializeDatabaseAsync()
      .then(() => {
        if (active) setDatabaseState('ready');
      })
      .catch((error: unknown) => {
        console.error('Database initialization failed', error);
        if (!active) return;
        setDatabaseError(error instanceof Error ? error.message : 'Unknown database error');
        setDatabaseState('error');
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (databaseState !== 'ready' || Platform.OS === 'web') return;

    void configureMedicationNotifications();
    void replenishLocalReminderWindow();

    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      void handleMedicationNotificationResponse(response);
    });

    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) void handleMedicationNotificationResponse(response);
    });

    return () => subscription.remove();
  }, [databaseState]);

  if (databaseState === 'loading') {
    return (
      <View className="flex-1 items-center justify-center gap-3 bg-white px-6">
        <ActivityIndicator />
        <Text className="text-sm text-slate-600">Preparing your medication data…</Text>
      </View>
    );
  }

  if (databaseState === 'error') {
    return (
      <View className="flex-1 items-center justify-center gap-3 bg-white px-6">
        <Text className="text-lg font-semibold text-slate-900">Could not open local medication data</Text>
        <Text className="text-center text-sm text-slate-600">{databaseError}</Text>
      </View>
    );
  }

  return (
    <>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerBackTitle: 'Back' }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="history" options={{ title: 'History' }} />
        <Stack.Screen name="settings" options={{ title: 'Settings' }} />
      </Stack>
    </>
  );
}
