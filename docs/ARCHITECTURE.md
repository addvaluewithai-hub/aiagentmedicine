# AI Medication Agent — Final MVP Architecture

Status: **Architecture locked for implementation**

This document supersedes earlier exploratory architecture notes where they conflict.

## 1. Product definition

This product is a multilingual, multimodal **medication adherence agent**, not a pill-reminder app with a chatbot bolted on.

The core loop is:

1. User shows or describes medication(s) using camera, photo library, voice, or text.
2. AI extracts a structured draft.
3. AI asks only for missing, conflicting, or materially uncertain fields.
4. User reviews one consolidated medication/reminder plan.
5. User explicitly confirms before the plan becomes authoritative.
6. Native scheduling creates reliable local reminders.
7. User can respond naturally (for example: “I took it”, “remind me in 30 minutes”, “skip this one”) or use deterministic buttons.
8. The app records the dose outcome and future reminder attempts adapt to unresolved doses.

The agent optimizes for adherence while remaining deliberately outside diagnosis, prescribing, dose recommendation, or treatment decisions.

## 2. Locked implementation decisions

### Mobile

- Expo SDK 57
- React Native 0.86 / React 19.2
- TypeScript
- Expo Router
- Expo development builds for native validation
- NativeWind v4 only if the initial compatibility spike remains clean
- No dependency on NativeWind-specific architecture; design tokens remain framework-agnostic
- expo-sqlite as the local source of truth during v0
- Drizzle ORM for typed schema and migrations
- expo-notifications for local notifications and interactions
- expo-image-picker for medication/prescription capture
- expo-audio for push-to-talk recording
- expo-secure-store for small device secrets/identifiers
- expo-localization for locale detection

### Backend during v0

There is **no cloud application database and no user account requirement** during the first implementation slice.

There is still a minimal server boundary because `AI_API` must never ship inside the mobile bundle.

Expo Router API routes are used initially as the AI gateway. They can be deployed to EAS Hosting or replaced by another server without changing the mobile/domain contracts.

### AI models

Reuse the simple free-model fallback philosophy from `booking-wizard-ai-salesman`.

Do **not** add capability-based routing while the configured models have effectively equivalent capabilities for our tasks.

The router owns:

- ordered model fallback
- per-attempt timeout
- overall request deadline
- retryable provider failures
- diagnostics
- safe all-models-unavailable failure

The router does **not** own domain safety.

### Supabase

Supabase is deferred until the local vertical slice is validated.

Later it can provide:

- Postgres
- Auth
- object storage
- cloud synchronization
- server-side reminder workers
- caregiver/multi-device features

Local SQLite remains useful in production as the offline store/cache.

## 3. System boundaries

```text
Mobile UI
   ↓
Domain Services / Agent Tool Executor
   ↓
Local SQLite (authoritative in v0)
   ↓
Native Notification Scheduler

Mobile UI / Agent
   ↓ HTTPS
AI Gateway (server)
   ↓
Model Router
   ↓
Gemini-compatible models using AI_API
```

The model never receives database credentials and never writes directly to SQLite or a future cloud database.

## 4. AI execution contract

The AI may produce one of three categories of result:

1. conversational response
2. structured medication draft
3. validated tool request

All structured output follows:

```text
Model output
   ↓
Schema validation
   ↓
Domain validation
   ↓
Confirmation policy
   ↓
Tool execution
   ↓
Audit event
```

A successful provider response is **not** considered a successful product action until validation passes.

### Confirmation policy

Read-only actions can execute immediately.

Simple reversible dose actions can execute immediately and expose correction:

- mark dose taken
- snooze dose
- skip dose

Medication or recurring reminder-plan mutations require explicit confirmation of the resulting structured change before commit.

The model is never allowed to prescribe, choose a dose, recommend a dose change, or guess unreadable clinical instructions.

## 5. Onboarding UX

The onboarding should feel like one continuous assistant interaction, not a multi-page wizard.

### Screen 1 — Welcome

Short product promise and one primary CTA.

### Screen 2 — Medication Setup Workspace

One screen contains:

- Take photo
- Choose photo
- Push-to-talk
- Text input
- captured media/messages
- inline AI clarification
- extraction progress/errors

Processing and clarification are **states inside this workspace**, not separate screens.

The assistant should ask only about fields that are missing, conflicting, or materially uncertain.

### Screen 3 — Review & Confirm

Show all proposed medications and reminder plans together.

The user can:

- confirm
- edit manually
- tell the agent what to change

No medication plan becomes authoritative before this confirmation.

### Screen 4 — Notification Setup

Explain why notifications matter before requesting OS permission.

On Android, expose reminder-health diagnostics where exact-alarm/battery restrictions can affect reliability.

### Then → Today

## 6. Main navigation

Primary tabs:

1. **Today** — the default/home experience
2. **Medications**
3. **Agent**

Settings is a secondary route accessible from the app header/profile control rather than a fourth primary tab.

History is also secondary, not a primary tab.

The product should not force users into chat for routine use. The Today screen must remain useful when AI is unavailable.

## 7. Core data model

### Medication

Identity-level information about the medication itself.

Examples:

- display name
- normalized name if available
- strength text
- form/route when known

### MedicationInstruction

What the source/user says about taking the medication.

Examples:

- dose amount text
- frequency
- meal relation
- source type (`prescription`, `package`, `user_statement`)

This is intentionally separate from reminder times.

### MedicationPlan

The active period during which a medication/instruction set applies.

