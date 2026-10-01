# Flashcards

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

User-requested Tasks foundation: React 19, TypeScript, Vite, Tailwind 4, shadcn Base UI, pnpm. Local Node backend, no Tauri for now.

## Product Purpose

Learn a topic from an agent-generated JSON deck and capture how well each card is known.

## Operating Context

Agents write topic decks in `$DATA/apps/flashcards`. The web app scans this directory and offers a deck dropdown.

## Capabilities and Constraints

Confirmed: local server and files, FSRS spaced repetition, question/answer cards, optional typed recall before revealing the answer, self-rating rather than automatic grading. Progress is stored separately from deck content. No accounts or cross-device sync in this version.

## Product Principles

- Keep content open and agent-friendly.
- Protect review history when content changes.
- Make studying keyboard-friendly.
- Reuse the Tasks shadcn foundation and code-quality guidelines.

## Open Decisions

Product name beyond Flashcards and additional card types are undecided. First version is a single local learner.
