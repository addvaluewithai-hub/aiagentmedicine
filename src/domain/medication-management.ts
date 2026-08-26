import { and, eq, gt, or } from 'drizzle-orm';

import { db, initializeDatabase } from '@/db/client';
import {
  auditEvents,
  doseOccurrences,
  medicationInstructions,
  medicationPlans,
  medications,
  reminderPlans
} from '@/db/schema';
import { createLocalId } from '@/lib/id';

export type MedicationPlanMutationSource = 'button' | 'agent';

export type MedicationPlanSummary = {
  planId: string;
  medicationId: string;
  medicationName: string;
  strength: string | null;
  doseAmount: string | null;
  frequency: string | null;
  status: 'active' | 'paused' | 'ended';
  reminderTimes: string[];
  scheduleDays: string[] | null;
};

function parseScheduleDays(value: string | null) {
  if (value === null) return null;

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')
      ? parsed
      : [];
  } catch {
    return [];
  }
}

export function getMedicationPlanSummaries(): MedicationPlanSummary[] {
  initializeDatabase();

  const plans = db.select({
    planId: medicationPlans.id,
    medicationId: medications.id,
    medicationName: medications.displayName,
    strength: medications.strengthText,
    doseAmount: medicationInstructions.doseAmountText,
    frequency: medicationInstructions.frequencyText,
    status: medicationPlans.status
  })
    .from(medicationPlans)
    .innerJoin(medications, eq(medicationPlans.medicationId, medications.id))
    .leftJoin(medicationInstructions, eq(medicationPlans.instructionId, medicationInstructions.id))
    .all();

  const reminders = db.select({
    medicationPlanId: reminderPlans.medicationPlanId,
    localTime: reminderPlans.localTime,
    daysOfWeekJson: reminderPlans.daysOfWeekJson
  })
    .from(reminderPlans)
    .all();

  return plans.map((plan) => {
    const planReminders = reminders.filter((reminder) => reminder.medicationPlanId === plan.planId);
    const firstReminder = planReminders[0];

    return {
      ...plan,
      reminderTimes: planReminders.map((reminder) => reminder.localTime).sort(),
      scheduleDays: firstReminder ? parseScheduleDays(firstReminder.daysOfWeekJson) : []
    };
  });
}

export function pauseMedicationPlan(planId: string, source: MedicationPlanMutationSource = 'button') {
  initializeDatabase();
  const plan = db.select({ status: medicationPlans.status })
    .from(medicationPlans)
    .where(eq(medicationPlans.id, planId))
    .get();

  if (!plan || plan.status !== 'active') {
    return { changed: false, removedDoseIds: [] as string[] };
  }

  const now = Date.now();
  const projected = db.select({ id: doseOccurrences.id })
    .from(doseOccurrences)
    .where(and(
      eq(doseOccurrences.medicationPlanId, planId),
      eq(doseOccurrences.status, 'pending'),
      or(
        gt(doseOccurrences.dueAt, now),
        gt(doseOccurrences.snoozedUntil, now)
      )
    ))
    .all();

  db.transaction((tx) => {
    tx.update(medicationPlans)
      .set({ status: 'paused' })
      .where(and(eq(medicationPlans.id, planId), eq(medicationPlans.status, 'active')))
      .run();

    tx.delete(doseOccurrences)
      .where(and(
        eq(doseOccurrences.medicationPlanId, planId),
        eq(doseOccurrences.status, 'pending'),
        or(
          gt(doseOccurrences.dueAt, now),
          gt(doseOccurrences.snoozedUntil, now)
        )
      ))
      .run();

    tx.insert(auditEvents).values({
      id: createLocalId('audit'),
      eventType: 'medication_plan.paused',
      entityType: 'medication_plan',
      entityId: planId,
      payloadJson: JSON.stringify({ source, removedProjectedDoseCount: projected.length }),
      createdAt: now
    }).run();
  });

  return { changed: true, removedDoseIds: projected.map((dose) => dose.id) };
}

export function resumeMedicationPlan(planId: string, source: MedicationPlanMutationSource = 'button') {
  initializeDatabase();
  const plan = db.select({ status: medicationPlans.status })
    .from(medicationPlans)
    .where(eq(medicationPlans.id, planId))
    .get();

  if (!plan || plan.status !== 'paused') return false;

  const now = Date.now();
  db.transaction((tx) => {
    tx.update(medicationPlans)
      .set({ status: 'active' })
      .where(and(eq(medicationPlans.id, planId), eq(medicationPlans.status, 'paused')))
      .run();

    tx.insert(auditEvents).values({
      id: createLocalId('audit'),
      eventType: 'medication_plan.resumed',
      entityType: 'medication_plan',
      entityId: planId,
      payloadJson: JSON.stringify({ source }),
      createdAt: now
    }).run();
  });

  return true;
}
