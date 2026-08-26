import { z } from 'zod';

export const AgentDoseContextSchema = z.object({
  doseId: z.string().min(1).max(160),
  dueAt: z.number().int().positive(),
  snoozedUntil: z.number().int().positive().nullable(),
  medicationName: z.string().trim().min(1).max(240),
  strength: z.string().trim().max(240).nullable(),
  doseAmount: z.string().trim().max(240).nullable()
});

export const AgentMedicationPlanContextSchema = z.object({
  planId: z.string().min(1).max(160),
  medicationName: z.string().trim().min(1).max(240),
  strength: z.string().trim().max(240).nullable(),
  status: z.enum(['active', 'paused', 'ended']),
  reminderTimes: z.array(z.string().trim().min(1).max(20)).max(16)
});

export const AgentHistoryMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  text: z.string().trim().min(1).max(1_000)
});

const MarkTakenToolSchema = z.object({
  name: z.literal('mark_dose_taken'),
  doseId: z.string().min(1).max(160)
});

const SnoozeToolSchema = z.object({
  name: z.literal('snooze_dose'),
  doseId: z.string().min(1).max(160),
  minutes: z.number().int().min(1).max(240)
});

const SkipToolSchema = z.object({
  name: z.literal('skip_dose'),
  doseId: z.string().min(1).max(160)
});

const PauseMedicationPlanToolSchema = z.object({
  name: z.literal('pause_medication_plan'),
  planId: z.string().min(1).max(160)
});

const ResumeMedicationPlanToolSchema = z.object({
  name: z.literal('resume_medication_plan'),
  planId: z.string().min(1).max(160)
});

export const AgentDoseToolCallSchema = z.discriminatedUnion('name', [
  MarkTakenToolSchema,
  SnoozeToolSchema,
  SkipToolSchema
]);

export const AgentPlanToolCallSchema = z.discriminatedUnion('name', [
  PauseMedicationPlanToolSchema,
  ResumeMedicationPlanToolSchema
]);

export const AgentToolCallSchema = z.discriminatedUnion('name', [
  MarkTakenToolSchema,
  SnoozeToolSchema,
  SkipToolSchema,
  PauseMedicationPlanToolSchema,
  ResumeMedicationPlanToolSchema
]);

export const AgentPendingConfirmationSchema = z.discriminatedUnion('name', [
  z.object({
    name: z.literal('pause_medication_plan'),
    planId: z.string().min(1).max(160),
    medicationName: z.string().trim().min(1).max(240)
  }),
  z.object({
    name: z.literal('resume_medication_plan'),
    planId: z.string().min(1).max(160),
    medicationName: z.string().trim().min(1).max(240)
  })
]);

export const AgentDoseResponseSchema = z.object({
  assistantMessage: z.string().trim().min(1).max(600),
  toolCall: AgentToolCallSchema.nullable(),
  pendingConfirmation: AgentPendingConfirmationSchema.nullable().default(null)
});

export type AgentDoseContext = z.infer<typeof AgentDoseContextSchema>;
export type AgentMedicationPlanContext = z.infer<typeof AgentMedicationPlanContextSchema>;
export type AgentHistoryMessage = z.infer<typeof AgentHistoryMessageSchema>;
export type AgentDoseToolCall = z.infer<typeof AgentDoseToolCallSchema>;
export type AgentPlanToolCall = z.infer<typeof AgentPlanToolCallSchema>;
export type AgentToolCall = z.infer<typeof AgentToolCallSchema>;
export type AgentPendingConfirmation = z.infer<typeof AgentPendingConfirmationSchema>;
export type AgentDoseResponse = z.infer<typeof AgentDoseResponseSchema>;
