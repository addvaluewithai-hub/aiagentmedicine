import { z } from 'zod';

const nullableShortText = z.string().trim().max(240).nullable();
const reminderTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const MedicationItemDraftSchema = z.object({
  name: nullableShortText,
  strength: nullableShortText,
  form: nullableShortText,
  route: nullableShortText,
  doseAmount: nullableShortText,
  frequency: nullableShortText,
  mealRelation: nullableShortText,
  timingText: nullableShortText,
  reminderTimes: z.array(reminderTime).max(12).default([]),
  uncertainFields: z.array(z.enum([
    'name',
    'strength',
    'form',
    'route',
    'doseAmount',
    'frequency',
    'mealRelation',
    'timingText',
    'reminderTimes'
  ])).max(9),
  notes: nullableShortText
});

export const MedicationDraftSchema = z.object({
  medications: z.array(MedicationItemDraftSchema).min(1).max(20)
});

export const MedicationExtractionResultSchema = MedicationDraftSchema.extend({
  assistantMessage: z.string().trim().min(1).max(600)
});

export type MedicationItemDraft = z.infer<typeof MedicationItemDraftSchema>;
export type MedicationDraft = z.infer<typeof MedicationDraftSchema>;

const CRITICAL_FIELDS = ['name', 'strength', 'doseAmount', 'frequency'] as const;

export function getMedicationBlockingFields(item: MedicationItemDraft) {
  const blocking = CRITICAL_FIELDS.filter((field) => !item[field] || item.uncertainFields.includes(field));
  if (item.reminderTimes.length === 0 || item.uncertainFields.includes('reminderTimes')) {
    return [...blocking, 'reminderTimes'] as const;
  }
  return blocking;
}

export function isMedicationDraftReady(draft: MedicationDraft) {
  return draft.medications.every((item) => getMedicationBlockingFields(item).length === 0);
}
