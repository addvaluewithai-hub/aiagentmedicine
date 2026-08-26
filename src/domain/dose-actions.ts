import { eq } from 'drizzle-orm';

import { db, initializeDatabase } from '@/db/client';
import { auditEvents, doseOccurrences } from '@/db/schema';
import { createLocalId } from '@/lib/id';

export type DoseActionSource = 'button' | 'agent';

function getDoseStatus(doseId: string) {
  return db.select({ status: doseOccurrences.status })
    .from(doseOccurrences)
    .where(eq(doseOccurrences.id, doseId))
    .get()?.status ?? null;
}

function isPendingDose(doseId: string) {
  return getDoseStatus(doseId) === 'pending';
}

export function markDoseTaken(doseId: string, source: DoseActionSource = 'button') {
  initializeDatabase();
  if (!isPendingDose(doseId)) return false;
  const now = Date.now();

  db.transaction((tx) => {
    tx.update(doseOccurrences).set({
      status: 'taken',
      takenAt: now,
      skippedAt: null,
      snoozedUntil: null,
      resolutionSource: `user_report:${source}`,
      updatedAt: now
    }).where(eq(doseOccurrences.id, doseId)).run();

    tx.insert(auditEvents).values({
      id: createLocalId('audit'),
      eventType: 'dose.reported_taken',
      entityType: 'dose_occurrence',
      entityId: doseId,
      payloadJson: JSON.stringify({ source }),
      createdAt: now
    }).run();
  });

  return true;
}

export function snoozeDose(doseId: string, until: Date, source: DoseActionSource = 'button') {
  initializeDatabase();
  if (!isPendingDose(doseId)) return false;
  const now = Date.now();

  db.transaction((tx) => {
    tx.update(doseOccurrences).set({
      status: 'pending',
      snoozedUntil: until.getTime(),
      updatedAt: now
    }).where(eq(doseOccurrences.id, doseId)).run();

    tx.insert(auditEvents).values({
      id: createLocalId('audit'),
      eventType: 'dose.snoozed',
      entityType: 'dose_occurrence',
      entityId: doseId,
      payloadJson: JSON.stringify({ source, until: until.toISOString() }),
      createdAt: now
    }).run();
  });

  return true;
}

export function skipDose(doseId: string, source: DoseActionSource = 'button') {
  initializeDatabase();
  if (!isPendingDose(doseId)) return false;
  const now = Date.now();

  db.transaction((tx) => {
    tx.update(doseOccurrences).set({
      status: 'skipped',
      skippedAt: now,
      snoozedUntil: null,
      resolutionSource: `user_report:${source}`,
      updatedAt: now
    }).where(eq(doseOccurrences.id, doseId)).run();

    tx.insert(auditEvents).values({
      id: createLocalId('audit'),
      eventType: 'dose.skipped',
      entityType: 'dose_occurrence',
      entityId: doseId,
      payloadJson: JSON.stringify({ source }),
      createdAt: now
    }).run();
  });

  return true;
}

export function correctDoseToPending(doseId: string, source: DoseActionSource = 'button') {
  initializeDatabase();
  const previousStatus = getDoseStatus(doseId);
  if (previousStatus !== 'taken' && previousStatus !== 'skipped') return false;

  const now = Date.now();
  db.transaction((tx) => {
    tx.update(doseOccurrences).set({
      status: 'pending',
      takenAt: null,
      skippedAt: null,
      snoozedUntil: null,
      resolutionSource: null,
      updatedAt: now
    }).where(eq(doseOccurrences.id, doseId)).run();

    tx.insert(auditEvents).values({
      id: createLocalId('audit'),
      eventType: 'dose.corrected_to_pending',
      entityType: 'dose_occurrence',
      entityId: doseId,
      payloadJson: JSON.stringify({ source, previousStatus }),
      createdAt: now
    }).run();
  });

  return true;
}
