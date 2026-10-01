import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { apiHandler } from "./http.ts";
import { ProgressStore } from "./progress.ts";
import type { StudyDeck } from "../src/contracts.ts";

test("HTTP boundary discovers decks, persists reviews, and rejects invalid requests", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "flashcards-http-"));
  const deck = {
    schemaVersion: 1,
    id: "http-deck",
    title: "HTTP deck",
    cards: [{ id: "constructor", question: "A valid ID?", answer: "Yes." }],
  };
  await writeFile(join(directory, "deck.json"), JSON.stringify(deck));
  const handle = apiHandler(new ProgressStore(directory));
  const server = createServer((req, res) => {
    void handle(req, res);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}/api/decks`;
  const catalog = await (await fetch(base)).json();
  assert.equal(catalog.decks[0].count, 1);
  const study = (await (await fetch(`${base}/${deck.id}`)).json()) as StudyDeck;
  assert.equal(study.cards[0].state, "New");
  const post = (
    body: unknown,
    headers = { "Content-Type": "application/json" },
  ) =>
    fetch(`${base}/${deck.id}/reviews`, {
      method: "POST",
      headers,
      body: typeof body === "string" ? body : JSON.stringify(body),
    });
  const input = {
    cardId: "constructor",
    grade: 4,
    revision: study.revision,
    contentVersion: study.contentVersion,
    requestId: randomUUID(),
  };
  const saved = await post(input);
  assert.equal(saved.status, 200);
  assert.equal((await saved.json()).revision, 1);
  assert.equal((await post(input)).status, 200);
  assert.equal((await post({ ...input, requestId: randomUUID() })).status, 409);
  assert.equal((await post({ ...input, grade: 0 })).status, 400);
  assert.equal((await post("{broken")).status, 400);
  assert.equal(
    (await post("{}", { "Content-Type": "text/plain" })).status,
    415,
  );
  assert.equal((await post("x".repeat(9000))).status, 413);
  assert.equal((await fetch(`${base}/missing`)).status, 404);
  assert.equal((await fetch(base, { method: "DELETE" })).status, 404);
  const restored = (await (
    await fetch(`${base}/${deck.id}`)
  ).json()) as StudyDeck;
  assert.equal(restored.cards[0].reviews, 1);
  assert.equal(restored.queue.length, 0);
  assert.ok(restored.nextDue);
});
