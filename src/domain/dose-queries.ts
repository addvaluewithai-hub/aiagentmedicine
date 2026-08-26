import { and, eq, gte, lt } from 'drizzle-orm';

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
