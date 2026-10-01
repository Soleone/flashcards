import { test } from "node:test";
import assert from "node:assert/strict";
import { cp, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { ProgressStore } from "./progress.ts";

test("a whole-directory backup restores deck content and review history", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "flashcards-restore-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const original = join(root, "original");
  const backup = join(root, "backup");
  const restored = join(root, "restored");
  await mkdir(original);
  await writeFile(
    join(original, "deck.json"),
    JSON.stringify({
      schemaVersion: 1,
      id: "restore",
      title: "Restore",
      cards: [{ id: "one", question: "Remember?", answer: "Yes." }],
    }),
  );
  const now = new Date("2026-09-30T12:00:00Z");
  const store = new ProgressStore(original);
  const study = await store.study("restore", now);
  const saved = await store.review(
    "restore",
    {
      cardId: "one",
      grade: 3,
      revision: study.revision,
      contentVersion: study.contentVersion,
      requestId: randomUUID(),
    },
    now,
  );
  await cp(original, backup, { recursive: true });
  await rm(original, { recursive: true });
  await cp(backup, restored, { recursive: true });
  assert.deepEqual(
    await new ProgressStore(restored).study("restore", now),
    saved,
  );
});
