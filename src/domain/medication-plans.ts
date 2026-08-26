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

function nextLocalOccurrence(localTime: string, from = new Date()) {
  const [hour, minute] = localTime.split(':').map(Number);
  const candidate = new Date(from);
  candidate.setHours(hour, minute, 0, 0);
  if (candidate.getTime() <= from.getTime()) {
    candidate.setDate(candidate.getDate() + 1);
  }
  return candidate;
}

export function commitMedicationDraft(input: MedicationDraft) {
  initializeDatabase();
  const draft = MedicationDraftSchema.parse(input);
  if (!isMedicationDraftReady(draft)) {
    throw new Error('medication-draft-not-ready');
  }

  const now = Date.now();
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const doseIds: string[] = [];

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
          createdAt: now
        }).run();

        const doseId = createLocalId('dose');
        const dueAt = nextLocalOccurrence(localTime).getTime();
        doseIds.push(doseId);
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
        doseCount: doseIds.length
      }),
      createdAt: now
    }).run();
  });

  return { doseIds };
}
