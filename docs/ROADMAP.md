# AI Medication Agent — MVP Roadmap

## Product thesis

This is not a pill-reminder app with a chatbot. It is a multilingual, multimodal medication adherence agent.

The user should be able to show or describe their medications using photos, prescriptions, voice, or text. The agent extracts a draft, asks only the missing/ambiguous questions, confirms the final medication plan with the user, then uses validated tools to create the schedule. During daily use, the same agent understands natural replies such as “I took it”, “remind me in 30 minutes”, or “I’m not home” and updates the authoritative dose state through tools.

Core product principles:

1. Zero-form onboarding by default.
2. AI understands and orchestrates; deterministic services own medication truth and scheduling.
3. Medication/schedule changes use draft -> confirm -> commit.
4. Exact reminders must not depend on opportunistic background execution.
5. Every medication mutation is authorized, validated, idempotent and auditable.
6. Multilingual conversation is a product capability, while UI localization and safety copy remain explicit app concerns.
7. Optimize for confirmed dose outcomes, not notification volume.

## Recommended stack

### Mobile
- Expo SDK 55
- React Native + TypeScript
- Expo Router
- Expo development builds for production-grade native capabilities
- NativeWind v4 (stable) with centralized design tokens
- TanStack Query for server state
- Small local state layer only where needed
- expo-notifications
- expo-image-picker / camera capability
- expo-audio for recording
- expo-secure-store
- expo-localization + app i18n framework

### Backend
Start with a TypeScript backend, Postgres, object storage and authentication. Supabase is a practical MVP choice for Postgres/Auth/Storage, while the agent and reminder worker should remain behind explicit server APIs so they can be moved or scaled independently.

Logical backend services:
- API/Auth layer
- Medication domain service
- Agent service
- Tool gateway
- Reminder worker/scheduler
- Push delivery service
- Media upload/extraction pipeline
- Audit/observability pipeline

### AI boundary
The model never writes directly to the database.

Flow:

unstructured user input -> multimodal extraction -> medication draft -> clarification -> explicit confirmation -> tool call -> validated domain mutation -> authoritative database state

## Screen map

### Onboarding stack
1. Welcome / value proposition
2. Start medication setup: camera / photo / voice / text
3. Capture or conversation screen
4. AI processing state
5. Medication draft review
6. Clarification conversation for missing/uncertain fields
7. Final medication + schedule confirmation
8. Notification permission primer and system permission request
9. Onboarding complete -> Today

The onboarding should feel like one continuous conversation even if several internal routes/states are used.

### Main app
- Today
  - next dose
  - today timeline
  - taken/snoozed/skipped/missed states
- Medications
  - medication list
  - medication detail
  - edit/pause/resume
  - add medication via the same multimodal flow
- Agent
  - text conversation
  - push-to-talk
  - contextual actions against medication/dose state
- Settings
  - reminder behavior
  - preferred/app language
  - timezone
  - notification status
  - privacy/data controls

### Supporting routes/modals
- Dose action / correction
- Medication confirmation
- Schedule confirmation
- Camera/media capture
- Permission education
- History/adherence detail
- Error/offline recovery

Caregiver, refill, wearables, widgets and health-platform integrations are post-MVP unless the core adherence loop validates strongly.

## Core domain model

Primary entities:
- User
- Device
- Medication
- MedicationPlan
- DoseRule
- DoseOccurrence
- ReminderAttempt
- InteractionEvent
- AgentConversation
- UploadedSource
- AuditEvent

A medication label is not a schedule. Keep Medication and MedicationPlan separate so plans can change over time without destroying medication identity/history.

### Dose state machine

scheduled -> due -> reminded -> taken
                    -> snoozed -> due/reminded
                    -> skipped
                    -> missed
                    -> corrected

ReminderAttempt is separate from DoseOccurrence. This lets the system measure how many attempts were required and which message/timing recovered a dose.

## Reminder architecture

