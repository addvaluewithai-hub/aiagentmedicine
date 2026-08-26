import type { AgentDoseToolCall } from '@/agent/agent-dose-action-schema';
import { correctDoseToPending, markDoseTaken, skipDose, snoozeDose } from '@/domain/dose-actions';
import { getDoseById } from '@/domain/dose-queries';
import {
  cancelDoseNotifications,
  replenishLocalReminderWindow,
  snoozeDoseNotification
} from '@/services/local-reminder-window';

export type AgentToolExecutionResult =
  | { ok: true; notificationScheduled?: boolean }
  | {
    ok: false;
    reason:
      | 'dose-not-found'
      | 'dose-no-longer-pending'
      | 'dose-not-correctable'
      | 'invalid-snooze';
  };

export async function executeDoseAgentTool(toolCall: AgentDoseToolCall): Promise<AgentToolExecutionResult> {
  const dose = getDoseById(toolCall.doseId);
  if (!dose) return { ok: false, reason: 'dose-not-found' };

  if (toolCall.name === 'correct_dose_to_pending') {
    if (dose.status !== 'taken' && dose.status !== 'skipped') {
      return { ok: false, reason: 'dose-not-correctable' };
    }

    const changed = correctDoseToPending(dose.doseId, 'agent');
    if (!changed) return { ok: false, reason: 'dose-not-correctable' };
    void replenishLocalReminderWindow();
    return { ok: true };
  }

  if (dose.status !== 'pending') return { ok: false, reason: 'dose-no-longer-pending' };

  if (toolCall.name === 'mark_dose_taken') {
    const changed = markDoseTaken(dose.doseId, 'agent');
    if (!changed) return { ok: false, reason: 'dose-no-longer-pending' };
    await cancelDoseNotifications(dose.doseId).catch(() => undefined);
    void replenishLocalReminderWindow();
    return { ok: true };
  }

  if (toolCall.name === 'skip_dose') {
    const changed = skipDose(dose.doseId, 'agent');
    if (!changed) return { ok: false, reason: 'dose-no-longer-pending' };
    await cancelDoseNotifications(dose.doseId).catch(() => undefined);
    void replenishLocalReminderWindow();
    return { ok: true };
  }

  if (!Number.isInteger(toolCall.minutes) || toolCall.minutes < 1 || toolCall.minutes > 240) {
    return { ok: false, reason: 'invalid-snooze' };
  }

  const until = new Date(Date.now() + toolCall.minutes * 60_000);
  const changed = snoozeDose(dose.doseId, until, 'agent');
  if (!changed) return { ok: false, reason: 'dose-no-longer-pending' };

  try {
    await snoozeDoseNotification(dose, until);
    return { ok: true, notificationScheduled: true };
  } catch {
    return { ok: true, notificationScheduled: false };
  }
}
