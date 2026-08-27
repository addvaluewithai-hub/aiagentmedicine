import { drizzle } from 'drizzle-orm/expo-sqlite';
import * as SQLite from 'expo-sqlite';
import { Platform } from 'react-native';

const DATABASE_NAME = 'medicine-agent.db';

const DATABASE_SCHEMA_SQL = `
  PRAGMA foreign_keys = ON;
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS medications (
    id TEXT PRIMARY KEY NOT NULL,
    display_name TEXT NOT NULL,
    strength_text TEXT,
    form_text TEXT,
    route_text TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS medication_instructions (
    id TEXT PRIMARY KEY NOT NULL,
    medication_id TEXT NOT NULL REFERENCES medications(id) ON DELETE CASCADE,
    dose_amount_text TEXT,
    frequency_text TEXT,
    meal_relation_text TEXT,
    source_type TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS instruction_medication_idx ON medication_instructions(medication_id);

  CREATE TABLE IF NOT EXISTS medication_plans (
    id TEXT PRIMARY KEY NOT NULL,
    medication_id TEXT NOT NULL REFERENCES medications(id) ON DELETE CASCADE,
    instruction_id TEXT REFERENCES medication_instructions(id),
    starts_at INTEGER NOT NULL,
    ends_at INTEGER,
    status TEXT NOT NULL DEFAULT 'active',
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS reminder_plans (
    id TEXT PRIMARY KEY NOT NULL,
    medication_plan_id TEXT NOT NULL REFERENCES medication_plans(id) ON DELETE CASCADE,
    local_time TEXT NOT NULL,
    timezone TEXT NOT NULL,
    days_of_week_json TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS dose_occurrences (
    id TEXT PRIMARY KEY NOT NULL,
    medication_plan_id TEXT NOT NULL REFERENCES medication_plans(id) ON DELETE CASCADE,
    due_at INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    taken_at INTEGER,
    skipped_at INTEGER,
    snoozed_until INTEGER,
    resolution_source TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS dose_due_status_idx ON dose_occurrences(due_at, status);
  CREATE UNIQUE INDEX IF NOT EXISTS dose_plan_due_unique_idx ON dose_occurrences(medication_plan_id, due_at);

  CREATE TABLE IF NOT EXISTS reminder_attempts (
    id TEXT PRIMARY KEY NOT NULL,
    dose_occurrence_id TEXT NOT NULL REFERENCES dose_occurrences(id) ON DELETE CASCADE,
    attempt_number INTEGER NOT NULL,
    scheduled_at INTEGER NOT NULL,
    sent_at INTEGER,
    message TEXT NOT NULL,
    delivery_status TEXT NOT NULL DEFAULT 'scheduled',
    interaction TEXT,
    notification_identifier TEXT
  );
  CREATE INDEX IF NOT EXISTS reminder_dose_idx ON reminder_attempts(dose_occurrence_id);

  CREATE TABLE IF NOT EXISTS audit_events (
    id TEXT PRIMARY KEY NOT NULL,
    event_type TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    payload_json TEXT,
    created_at INTEGER NOT NULL
  );
`;

type AppDatabase = ReturnType<typeof drizzle>;

let sqlite: SQLite.SQLiteDatabase | null = null;
let dbInstance: AppDatabase | null = null;
let initialized = false;
let initializationPromise: Promise<void> | null = null;

function requireDatabase(): AppDatabase {
  if (!dbInstance) {
    throw new Error('Database is not ready yet. Await initializeDatabaseAsync() before using it.');
  }

  return dbInstance;
}

export const db = new Proxy({} as AppDatabase, {
  get(_target, property) {
    const instance = requireDatabase();
    const value = Reflect.get(instance, property, instance);
    return typeof value === 'function' ? value.bind(instance) : value;
  }
});

function finishInitialization(database: SQLite.SQLiteDatabase) {
  sqlite = database;
  dbInstance = drizzle(database);
  initialized = true;
}

function initializeSchemaSync(database: SQLite.SQLiteDatabase) {
  database.execSync(DATABASE_SCHEMA_SQL);

  const reminderAttemptColumns = database.getAllSync<{ name: string }>('PRAGMA table_info(reminder_attempts)');
  if (!reminderAttemptColumns.some((column) => column.name === 'notification_identifier')) {
    database.execSync('ALTER TABLE reminder_attempts ADD COLUMN notification_identifier TEXT;');
  }
}

async function initializeSchemaAsync(database: SQLite.SQLiteDatabase) {
  await database.execAsync(DATABASE_SCHEMA_SQL);

  const reminderAttemptColumns = await database.getAllAsync<{ name: string }>('PRAGMA table_info(reminder_attempts)');
  if (!reminderAttemptColumns.some((column) => column.name === 'notification_identifier')) {
    await database.execAsync('ALTER TABLE reminder_attempts ADD COLUMN notification_identifier TEXT;');
  }
}

export function initializeDatabase() {
  if (initialized) return;

  if (Platform.OS === 'web') {
    throw new Error('Synchronous database initialization is disabled on web. Await initializeDatabaseAsync() first.');
  }

  const database = SQLite.openDatabaseSync(DATABASE_NAME);
  initializeSchemaSync(database);
  finishInitialization(database);
}

export async function initializeDatabaseAsync() {
  if (initialized) return;
  if (initializationPromise) return initializationPromise;

  initializationPromise = (async () => {
    if (Platform.OS !== 'web') {
      initializeDatabase();
      return;
    }

    const database = await SQLite.openDatabaseAsync(DATABASE_NAME);

    try {
      await initializeSchemaAsync(database);
      finishInitialization(database);
    } catch (error) {
      await database.closeAsync().catch(() => undefined);
      throw error;
    }
  })();

  try {
    await initializationPromise;
  } catch (error) {
    initializationPromise = null;
    throw error;
  }
}

export function isDatabaseInitialized() {
  return initialized && sqlite !== null && dbInstance !== null;
}
