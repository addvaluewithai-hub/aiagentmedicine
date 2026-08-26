import '../../global.css';

import * as Notifications from 'expo-notifications';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { initializeDatabase } from '@/db/client';
import { markDoseTaken, skipDose, snoozeDose } from '@/domain/dose-actions';
import {
  configureMedicationNotifications,
  getDoseNotificationAction,
  scheduleDoseReminder
} from '@/services/notifications';

const handledNotificationResponses = new Set<string>();

async function handleMedicationNotificationResponse(response: Notifications.NotificationResponse) {
  const parsed = getDoseNotificationAction(response);
  if (!parsed) return;

  const responseKey = `${response.notification.request.identifier}:${parsed.action}`;
  if (handledNotificationResponses.has(responseKey)) return;
  handledNotificationResponses.add(responseKey);

  try {
    if (parsed.action === 'TAKEN') {
      markDoseTaken(parsed.doseId, 'button');
      return;
    }

    if (parsed.action === 'SKIP') {
      skipDose(parsed.doseId, 'button');
      return;
    }

    const until = new Date(Date.now() + 15 * 60_000);
    snoozeDose(parsed.doseId, until, 'button');
    await scheduleDoseReminder({
      doseId: parsed.doseId,
      title: 'Medication reminder',
      body: 'You snoozed this dose for 15 minutes. Taken, snooze, or skip?',
      dueAt: until
    });
  } finally {
    await Notifications.clearLastNotificationResponseAsync().catch(() => undefined);
  }
}

export default function RootLayout() {
  useEffect(() => {
    initializeDatabase();
    void configureMedicationNotifications();

    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      void handleMedicationNotificationResponse(response);
    });

    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) void handleMedicationNotificationResponse(response);
    });

    return () => subscription.remove();
  }, []);

  return (
    <>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerBackTitle: 'Back' }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="settings" options={{ title: 'Settings' }} />
      </Stack>
    </>
  );
}
