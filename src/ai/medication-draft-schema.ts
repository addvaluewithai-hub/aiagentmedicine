import { z } from 'zod';

const nullableShortText = z.string().trim().max(240).nullable();

export const MedicationDraftSchema = z.object({
  medications: z.array(z.object({
    name: nullableShortText,
    strength: nullableShortText,
    form: nullableShortText,
    route: nullableShortText,
    doseAmount: nullableShortText,
    frequency: nullableShortText,
    mealRelation: nullableShortText,
    timingText: nullableShortText,
    uncertainFields: z.array(z.enum([
      'name',
      'strength',
      'form',
      'route',
      'doseAmount',
      'frequency',
      'mealRelation',
      'timingText'
    ])).max(8),
    notes: nullableShortText
  })).min(1).max(20)
});

export type MedicationDraft = z.infer<typeof MedicationDraftSchema>;
