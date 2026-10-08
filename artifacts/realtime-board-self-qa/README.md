# Realtime board self-QA

Run (requires secret `MILKSHA_FIREBASE_API_KEY`, writes only on `zz-qa-*`):

```bash
MILKSHA_FIREBASE_API_KEY=*** node scripts/realtime-board-self-qa.mjs
```

Firestore rules unit tests (optional, needs emulator on `:8080`):

```bash
npm run test:rules
```

Replace `tests/firestore-rules/realtime-board.rules` with milksha-cloud `firestore.rules` when backend PR lands.
