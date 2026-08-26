# Medication Management Semantics

## Scope

This slice manages reminder lifecycle for already-confirmed medication plans. It does not change medication identity, dose, frequency, or clinical instructions.

## Pause reminders

Pausing a medication plan is an explicit, reversible user action.

When a plan is paused:
- `medication_plans.status` changes from `active` to `paused`.
- Future pending dose occurrences for that plan are removed.
- A pending occurrence whose original due time is in the past is also removed if it is currently snoozed into the future.
- Historical/resolved dose occurrences remain untouched.
- Native scheduled/presented notifications for removed occurrences are cancelled best-effort.
- An audit event records the pause and the count of projected occurrences removed.

A stale OS notification cannot mutate the paused plan because its dose occurrence no longer exists, and dose mutations fail closed when the target is missing or no longer pending.

## Resume reminders

When a paused plan is resumed:
- `medication_plans.status` changes back to `active`.
- The deterministic rolling dose generator recreates the future window from the existing confirmed reminder plan.
- Local notifications are refreshed from authoritative SQLite state.
- Historical dose occurrences are not recreated or changed.
- An audit event records the resume.

## Safety boundary

Pause/resume controls reminder administration only. They do not advise the user to stop or restart taking medication and do not modify the recorded clinical instruction.