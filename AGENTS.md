# Working on Flashcards

Read README.md and docs/deck-format.md. PRODUCT.md records confirmed requirements. Use the Tasks app's relevant principles: small real slices, open local JSON, keyboard-friendly flows, shadcn Base UI wrappers, clear error states, and protection of user work. Tasks-specific TaskDB, Tauri, Android, and milestone instructions do not apply here.

## Code quality

Use the clean-code skill when writing/refactoring/reviewing. Keep scheduling, filesystem, HTTP, and UI responsibilities separate. Application code imports shadcn wrappers from src/components/ui, not Base UI directly. Run pnpm check, pnpm lint, pnpm test, and pnpm build after changes. Use disposable deck directories for testing.

## Data ownership

Agents write top-level topic deck JSON. The app owns progress/ and .server.lock. Never overwrite user decks or progress to seed demonstrations. Preserve stable card IDs when updating wording; new concepts get new IDs. Validate untrusted JSON at boundaries. Never silently recover corrupt progress by resetting it.

## Tracking

Development tasks use pi-tasks with the sq backend, separate from the product's learning state. Run sq prime for direct CLI guidance; pi-tasks metadata belongs under pi_tasks.
