# Preview and device testing

The app has two useful preview modes. Use both because web preview cannot validate medication notification reliability.

## 1. Fast local smoke test

Use this for onboarding, AI extraction, Agent text/voice flows, SQLite state, Today, Medications, and History while connected to the development server.

Requirements:
- Node.js 22.13+
- npm
- Expo account for creating a development build
- `AI_API` available only in the server environment

Setup:

```bash
npm install
cp .env.example .env
# Add AI_API to .env. Never prefix it with EXPO_PUBLIC_.
npx expo start
```

Relative `/api/*` requests use the Expo development server automatically.

For native validation, install a development client and then run:

```bash
npx eas-cli@latest init
npx eas-cli@latest build --profile development --platform android
# or: --platform ios
npx expo start --dev-client
```

## 2. Shareable hosted preview

Use EAS Hosting for the Expo Router web app and API routes.

```bash
npx eas-cli@latest login
npx eas-cli@latest init
npx expo export --platform web
npx eas-cli@latest deploy
```

Configure the server-side `AI_API` secret in the EAS environment before testing AI routes.

The deployment command returns a shareable `*.expo.app` preview URL.

### Standalone native preview against the hosted API

Set the public API origin to the EAS Hosting deployment URL when building the native preview:

```bash
EXPO_PUBLIC_API_BASE_URL=https://YOUR-PREVIEW.expo.app \
  npx eas-cli@latest build --profile preview --platform android
```

For iOS, use a development/internal build with registered devices or a store/TestFlight build when distribution is ready.

`EXPO_PUBLIC_API_BASE_URL` is intentionally public; it contains only the server origin. `AI_API` must remain server-only.

## What each preview validates

### Web / hosted preview
- navigation and layouts
- onboarding conversation
- text and image extraction where browser permissions allow
- Agent behavior and confirmation flows
- SQLite/web persistence behavior
- API route deployment and model routing

Do not use web preview as proof that native medication reminders are reliable.

### Physical-device development build
- local notifications
- notification action buttons
- app background/killed behavior
- snooze/cancel behavior
- Android exact-alarm behavior
- microphone recording and transcription
- camera/photo permissions
- local SQLite persistence across restarts
- timezone/device-clock behavior

## Minimum beta smoke test

1. Add a medication by text, photo, and voice.
2. Resolve every ambiguous critical field before confirmation.
3. Confirm the reminder plan.
4. Verify the reminder fires with the app foregrounded, backgrounded, and killed.
5. Mark a dose Taken from Today and from a notification action.
6. Say “I took it” in Agent and verify the same local dose changes.
7. Snooze a dose and verify the old reminder chain is cancelled.
8. Pause and resume reminder plans through Medications and Agent confirmation.
9. Correct an accidental Taken/Skipped record from History and Agent.
10. Restart the app and verify all authoritative state remains in SQLite.
