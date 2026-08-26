import { and, eq } from 'drizzle-orm';
import * as Notifications from 'expo-notifications';

import { db, initializeDatabase } from '@/db/client';
import { reminderAttempts } from '@/db/schema';
import { generateRollingDoseOccurrences } from '@/domain/dose-generation';
import { getUpcomingPendingDoses, type DoseRow } from '@/domain/dose-queries';
import { createLocalId } from '@/lib/id';
import {
  configureMedicationNotifications,
  ensureMedicationNotificationPermission,
  scheduleDoseReminder
} from '@/services/notifications';

function nextAttemptNumber(doseId: string) {
  const attempts = db.select({ attemptNumber: reminderAttempts.attemptNumber })
    .from(reminderAttempts)
    .where(eq(reminderAttempts.doseOccurrenceId, doseId))
    .all();
  return attempts.reduce((highest, attempt) => Math.max(highest, attempt.attemptNumber), 0) + 1;
}

async function hasNotificationPermission() {
  const permission = await Notifications.getPermissionsAsync();
  return permission.granted;
}

async function getNativeScheduledDoseIds() {
  const requests = await Notifications.getAllScheduledNotificationsAsync();
  const ids = new Set<string>();
  for (const request of requests) {
    const doseId = request.content.data?.doseId;
    if (typeof doseId === 'string') ids.add(doseId);
  }
  return ids;
}

export async function scheduleTrackedDoseReminder(input: {
  doseId: string;
  medicationName: string;
  dueAt: Date;
  body: string;
}) {
  initializeDatabase();
  const identifier = await scheduleDoseReminder({
    doseId: input.doseId,
    title: `Time for ${input.medicationName}`,
    body: input.body,
    dueAt: input.dueAt
  });

  db.insert(reminderAttempts).values({
    id: createLocalId('reminder-attempt'),
    doseOccurrenceId: input.doseId,
    attemptNumber: nextAttemptNumber(input.doseId),
    scheduledAt: input.dueAt.getTime(),
    message: input.body,
    deliveryStatus: 'scheduled',
    notificationIdentifier: identifier
  }).run();

  return identifier;
}

export async function cancelDoseNotifications(doseId: string) {
  initializeDatabase();
  const [scheduled, presented] = await Promise.all([
    Notifications.getAllScheduledNotificationsAsync(),
    Notifications.getPresentedNotificationsAsync()
  ]);

  const scheduledMatches = scheduled.filter((request) => request.content.data?.doseId === doseId);
  const presentedMatches = presented.filter((notification) => notification.request.content.data?.doseId === doseId);

  await Promise.allSettled([
    ...scheduledMatches.map((request) => Notifications.cancelScheduledNotificationAsync(request.identifier)),
    ...presentedMatches.map((notification) => Notifications.dismissNotificationAsync(notification.request.identifier))
  ]);

  db.update(reminderAttempts)
    .set({ deliveryStatus: 'cancelled' })
    .where(and(
      eq(reminderAttempts.doseOccurrenceId, doseId),
      eq(reminderAttempts.deliveryStatus, 'scheduled')
    ))
    .run();
}

export async function replenishLocalReminderWindow(input?: {
  requestPermission?: boolean;
  horizonDays?: number;
  maxScheduled?: number;
}) {
  initializeDatabase();
  const horizonDays = Math.min(Math.max(input?.horizonDays ?? 7, 1), 14);
  const maxScheduled = Math.min(Math.max(input?.maxScheduled ?? 40, 1), 50);

  const generated = generateRollingDoseOccurrences({ horizonDays, maxNew: 150 });
  await configureMedicationNotifications();

  const notificationsAllowed = input?.requestPermission
    ? await ensureMedicationNotificationPermission()
    : await hasNotificationPermission();

  if (!notificationsAllowed) {
    return { generated: generated.length, scheduled: 0, notificationsAllowed: false };
  }

  const nativeDoseIds = await getNativeScheduledDoseIds();
  const doses = getUpcomingPendingDoses(maxScheduled);
  let scheduled = 0;

  for (const dose of doses) {
    if (nativeDoseIds.has(dose.doseId)) continue;

    try {
      await scheduleTrackedDoseReminder({
        doseId: dose.doseId,
        medicationName: dose.medicationName,
        dueAt: new Date(dose.dueAt),
        body: 'Did you take it? You can mark it taken, snooze, or skip.'
      });
      nativeDoseIds.add(dose.doseId);
      scheduled += 1;
    } catch {
      // A later app open will retry any dose missing from the native scheduler.
    }
  }

  return { generated: generated.length, scheduled, notificationsAllowed: true };
}

export async function snoozeDoseNotification(dose: DoseRow, until: Date) {
  await cancelDoseNotifications(dose.doseId);
  return scheduleTrackedDoseReminder({
    doseId: dose.doseId,
    medicationName: dose.medicationName,
    dueAt: until,
    body: 'You snoozed this dose. Taken, snooze, or skip?'
  });
}
