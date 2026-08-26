import { eq } from 'drizzle-orm';

import { db, initializeDatabase } from '@/db/client';
import { auditEvents, doseOccurrences } from '@/db/schema';
import { createLocalId } from '@/lib/id';

export async function markDoseTaken(doseId: string, source: 'button' | 'agent' = 'button') {
  initializeDatabase();
  const now = Date.now();

  await db.transaction(async (tx) => {
    await tx.update(doseOccurrences).set({
      status: 'taken',
      takenAt: now,
      skippedAt: null,
      snoozedUntil: null,
      resolutionSource: `user_report:${source}`,
      updatedAt: now
    }).where(eq(doseOccurrences.id, doseId));

    await tx.insert(auditEvents).values({
      id: createLocalId('audit'),
      eventType: 'dose.reported_taken',
      entityType: 'dose_occurrence',
      entityId: doseId,
      payloadJson: JSON.stringify({ source }),
      createdAt: now
    });
  });
}

export async function snoozeDose(doseId: string, until: Date, source: 'button' | 'agent' = 'button') {
  initializeDatabase();
  const now = Date.now();

  await db.transaction(async (tx) => {
    await tx.update(doseOccurrences).set({
      status: 'pending',
      snoozedUntil: until.getTime(),
      updatedAt: now
    }).where(eq(doseOccurrences.id, doseId));

    await tx.insert(auditEvents).values({
      id: createLocalId('audit'),
      eventType: 'dose.snoozed',
      entityType: 'dose_occurrence',
      entityId: doseId,
      payloadJson: JSON.stringify({ source, until: until.toISOString() }),
      createdAt: now
    });
  });
}

export async function skipDose(doseId: string, source: 'button' | 'agent' = 'button') {
  initializeDatabase();
  const now = Date.now();

  await db.transaction(async (tx) => {
    await tx.update(doseOccurrences).set({
      status: 'skipped',
      skippedAt: now,
      snoozedUntil: null,
      resolutionSource: `user_report:${source}`,
      updatedAt: now
    }).where(eq(doseOccurrences.id, doseId));

    await tx.insert(auditEvents).values({
      id: createLocalId('audit'),
      eventType: 'dose.skipped',
      entityType: 'dose_occurrence',
      entityId: doseId,
      payloadJson: JSON.stringify({ source }),
      createdAt: now
    });
  });
}
