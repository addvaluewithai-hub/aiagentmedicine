import { and, eq } from 'drizzle-orm';
import * as Notifications from 'expo-notifications';

import { db, initializeDatabase } from '@/db/client';
import { reminderAttempts } from '@/db/schema';
import { generateRollingDoseOccurrences } from '@/domain/dose-generation';
import {
  getDoseById,
  getPendingDosesForReminderWindow,
  type DoseRow
} from '@/domain/dose-queries';
import { createLocalId } from '@/lib/id';
import {
  configureMedicationNotifications,
  ensureMedicationNotificationPermission,
  scheduleDoseReminder,
  type MedicationReminderKind
} from '@/services/notifications';

const ADAPTIVE_REMINDER_POLICY = [
  {
    offsetMinutes: 0,
    kind: 'primary' as const,
    body: 'Did you take it? You can mark it taken, snooze, or skip.'
  },
  {
    offsetMinutes: 15,
    kind: 'followup' as const,
    body: 'Quick check: this dose is still unresolved. Taken, snooze, or skip?'
  },
  {
    offsetMinutes: 45,
    kind: 'followup' as const,
    body: 'One more check: taken, snooze, or skip?'
  }
] as const;

export const MAX_ADAPTIVE_REMINDER_ATTEMPTS = ADAPTIVE_REMINDER_POLICY.length;

type AdaptiveReminderCandidate = {
  dose: DoseRow;
  reminderAt: number;
  reminderKind: MedicationReminderKind;
  body: string;
};

type NativeReminderSnapshot = {
  scheduledCount: number;
  medicationKeys: Set<string>;
  legacyPrimaryDoseIds: Set<string>;
};

type ReminderWindowResult = {
  generated: number;
  scheduled: number;
  scheduledPrimary: number;
  scheduledFollowUps: number;
  notificationsAllowed: boolean;
};

let reminderWindowQueue: Promise<void> = Promise.resolve();

function reminderKey(doseId: string, reminderAt: number) {
  return `${doseId}:${reminderAt}`;
}

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

async function getNativeReminderSnapshot(): Promise<NativeReminderSnapshot> {
  const requests = await Notifications.getAllScheduledNotificationsAsync();
  const medicationKeys = new Set<string>();
  const legacyPrimaryDoseIds = new Set<string>();

  for (const request of requests) {
    const doseId = request.content.data?.doseId;
    if (typeof doseId !== 'string') continue;

    const reminderAt = request.content.data?.reminderAt;
    if (typeof reminderAt === 'number' && Number.isFinite(reminderAt)) {
      medicationKeys.add(reminderKey(doseId, reminderAt));
    } else {
      legacyPrimaryDoseIds.add(doseId);
    }
  }

  return {
    scheduledCount: requests.length,
    medicationKeys,
    legacyPrimaryDoseIds
  };
}

