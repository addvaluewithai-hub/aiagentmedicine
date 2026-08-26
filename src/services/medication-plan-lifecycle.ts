import { pauseMedicationPlan, resumeMedicationPlan } from '@/domain/medication-management';
import { cancelDoseNotifications, replenishLocalReminderWindow } from '@/services/local-reminder-window';

export async function pauseMedicationPlanReminders(planId: string) {
  const result = pauseMedicationPlan(planId);
  if (!result.changed) {
    return { changed: false, notificationCleanupFailed: false };
  }

  const cleanup = await Promise.allSettled(
    result.removedDoseIds.map((doseId) => cancelDoseNotifications(doseId))
  );

  return {
    changed: true,
    notificationCleanupFailed: cleanup.some((item) => item.status === 'rejected')
  };
}

export async function resumeMedicationPlanReminders(planId: string) {
  const changed = resumeMedicationPlan(planId);
  if (!changed) {
    return { changed: false, reminderRefreshFailed: false };
  }

  try {
    await replenishLocalReminderWindow();
    return { changed: true, reminderRefreshFailed: false };
  } catch {
    return { changed: true, reminderRefreshFailed: true };
  }
}
