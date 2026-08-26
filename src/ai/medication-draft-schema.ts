import { z } from 'zod';

const nullableShortText = z.string().trim().max(240).nullable();
const reminderTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const MedicationWeekdaySchema = z.enum(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']);

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
  scheduleDays: z.array(MedicationWeekdaySchema).max(7).nullable(),
  uncertainFields: z.array(z.enum([
    'name',
    'strength',
    'form',
    'route',
    'doseAmount',
    'frequency',
    'mealRelation',
    'timingText',
    'reminderTimes',
    'scheduleDays'
  ])).max(10),
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
export type MedicationWeekday = z.infer<typeof MedicationWeekdaySchema>;

const CRITICAL_FIELDS = ['name', 'strength', 'doseAmount', 'frequency'] as const;

export function getMedicationBlockingFields(item: MedicationItemDraft) {
  const blocking = CRITICAL_FIELDS.filter((field) => !item[field] || item.uncertainFields.includes(field));
  const scheduleBlocking: ('reminderTimes' | 'scheduleDays')[] = [];

  if (item.reminderTimes.length === 0 || item.uncertainFields.includes('reminderTimes')) {
    scheduleBlocking.push('reminderTimes');
  }
  if (item.scheduleDays?.length === 0 || item.uncertainFields.includes('scheduleDays')) {
    scheduleBlocking.push('scheduleDays');
  }

  return [...blocking, ...scheduleBlocking];
}

export function isMedicationDraftReady(draft: MedicationDraft) {
  return draft.medications.every((item) => getMedicationBlockingFields(item).length === 0);
}
