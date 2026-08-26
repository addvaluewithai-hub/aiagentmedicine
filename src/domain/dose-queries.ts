import { and, desc, eq, gte, inArray, lt, lte, ne, or } from 'drizzle-orm';

import { db, initializeDatabase } from '@/db/client';
import {
  doseOccurrences,
  medicationInstructions,
  medicationPlans,
  medications
} from '@/db/schema';

export type DoseRow = {
  doseId: string;
  dueAt: number;
  status: 'pending' | 'taken' | 'skipped' | 'missed';
  snoozedUntil: number | null;
  medicationName: string;
  strength: string | null;
  doseAmount: string | null;
};

export type DoseHistoryRow = DoseRow & {
  takenAt: number | null;
  skippedAt: number | null;
  resolutionSource: string | null;
  updatedAt: number;
};

function baseDoseQuery() {
  return db.select({
    doseId: doseOccurrences.id,
    dueAt: doseOccurrences.dueAt,
    status: doseOccurrences.status,
    snoozedUntil: doseOccurrences.snoozedUntil,
    medicationName: medications.displayName,
    strength: medications.strengthText,
    doseAmount: medicationInstructions.doseAmountText
  })
    .from(doseOccurrences)
    .innerJoin(medicationPlans, eq(doseOccurrences.medicationPlanId, medicationPlans.id))
    .innerJoin(medications, eq(medicationPlans.medicationId, medications.id))
    .leftJoin(medicationInstructions, eq(medicationPlans.instructionId, medicationInstructions.id));
}

function historyDoseQuery() {
  return db.select({
    doseId: doseOccurrences.id,
    dueAt: doseOccurrences.dueAt,
    status: doseOccurrences.status,
    snoozedUntil: doseOccurrences.snoozedUntil,
    takenAt: doseOccurrences.takenAt,
    skippedAt: doseOccurrences.skippedAt,
    resolutionSource: doseOccurrences.resolutionSource,
    updatedAt: doseOccurrences.updatedAt,
    medicationName: medications.displayName,
    strength: medications.strengthText,
    doseAmount: medicationInstructions.doseAmountText
  })
    .from(doseOccurrences)
    .innerJoin(medicationPlans, eq(doseOccurrences.medicationPlanId, medicationPlans.id))
    .innerJoin(medications, eq(medicationPlans.medicationId, medications.id))
    .leftJoin(medicationInstructions, eq(medicationPlans.instructionId, medicationInstructions.id));
}

export function getDoseById(doseId: string): DoseRow | null {
  initializeDatabase();
  return baseDoseQuery().where(eq(doseOccurrences.id, doseId)).get() ?? null;
}

export function getUpcomingPendingDoses(limit = 50): DoseRow[] {
  initializeDatabase();
  return baseDoseQuery()
    .where(and(eq(doseOccurrences.status, 'pending'), gte(doseOccurrences.dueAt, Date.now())))
    .orderBy(doseOccurrences.dueAt)
    .limit(limit)
    .all();
}

export function getPendingDosesForReminderWindow(input?: {
  now?: number;
  horizonDays?: number;
  overdueMinutes?: number;
  limit?: number;
}): DoseRow[] {
  initializeDatabase();
  const now = input?.now ?? Date.now();
  const horizonDays = Math.min(Math.max(input?.horizonDays ?? 7, 1), 14);
  const overdueMinutes = Math.min(Math.max(input?.overdueMinutes ?? 90, 0), 24 * 60);
  const limit = Math.min(Math.max(input?.limit ?? 100, 1), 200);
  const from = now - overdueMinutes * 60_000;
  const to = now + horizonDays * 24 * 60 * 60_000;

  return baseDoseQuery()
    .where(and(
      eq(doseOccurrences.status, 'pending'),
      gte(doseOccurrences.dueAt, from),
      lt(doseOccurrences.dueAt, to)
    ))
    .orderBy(doseOccurrences.dueAt)
    .limit(limit)
    .all();
}

export function getAgentRelevantPendingDoses(input?: {
  now?: number;
  overdueHours?: number;
  futureHours?: number;
  limit?: number;
}): DoseRow[] {
  initializeDatabase();
  const now = input?.now ?? Date.now();
  const overdueHours = Math.min(Math.max(input?.overdueHours ?? 12, 1), 48);
  const futureHours = Math.min(Math.max(input?.futureHours ?? 24, 1), 72);
  const limit = Math.min(Math.max(input?.limit ?? 12, 1), 20);
  const from = now - overdueHours * 60 * 60_000;
  const to = now + futureHours * 60 * 60_000;

  return baseDoseQuery()
    .where(and(
      eq(doseOccurrences.status, 'pending'),
      gte(doseOccurrences.dueAt, from),
      lt(doseOccurrences.dueAt, to)
    ))
    .orderBy(doseOccurrences.dueAt)
    .limit(limit)
    .all();
}

export function getAgentCorrectableDoses(input?: {
  lookbackHours?: number;
  limit?: number;
}): DoseHistoryRow[] {
  initializeDatabase();
  const lookbackHours = Math.min(Math.max(input?.lookbackHours ?? 48, 1), 168);
  const limit = Math.min(Math.max(input?.limit ?? 10, 1), 20);
  const since = Date.now() - lookbackHours * 60 * 60_000;

  return historyDoseQuery()
    .where(and(
      inArray(doseOccurrences.status, ['taken', 'skipped']),
      gte(doseOccurrences.updatedAt, since)
    ))
    .orderBy(desc(doseOccurrences.updatedAt))
    .limit(limit)
    .all();
}

export function getTodayDoses(): DoseRow[] {
  initializeDatabase();
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  return baseDoseQuery()
    .where(and(gte(doseOccurrences.dueAt, start.getTime()), lt(doseOccurrences.dueAt, end.getTime())))
    .orderBy(doseOccurrences.dueAt)
    .all();
}

export function getDoseHistory(limit = 60): DoseHistoryRow[] {
  initializeDatabase();
  const safeLimit = Math.min(Math.max(limit, 1), 200);
  const now = Date.now();

  return historyDoseQuery()
    .where(or(
      lte(doseOccurrences.dueAt, now),
      ne(doseOccurrences.status, 'pending')
    ))
    .orderBy(desc(doseOccurrences.dueAt))
    .limit(safeLimit)
    .all();
}
