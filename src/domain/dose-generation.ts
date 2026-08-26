import { and, eq } from 'drizzle-orm';

import { MedicationWeekdaySchema, type MedicationWeekday } from '@/ai/medication-draft-schema';
import { db, initializeDatabase } from '@/db/client';
import { doseOccurrences, medicationPlans, medications, reminderPlans } from '@/db/schema';
import { createLocalId } from '@/lib/id';

const WEEKDAY_CODES: MedicationWeekday[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export type GeneratedDose = {
  doseId: string;
  medicationName: string;
  dueAt: number;
};

type DoseCandidate = GeneratedDose & {
  medicationPlanId: string;
};

function parseScheduleDays(value: string | null): MedicationWeekday[] | null | undefined {
  if (value === null) return null;

  try {
    const parsed = MedicationWeekdaySchema.array().min(1).max(7).safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

export function generateRollingDoseOccurrences(input?: {
  from?: Date;
  horizonDays?: number;
  maxNew?: number;
}): GeneratedDose[] {
  initializeDatabase();

  const from = input?.from ?? new Date();
  const horizonDays = Math.min(Math.max(input?.horizonDays ?? 7, 1), 14);
  const maxNew = Math.min(Math.max(input?.maxNew ?? 100, 1), 200);
  const horizon = new Date(from);
  horizon.setDate(horizon.getDate() + horizonDays);
  horizon.setHours(23, 59, 59, 999);

  const schedules = db.select({
    medicationPlanId: reminderPlans.medicationPlanId,
    localTime: reminderPlans.localTime,
    daysOfWeekJson: reminderPlans.daysOfWeekJson,
    planStartsAt: medicationPlans.startsAt,
    planEndsAt: medicationPlans.endsAt,
    medicationName: medications.displayName
  })
    .from(reminderPlans)
    .innerJoin(medicationPlans, eq(reminderPlans.medicationPlanId, medicationPlans.id))
    .innerJoin(medications, eq(medicationPlans.medicationId, medications.id))
    .where(eq(medicationPlans.status, 'active'))
    .all();

  const candidates: DoseCandidate[] = [];
  const candidateKeys = new Set<string>();

  for (const schedule of schedules) {
    const scheduleDays = parseScheduleDays(schedule.daysOfWeekJson);
    if (scheduleDays === undefined) continue;

    const [hour, minute] = schedule.localTime.split(':').map(Number);
    if (!Number.isInteger(hour) || !Number.isInteger(minute)) continue;

    for (let offset = 0; offset <= horizonDays; offset += 1) {
      const candidateDate = new Date(from);
      candidateDate.setDate(candidateDate.getDate() + offset);
      candidateDate.setHours(hour, minute, 0, 0);
      const dueAt = candidateDate.getTime();

      if (dueAt <= from.getTime() || dueAt > horizon.getTime()) continue;
      if (dueAt < schedule.planStartsAt) continue;
      if (schedule.planEndsAt && dueAt > schedule.planEndsAt) continue;
      if (scheduleDays && !scheduleDays.includes(WEEKDAY_CODES[candidateDate.getDay()])) continue;

      const key = `${schedule.medicationPlanId}:${dueAt}`;
      if (candidateKeys.has(key)) continue;

      const existing = db.select({ id: doseOccurrences.id })
        .from(doseOccurrences)
        .where(and(
          eq(doseOccurrences.medicationPlanId, schedule.medicationPlanId),
          eq(doseOccurrences.dueAt, dueAt)
        ))
        .get();

      if (existing) continue;

      candidateKeys.add(key);
      candidates.push({
        doseId: createLocalId('dose'),
        medicationPlanId: schedule.medicationPlanId,
        medicationName: schedule.medicationName,
        dueAt
      });

      if (candidates.length >= maxNew) break;
    }

    if (candidates.length >= maxNew) break;
  }

  if (!candidates.length) return [];

  const now = Date.now();
  db.transaction((tx) => {
    for (const dose of candidates) {
      tx.insert(doseOccurrences).values({
        id: dose.doseId,
        medicationPlanId: dose.medicationPlanId,
        dueAt: dose.dueAt,
        status: 'pending',
        createdAt: now,
        updatedAt: now
      }).run();
    }
  });

  return candidates.map(({ medicationPlanId: _medicationPlanId, ...dose }) => dose);
}