export async function scheduleTrackedDoseReminder(input: {
  doseId: string;
  medicationName: string;
  dueAt: Date;
  body: string;
  reminderKind?: MedicationReminderKind;
}) {
  initializeDatabase();
  const identifier = await scheduleDoseReminder({
    doseId: input.doseId,
    title: `Time for ${input.medicationName}`,
    body: input.body,
    dueAt: input.dueAt,
    reminderKind: input.reminderKind
  });

  const currentDose = getDoseById(input.doseId);
  if (!currentDose || currentDose.status !== 'pending') {
    await Notifications.cancelScheduledNotificationAsync(identifier).catch(() => undefined);
    throw new Error('dose-no-longer-pending');
  }

  try {
    db.insert(reminderAttempts).values({
      id: createLocalId('reminder-attempt'),
      doseOccurrenceId: input.doseId,
      attemptNumber: nextAttemptNumber(input.doseId),
      scheduledAt: input.dueAt.getTime(),
      message: input.body,
      deliveryStatus: 'scheduled',
      notificationIdentifier: identifier
    }).run();
  } catch (cause) {
    await Notifications.cancelScheduledNotificationAsync(identifier).catch(() => undefined);
    throw cause;
  }

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

function buildAdaptiveReminderCandidates(doses: DoseRow[], now: number) {
  const eligibleDoses = doses.filter((dose) => !(dose.snoozedUntil && dose.snoozedUntil > now));

  const primary: AdaptiveReminderCandidate[] = [];
  const followUps: AdaptiveReminderCandidate[] = [];

  for (const dose of eligibleDoses) {
    for (const policy of ADAPTIVE_REMINDER_POLICY) {
      const reminderAt = dose.dueAt + policy.offsetMinutes * 60_000;
      if (reminderAt <= now) continue;

      const candidate: AdaptiveReminderCandidate = {
        dose,
        reminderAt,
        reminderKind: policy.kind,
        body: policy.body
      };

      if (policy.kind === 'primary') {
        primary.push(candidate);
      } else {
        followUps.push(candidate);
      }
    }
  }

  primary.sort((a, b) => a.reminderAt - b.reminderAt);
  followUps.sort((a, b) => a.reminderAt - b.reminderAt);
  return { primary, followUps };
}

async function replenishLocalReminderWindowInternal(input?: {
  requestPermission?: boolean;
  horizonDays?: number;
  maxScheduled?: number;
}): Promise<ReminderWindowResult> {
  initializeDatabase();
  const horizonDays = Math.min(Math.max(input?.horizonDays ?? 7, 1), 14);
  const maxScheduled = Math.min(Math.max(input?.maxScheduled ?? 48, 1), 50);

  const generated = generateRollingDoseOccurrences({ horizonDays, maxNew: 150 });
  await configureMedicationNotifications();

  const notificationsAllowed = input?.requestPermission
    ? await ensureMedicationNotificationPermission()
    : await hasNotificationPermission();

  if (!notificationsAllowed) {
    return {
      generated: generated.length,
      scheduled: 0,
      scheduledPrimary: 0,
      scheduledFollowUps: 0,
      notificationsAllowed: false
    };
  }

  const now = Date.now();
  const native = await getNativeReminderSnapshot();
  let availableSlots = Math.max(0, maxScheduled - native.scheduledCount);

  if (!availableSlots) {
    return {
      generated: generated.length,
      scheduled: 0,
      scheduledPrimary: 0,
      scheduledFollowUps: 0,
      notificationsAllowed: true
    };
  }

  const doses = getPendingDosesForReminderWindow({
    now,
    horizonDays,
    overdueMinutes: 90,
    limit: 150
  });
  const candidates = buildAdaptiveReminderCandidates(doses, now);
  let scheduledPrimary = 0;
  let scheduledFollowUps = 0;

  async function scheduleCandidate(candidate: AdaptiveReminderCandidate) {
    if (!availableSlots) return;

    const key = reminderKey(candidate.dose.doseId, candidate.reminderAt);
    if (native.medicationKeys.has(key)) return;
    if (
      candidate.reminderKind === 'primary' &&
      native.legacyPrimaryDoseIds.has(candidate.dose.doseId)
    ) {
      return;
    }

    try {
      await scheduleTrackedDoseReminder({
        doseId: candidate.dose.doseId,
        medicationName: candidate.dose.medicationName,
        dueAt: new Date(candidate.reminderAt),
        body: candidate.body,
        reminderKind: candidate.reminderKind
      });
      native.medicationKeys.add(key);
      availableSlots -= 1;
      if (candidate.reminderKind === 'primary') {
        scheduledPrimary += 1;
      } else {
        scheduledFollowUps += 1;
      }
    } catch {
      // A later app open retries reminder instances missing from the native scheduler.
    }
  }

  for (const candidate of candidates.primary) {
    if (!availableSlots) break;
    await scheduleCandidate(candidate);
  }

  for (const candidate of candidates.followUps) {
    if (!availableSlots) break;
    await scheduleCandidate(candidate);
  }

  return {
    generated: generated.length,
    scheduled: scheduledPrimary + scheduledFollowUps,
    scheduledPrimary,
    scheduledFollowUps,
    notificationsAllowed: true
  };
}

export function replenishLocalReminderWindow(input?: {
  requestPermission?: boolean;
  horizonDays?: number;
  maxScheduled?: number;
}) {
  const task = reminderWindowQueue.then(() => replenishLocalReminderWindowInternal(input));
  reminderWindowQueue = task.then(
    () => undefined,
    () => undefined
  );
  return task;
}

export async function snoozeDoseNotification(dose: DoseRow, until: Date) {
  await cancelDoseNotifications(dose.doseId);
  return scheduleTrackedDoseReminder({
    doseId: dose.doseId,
    medicationName: dose.medicationName,
    dueAt: until,
    body: 'You snoozed this dose. Taken, snooze, or skip?',
    reminderKind: 'snooze'
  });
}
