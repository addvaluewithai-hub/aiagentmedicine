import '../../global.css';

import * as Notifications from 'expo-notifications';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { initializeDatabase } from '@/db/client';
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
  useEffect(() => {
    initializeDatabase();
    void configureMedicationNotifications();
    void replenishLocalReminderWindow();

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
        <Stack.Screen name="history" options={{ title: 'History' }} />
        <Stack.Screen name="settings" options={{ title: 'Settings' }} />
      </Stack>
    </>
  );
}
