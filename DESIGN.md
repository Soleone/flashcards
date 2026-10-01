# Flashcards design

User-approved focused shadcn screen, inheriting Tasks' Base Nova foundation. Platform: responsive web. The study surface is Operate mode, not a landing page.

## Foundation

Geist Variable, Lucide icons, Tailwind 4, semantic CSS tokens, shadcn Base UI wrappers. Light neutral page with white study surface; dark neutral page with raised charcoal study surface. Blue denotes the main action and keyboard focus. Base Nova corner geometry and component variants are preserved.

## Composition

Compact header; deck dropdown and refresh; deck title and description; quiet new/learning/review/session counts; one generous question surface. Optional typed recall remains visible when comparing the reference answer. Reveal unfolds in place rather than flipping the card. Rating buttons display predicted intervals, with Good as the primary action. Progress table is behind a disclosure rather than a persistent dashboard.

Study width caps at 720 px. Ratings use four columns on desktop and two on mobile. Long Markdown content scrolls naturally; code blocks and tables have local horizontal scrolling. Mobile width was checked at 390 px; desktop at 1440 px. No page-level horizontal overflow at the tested mobile width.

## Interaction and accessibility

Space reveals, 1–4 rate, Ctrl/⌘ + Enter reveals from typed recall. Native input/control behavior takes precedence over global shortcuts. Focus moves to the next question or rating prompt. Saving, retry, stale-progress, malformed-file, loading, empty-deck and caught-up states are explicit. Motion is a brief answer-unfold translation and respects reduced motion. Both themes use semantic focus, selection, caret and scrollbar styling.

## Validation

Direct in-session review, not an independent delegated review. Two batched desktop/mobile screenshot rounds checked readable hierarchy and responsive layout. The mechanical design detector returned no findings. After fixes, axe-core reported zero violations and zero incomplete checks on the tested dark study screen; light was checked earlier. This is not a claim of exhaustive accessibility certification.

No shipping raster assets or generated artwork. Evidence screenshots live under .impeccable/review/ and are development-only.
