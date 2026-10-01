# Flashcards

Local-first flashcards from agent-generated JSON. React, TypeScript, Vite, Tailwind 4 and shadcn Base Nova, matching the Tasks app's web foundation. A small Node server reads decks and persists FSRS scheduling separately.

## Run

Requires Node 22+ and pnpm 11.

```sh
pnpm install
mkdir -p "$DATA/apps/flashcards"
# Optional starter deck, without overwriting an existing file:
cp -n examples/learning-how-to-learn.json "$DATA/apps/flashcards/learning-how-to-learn.json"
pnpm dev
```

Open **http://localhost:4310**. One command serves both the UI and API. Do not start Vite alone: filesystem access requires the backend.

The deck folder defaults to `$DATA/apps/flashcards`, or `~/data/apps/flashcards` without DATA. Override it with `FLASHCARDS_DIR=/path/to/decks pnpm dev`. Set `PORT` to change the default 4310. The server binds to loopback, rejects foreign hosts/origins, and does not support remote hosting or accounts. One process owns a given deck directory, enforced by `.server.lock`; stale locks from a dead process are reclaimed on startup. If an invalid lock blocks startup, inspect it rather than deleting a live server's lock.

```sh
pnpm build
pnpm start
```

Production serves built assets through the same local backend.

## Study

Select a deck, recall the answer, optionally type it, reveal, and self-rate. The rating controls preview when the card returns. Space reveals; Ctrl/⌘ + Enter reveals while typing. Revealing within 5 seconds defaults to Easy (4), otherwise Good (3). After reveal, Left/Right selects a rating and Enter saves it; 1–4 or clicking a rating saves directly. Refresh discovers newly generated decks and due cards. Card-by-card progress includes learning state, review count, and estimated recall. Light/dark theme is stored in this browser.

See [docs/deck-format.md](docs/deck-format.md) for the complete JSON contract and a reusable agent prompt. A sample deck lives in `examples/` and is never silently added to your data directory.

## Data safety

Decks are read-only to the app. Progress lives in `progress/<deck-id>.json`, containing versioned FSRS state and review history. Review transactions are serialized and use atomic rename. Request IDs make retries idempotent; revision and content checks reject stale browser windows or decks changed mid-session. Corrupt progress is reported, never silently reset.

Back up the entire deck directory with the app stopped. To restore, stop the app, copy the backup directory into place, and restart. Preserving both deck IDs and card IDs preserves review state. Tests verify reloading persisted state from a fresh store and restoring a copied whole-directory backup after deleting the original. Keep backups outside the scanned deck folder. Atomic rename protects normal interrupted writes; this version does not promise power-loss durability, automatic backup rotation, or merge support for externally edited progress.

## Checks

```sh
pnpm check
pnpm lint
pnpm test
pnpm build
```

Tests use disposable directories, not your learning data. No built-in AI, grading model, accounts, sync, image cards, or native wrapper yet.
