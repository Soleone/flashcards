import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { ProgressStore } from "./progress.ts";
import { scanDecks, deckSchema } from "./decks.ts";
import type { Deck, Grade, StudyDeck } from "../src/contracts.ts";

const deck: Deck = {
  schemaVersion: 1,
  id: "test-deck",
  title: "Test deck",
  cards: [
    { id: "one", question: "One?", answer: "One." },
    { id: "two", question: "Two?", answer: "Two." },
  ],
};
const now = new Date("2026-09-30T12:00:00Z");
function review(study: StudyDeck, grade: Grade = 3) {
  return {
    cardId: study.queue[0],
    grade,
    revision: study.revision,
    contentVersion: study.contentVersion,
    requestId: randomUUID(),
  };
}
async function fixture(t: TestContext) {
  const directory = await mkdtemp(join(tmpdir(), "flashcards-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(join(directory, "deck.json"), JSON.stringify(deck));
  return { directory, store: new ProgressStore(directory) };
}

test("validates stable IDs and rejects duplicate cards", () => {
  assert.throws(() => deckSchema.parse({ ...deck, id: "../escape" }));
  assert.throws(() =>
    deckSchema.parse({ ...deck, cards: [deck.cards[0], deck.cards[0]] }),
  );
  assert.throws(() => deckSchema.parse({ ...deck, schemaVersion: 2 }));
});

test("discovers decks, isolates malformed files, excludes conflicting deck IDs", async (t) => {
  const { directory } = await fixture(t);
  await writeFile(join(directory, "bad.json"), "{broken");
  await mkdir(join(directory, "progress"));
  await writeFile(join(directory, "progress", "ignore.json"), "{}");
  let scan = await scanDecks(directory);
  assert.equal(scan.catalog.decks.length, 1);
  assert.equal(scan.catalog.issues.length, 1);
  await writeFile(join(directory, "duplicate.json"), JSON.stringify(deck));
  scan = await scanDecks(directory);
  assert.equal(scan.catalog.decks.length, 0);
  assert.equal(scan.catalog.issues.length, 2);
});

test("stores FSRS state and history atomically, survives restart, and leaves source unchanged", async (t) => {
  const { directory, store } = await fixture(t);
  const before = await readFile(join(directory, "deck.json"), "utf8");
  const initial = await store.study(deck.id, now);
  assert.deepEqual(initial.queue, ["one", "two"]);
  assert.equal(initial.cards[0].recall, null);
  assert.ok(initial.cards[0].intervals[3]);
  const saved = await store.review(deck.id, review(initial), now);
  assert.equal(saved.revision, 1);
  assert.deepEqual(saved.queue, ["two"]);
  assert.equal(saved.cards[0].reviews, 1);
  const restored = await new ProgressStore(directory).study(deck.id, now);
  assert.deepEqual(restored, saved);
  const progress = JSON.parse(
    await readFile(join(directory, "progress", `${deck.id}.json`), "utf8"),
  );
  assert.equal(progress.history.length, 1);
  assert.equal(progress.history[0].log.rating, 3);
  assert.equal(await readFile(join(directory, "deck.json"), "utf8"), before);
});

test("all four ratings yield real FSRS schedules and learning becomes due again", async (t) => {
  const { store } = await fixture(t);
  const initial = await store.study(deck.id, now);
  const saved = await store.review(deck.id, review(initial, 1), now);
  const due = new Date(saved.cards[0].due);
  assert.ok(due > now);
  const later = await store.study(deck.id, due);
  assert.equal(later.queue[0], "one");
  assert.equal(later.cards[0].state, "Learning");
  assert.ok(later.cards[0].recall !== null);
});

for (const grade of [1, 2, 3, 4] as Grade[])
  test(`persists rating ${grade}`, async (t) => {
    const { store } = await fixture(t);
    const saved = await store.review(
      deck.id,
      review(await store.study(deck.id, now), grade),
      now,
    );
    assert.equal(saved.cards[0].reviews, 1);
    assert.ok(new Date(saved.cards[0].due) > now);
  });

test("idempotent retries do not create another review; reused IDs with different payloads fail", async (t) => {
  const { store } = await fixture(t);
  const input = review(await store.study(deck.id, now));
  await store.review(deck.id, input, now);
  const retry = await store.review(deck.id, input, now);
  assert.equal(retry.revision, 1);
  await assert.rejects(
    store.review(deck.id, { ...input, grade: 4 }, now),
    /reused/,
  );
});

test("concurrent stale windows cannot overwrite each other, and rejection does not poison the queue", async (t) => {
  const { store } = await fixture(t);
  const input = await store.study(deck.id, now);
  const results = await Promise.allSettled([
    store.review(deck.id, review(input), now),
    store.review(deck.id, { ...review(input), cardId: "two" }, now),
  ]);
  assert.equal(
    results.filter((result) => result.status === "fulfilled").length,
    1,
  );
  assert.equal(
    results.filter((result) => result.status === "rejected").length,
    1,
  );
  const latest = await store.study(deck.id, now);
  assert.equal((await store.review(deck.id, review(latest), now)).revision, 2);
});

test("changed content is rejected mid-session, then stable card IDs preserve progress", async (t) => {
  const { directory, store } = await fixture(t);
  const initial = await store.study(deck.id, now);
  const saved = await store.review(deck.id, review(initial), now);
  await writeFile(
    join(directory, "deck.json"),
    JSON.stringify({
      ...deck,
      cards: [
        { ...deck.cards[0], answer: "Improved answer." },
        ...deck.cards.slice(1),
      ],
    }),
  );
  await assert.rejects(store.review(deck.id, review(saved), now), /changed/);
  const refreshed = await store.study(deck.id, now);
  assert.equal(refreshed.cards[0].reviews, 1);
  assert.equal(refreshed.cards[0].answer, "Improved answer.");
});

test("corrupt progress is never silently reset or overwritten", async (t) => {
  const { directory, store } = await fixture(t);
  await mkdir(join(directory, "progress"));
  const file = join(directory, "progress", `${deck.id}.json`);
  await writeFile(file, "{broken");
  await assert.rejects(store.study(deck.id, now));
  await assert.rejects(
    store.review(
      deck.id,
      {
        cardId: "one",
        grade: 3,
        revision: 0,
        contentVersion: "a".repeat(64),
        requestId: randomUUID(),
      },
      now,
    ),
  );
  assert.equal(await readFile(file, "utf8"), "{broken");
});
