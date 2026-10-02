import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { runDoctor } from "./doctor.js";

test("doctor reports paths and active locks without changing user data", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "flashcards-doctor-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const dataDirectory = path.join(root, "decks");
  const settings = {
    filePath: path.join(root, "config", "settings.json"),
    configured: true,
    dataDirectory,
    source: "settings",
  };
  const output = [];
  const errors = [];
  const result = await runDoctor(settings, {
    log: (line) => output.push(line),
    error: (line) => errors.push(line),
  });
  assert.equal(result, 0);
  assert.match(output.join("\n"), /can be created/);
  await assert.rejects(readFile(dataDirectory), { code: "ENOENT" });

  await mkdir(dataDirectory);
  const lockPath = path.join(dataDirectory, ".server.lock");
  await writeFile(lockPath, String(process.pid));
  output.length = 0;
  assert.equal(await runDoctor(settings, {
    log: (line) => output.push(line),
    error: (line) => errors.push(line),
  }), 0);
  assert.match(output.join("\n"), /already be using this folder/);
  assert.equal(await readFile(lockPath, "utf8"), String(process.pid));
});
