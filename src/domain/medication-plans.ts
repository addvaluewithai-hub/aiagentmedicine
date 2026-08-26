import type { MedicationDraft } from '@/ai/medication-draft-schema';
import { MedicationDraftSchema, isMedicationDraftReady } from '@/ai/medication-draft-schema';
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

function nextLocalOccurrence(localTime: string, scheduleDays: string[] | null, from = new Date()) {
  const [hour, minute] = localTime.split(':').map(Number);
  const weekdayCodes = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

  for (let offset = 0; offset <= 7; offset += 1) {
    const candidate = new Date(from);
    candidate.setDate(candidate.getDate() + offset);
    candidate.setHours(hour, minute, 0, 0);

    if (candidate.getTime() <= from.getTime()) continue;
    if (scheduleDays && !scheduleDays.includes(weekdayCodes[candidate.getDay()])) continue;
    return candidate;
  }

  throw new Error('next-dose-could-not-be-generated');
}

export type CommittedDose = {
  doseId: string;
  medicationName: string;
  dueAt: number;
};

export function commitMedicationDraft(input: MedicationDraft) {
  initializeDatabase();
  const draft = MedicationDraftSchema.parse(input);
  if (!isMedicationDraftReady(draft)) {
    throw new Error('medication-draft-not-ready');
  }

  const now = Date.now();
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const doses: CommittedDose[] = [];

  db.transaction((tx) => {
    for (const item of draft.medications) {
      if (!item.name) throw new Error('medication-name-required');

      const medicationId = createLocalId('med');
      const instructionId = createLocalId('instruction');
      const planId = createLocalId('plan');

      tx.insert(medications).values({
        id: medicationId,
        displayName: item.name,
        strengthText: item.strength,
        formText: item.form,
        routeText: item.route,
        createdAt: now,
        updatedAt: now
      }).run();

      tx.insert(medicationInstructions).values({
        id: instructionId,
        medicationId,
        doseAmountText: item.doseAmount,
        frequencyText: item.frequency,
        mealRelationText: item.mealRelation,
        sourceType: 'user_confirmed_ai_draft',
        createdAt: now
      }).run();

      tx.insert(medicationPlans).values({
        id: planId,
        medicationId,
        instructionId,
        startsAt: now,
        status: 'active',
        createdAt: now
      }).run();

      for (const localTime of [...new Set(item.reminderTimes)].sort()) {
        tx.insert(reminderPlans).values({
          id: createLocalId('reminder'),
          medicationPlanId: planId,
          localTime,
          timezone,
          daysOfWeekJson: item.scheduleDays === null ? null : JSON.stringify(item.scheduleDays),
          createdAt: now
        }).run();

        const doseId = createLocalId('dose');
        const dueAt = nextLocalOccurrence(localTime, item.scheduleDays).getTime();
        doses.push({ doseId, medicationName: item.name, dueAt });
        tx.insert(doseOccurrences).values({
          id: doseId,
          medicationPlanId: planId,
          dueAt,
          status: 'pending',
          createdAt: now,
          updatedAt: now
        }).run();
      }
    }

    tx.insert(auditEvents).values({
      id: createLocalId('audit'),
      eventType: 'medication_plan.confirmed',
      entityType: 'onboarding',
      entityId: createLocalId('confirmation'),
      payloadJson: JSON.stringify({
        medicationCount: draft.medications.length,
        doseCount: doses.length
      }),
      createdAt: now
    }).run();
  });

  return { doses };
}
