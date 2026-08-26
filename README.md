# Medicine Agent

Multilingual, multimodal medication adherence agent built with Expo.

## Current phase

Foundation bootstrap for the first local-first vertical slice.

See [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) and [`docs/ROADMAP.md`](./docs/ROADMAP.md).

## Local development

Requirements:

- Node.js 22.13+
- npm
- Expo/EAS account when creating development builds

Install and check the project:

```bash
npm install
npm run typecheck
npm run doctor
npm start
```

The server-only AI key is named `AI_API`. Never expose it through an `EXPO_PUBLIC_*` variable.

For local API-route development, copy `.env.example` to `.env` and provide `AI_API` locally. Production will use the hosting environment secret store.

## Architecture rules

- SQLite is authoritative during v0.
- UI does not issue raw SQL.
- AI output must be validated before domain actions execute.
- The model never writes directly to the database.
- Medication-plan changes require explicit user confirmation.
- Native notifications remain functional when AI is unavailable.
