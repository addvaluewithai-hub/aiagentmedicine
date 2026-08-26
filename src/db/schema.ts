import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export type DoseStatus = 'pending' | 'taken' | 'skipped' | 'missed';

export const medications = sqliteTable('medications', {
  id: text('id').primaryKey(),
  displayName: text('display_name').notNull(),
  strengthText: text('strength_text'),
  formText: text('form_text'),
  routeText: text('route_text'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull()
});

export const medicationInstructions = sqliteTable('medication_instructions', {
  id: text('id').primaryKey(),
  medicationId: text('medication_id').notNull().references(() => medications.id, { onDelete: 'cascade' }),
  doseAmountText: text('dose_amount_text'),
  frequencyText: text('frequency_text'),
  mealRelationText: text('meal_relation_text'),
  sourceType: text('source_type').notNull(),
  createdAt: integer('created_at').notNull()
}, (table) => [index('instruction_medication_idx').on(table.medicationId)]);

export const medicationPlans = sqliteTable('medication_plans', {
  id: text('id').primaryKey(),
  medicationId: text('medication_id').notNull().references(() => medications.id, { onDelete: 'cascade' }),
  instructionId: text('instruction_id').references(() => medicationInstructions.id),
  startsAt: integer('starts_at').notNull(),
  endsAt: integer('ends_at'),
  status: text('status').$type<'active' | 'paused' | 'ended'>().notNull().default('active'),
  createdAt: integer('created_at').notNull()
});

export const reminderPlans = sqliteTable('reminder_plans', {
  id: text('id').primaryKey(),
  medicationPlanId: text('medication_plan_id').notNull().references(() => medicationPlans.id, { onDelete: 'cascade' }),
  localTime: text('local_time').notNull(),
  timezone: text('timezone').notNull(),
  daysOfWeekJson: text('days_of_week_json'),
  createdAt: integer('created_at').notNull()
});

export const doseOccurrences = sqliteTable('dose_occurrences', {
  id: text('id').primaryKey(),
  medicationPlanId: text('medication_plan_id').notNull().references(() => medicationPlans.id, { onDelete: 'cascade' }),
  dueAt: integer('due_at').notNull(),
  status: text('status').$type<DoseStatus>().notNull().default('pending'),
  takenAt: integer('taken_at'),
  skippedAt: integer('skipped_at'),
  snoozedUntil: integer('snoozed_until'),
  resolutionSource: text('resolution_source'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull()
}, (table) => [
  index('dose_due_status_idx').on(table.dueAt, table.status),
  uniqueIndex('dose_plan_due_unique_idx').on(table.medicationPlanId, table.dueAt)
]);

export const reminderAttempts = sqliteTable('reminder_attempts', {
  id: text('id').primaryKey(),
  doseOccurrenceId: text('dose_occurrence_id').notNull().references(() => doseOccurrences.id, { onDelete: 'cascade' }),
  attemptNumber: integer('attempt_number').notNull(),
  scheduledAt: integer('scheduled_at').notNull(),
  sentAt: integer('sent_at'),
  message: text('message').notNull(),
  deliveryStatus: text('delivery_status').$type<'scheduled' | 'sent' | 'failed' | 'cancelled'>().notNull().default('scheduled'),
  interaction: text('interaction'),
  notificationIdentifier: text('notification_identifier')
}, (table) => [index('reminder_dose_idx').on(table.doseOccurrenceId)]);

export const auditEvents = sqliteTable('audit_events', {
  id: text('id').primaryKey(),
  eventType: text('event_type').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  payloadJson: text('payload_json'),
  createdAt: integer('created_at').notNull()
});