Do not infer “ignored notification” from the OS. Instead, treat a due dose as unresolved until the system receives an explicit taken/snoozed/skip/correction event.

Recommended MVP strategy:
- Device/local notification provides a reliable first due-time reminder and offline fallback.
- Server keeps the authoritative dose state.
- If the dose remains unresolved after the policy window, the reminder worker creates another ReminderAttempt and sends an adaptive push.
- Any user action resolves or reschedules the dose and immediately invalidates pending follow-ups.
- All actions are idempotent to prevent duplicates.
- AI failure falls back to safe deterministic reminder copy.

Do not use deferrable background tasks as the mechanism for exact medication timing.

## Agent tool boundary

Initial tools:
- get_today_doses
- get_medications
- get_medication
- create_medication_draft
- update_medication_draft
- commit_medication_plan
- update_medication_plan
- pause_medication_plan
- resume_medication_plan
- mark_dose_taken
- snooze_dose
- skip_dose
- correct_dose_event

Tool policy:
- Read operations can execute directly after authorization.
- Simple reversible dose logging can execute directly and offer correction.
- Medication-plan creation/update/pause operations require confirmation of the exact structured change.
- The model may not prescribe, recommend dose changes, or infer unreadable clinical instructions.

## Implementation order

### Phase 0 — Product and engineering foundation
- #1 Bootstrap Expo app and engineering baseline
- #2 Navigation, screen map and design system
- #3 Backend foundation and medication data model
- #8 Safety, privacy, auditability and observability
- #13 MVP analytics and success metrics
- #14 Architecture and roadmap documentation

### Phase 1 — Core product vertical slice
- #4 Zero-form multimodal medication onboarding
- #5 Medication AI agent and tool gateway
- #6 Reliable dose and reminder engine

The first meaningful demo should be end-to-end:
photo/voice -> extraction -> clarification -> confirmation -> saved plan -> due reminder -> user says “I took it” -> dose becomes taken.

### Phase 2 — Daily product
- #7 Today, Medications, History and Settings
- #9 Adaptive reminder personalization
- #16 Internationalization and multilingual quality

### Phase 3 — Beta hardening
- #10 Device QA and reliability hardening
- #15 End-to-end testing and release automation

### Phase 4 — Launch
- #11 App Store and Google Play launch readiness

### Phase 5 — Post-MVP
- #12 Caregiver, refill and ecosystem integrations

## MVP success metrics

Primary product metrics:
- Onboarding completion rate
- Median time to first confirmed medication plan
- Percent of plans completed without manual form entry
- Extraction correction rate by medication field
- Notification opt-in rate
- First-reminder action rate
- Recovered unresolved doses after follow-up reminders
- Median delay from scheduled dose to confirmed taken
- D7/D30 retention among users with recurring medication

The north-star direction should be confirmed/resolved scheduled doses, not DAU or notifications sent.

## Release gates

Before external beta:
- Medication extraction never silently commits uncertain dose/frequency fields.
- All write tools are authorized, schema-validated, idempotent and audited.
- Reminder behavior is tested with the app foregrounded, backgrounded, killed and offline.
- Timezone and DST behavior is covered.
- Sensitive data is excluded/redacted from general analytics and logs.
- User can inspect and manually correct every AI-created medication/schedule field.

Before public launch:
- TestFlight and Google Play closed testing completed.
- Privacy policy, health-data disclosures, account/data deletion and support flows are live.
- Store health/medical declarations are complete.
- Production crash/notification/tool-call monitoring is operational.
- Staged rollout and rollback path are documented.

## Explicitly deferred from MVP

Do not let these delay validation of the core loop:
- Drug interaction recommendations
- AI diagnosis/treatment advice
- Dose calculators
- Pharmacy marketplace
- EHR integrations
- Wearables/watch apps
- Caregiver network
- Refill automation
- Advanced adherence reports

The MVP wins or loses on two things: zero-friction setup and whether adaptive conversational follow-up measurably recovers doses that static reminders miss.
