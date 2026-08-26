import type {
  AgentPendingConfirmation,
  AgentPlanToolCall
} from '@/agent/agent-dose-action-schema';
import {
  pauseMedicationPlanReminders,
  resumeMedicationPlanReminders
} from '@/services/medication-plan-lifecycle';

export type AgentPlanExecutionResult =
  | { ok: true; notificationWarning: boolean }
  | { ok: false; reason: 'plan-no-longer-active' | 'plan-no-longer-paused' };

export async function executePlanAgentTool(
  action: AgentPlanToolCall | AgentPendingConfirmation
): Promise<AgentPlanExecutionResult> {
  if (action.name === 'pause_medication_plan') {
    const result = await pauseMedicationPlanReminders(action.planId, 'agent');
    if (!result.changed) return { ok: false, reason: 'plan-no-longer-active' };
    return { ok: true, notificationWarning: result.notificationCleanupFailed };
  }

  const result = await resumeMedicationPlanReminders(action.planId, 'agent');
  if (!result.changed) return { ok: false, reason: 'plan-no-longer-paused' };
  return { ok: true, notificationWarning: result.reminderRefreshFailed };
}