Plan history is preserved when instructions change.

### ReminderPlan

User-confirmed reminder preferences.

Examples:

- times of day
- days of week
- start/end boundaries
- timezone behavior

ReminderPlan must not be misrepresented as a doctor’s instruction.

### DoseOccurrence

One expected dose instance.

Minimal status model:

- `pending`
- `taken`
- `skipped`
- `missed`

Additional fields include:

- due_at
- taken_at
- skipped_at
- snoozed_until
- resolution_source

`reminded`, `snoozed`, and `corrected` are **not dose statuses**.

### ReminderAttempt

One reminder attempt for a DoseOccurrence.

Fields include:

- dose_occurrence_id
- attempt_number
- scheduled_at
- sent_at
- message
- delivery_status
- interaction/result when known

A dose can remain `pending` while multiple ReminderAttempts are created.

### DoseAction / AuditEvent

Append-only events record important state changes, including corrections.

Example: a user accidentally marks a dose taken, then corrects it back to pending. The correction is an event; `corrected` is not a persistent dose status.

### UploadedSource

Transient metadata about an uploaded prescription/package image or recording.

Raw prescription images should be deleted by default after successful extraction + confirmation unless a later product requirement explicitly justifies retention.

## 8. Local persistence

SQLite is the v0 authoritative store.

UI components never call raw SQL directly.

The intended dependency direction is:

```text
UI
 ↓
Domain service
 ↓
Database module
 ↓
SQLite / Drizzle
```

Avoid speculative repository/factory abstractions until a second persistence implementation actually exists.

Do not introduce TanStack Query for local SQLite state in v0. Add it when remote server state becomes real.

## 9. Reminder reliability architecture

Exact medication timing must not depend on JavaScript background execution or AI availability.

### v0

- confirmed ReminderPlan creates native local notifications ahead of time
- DoseOccurrence remains authoritative in SQLite
- interaction buttons provide deterministic Taken / Snooze / Skip paths
- natural language is an additional interface, never the only interface
- follow-up reminder copy can be generated ahead of time or fall back to deterministic templates

### later cloud phase

- server reminder worker evaluates unresolved doses
- server creates adaptive ReminderAttempts
- remote push sends follow-ups
- any dose resolution invalidates later pending attempts

The product does not infer that a notification was “ignored” from an OS event. It simply observes that the dose remains unresolved after the configured follow-up window.

## 10. AI outage behavior

AI is optional for reliability-critical actions.

If all configured models fail:

- scheduled reminders still fire
- Taken/Snooze/Skip still work
- users can manually edit medication data
- deterministic reminder copy is used
- no medication mutation is guessed

## 11. Multilingual behavior

Conversation language is model-driven and can change naturally during a session.

App chrome and safety/fallback copy are explicitly localized by the application, not generated on every render by AI.

Medication names and source text are preserved and are not silently translated or normalized into a different clinical meaning.

RTL-safe layouts are required even though the product is not Arabic-first.

## 12. Privacy and safety

- `AI_API` is server-only and must never use an `EXPO_PUBLIC_` name.
- send the minimum necessary medication context to the AI gateway
- never send prescription images/history to analytics
- analytics events use behavioral categories without medication payloads
- raw source images are transient by default
- every committed medication/reminder mutation is auditable
- uncertain critical fields block commit until clarified or manually confirmed
- model-provided confidence is a UX signal only, never a calibrated safety guarantee
- urgent medical language receives a safety response but the agent does not diagnose or prescribe

## 13. First vertical slice

The first product milestone is complete only when this works end-to-end:

```text
Launch app
→ start medication setup
→ capture medication photo OR describe by voice/text
→ AI gateway/model-router extracts structured draft
→ agent asks for missing material details
→ user reviews + confirms
→ plan saved in SQLite
→ dose occurrence generated
→ native reminder scheduled
→ user chooses Taken OR says “I took it”
→ dose becomes taken
→ Today screen updates
→ app restart preserves state
```

## 14. Technical spikes before feature expansion

### Spike A — Expo/NativeWind

Verify Expo SDK 57 + NativeWind v4 + Expo Router on both native targets. NativeWind is removed if it introduces unacceptable RN 0.86 development/build friction.

### Spike B — Notifications

Verify local schedule, app killed/backgrounded behavior, notification interaction, Snooze/Taken action handling, and Android exact-alarm limitations.

### Spike C — AI gateway

Verify `AI_API` server isolation, free-model fallback router, image/text input, structured validation, and safe failure.

### Spike D — SQLite

Verify medication/reminder/dose persistence, state transitions, restart persistence, and migration flow.

## 15. Explicitly deferred

Do not delay validation for:

- Supabase/cloud sync
- login/signup
- caregiver network
- refill management
- EHR/pharmacy integrations
- Apple Health / Health Connect
- wearables/watch apps
- realtime duplex voice
- medical Q&A
- drug interaction recommendations
- diagnosis/treatment advice
- dose calculators
- advanced analytics/reporting

## 16. Success metrics

The north-star direction is resolved scheduled doses, not messages or notifications sent.

Track:

- onboarding completion
- time to first confirmed plan
- percent of plans created without manual form entry
- extraction correction rate by field category
- notification permission success
- first-reminder resolution rate
- unresolved-dose recovery after follow-up attempts
- median delay from due time to user-reported taken
- D7/D30 retention among recurring-medication users

The differentiating experiment is static reminder strategy versus adaptive conversational follow-up.