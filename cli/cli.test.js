import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const entry = fileURLToPath(new URL("../bin/flashcards.js", import.meta.url));

test("CLI help and version work before setup", () => {
  const help = spawnSync(process.execPath, [entry, "--help"], { encoding: "utf8" });
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /init\s+Choose/);
  const version = spawnSync(process.execPath, [entry, "--version"], { encoding: "utf8" });
  assert.equal(version.status, 0, version.stderr);
  assert.match(version.stdout, /Flashcards 0\.1\.0/);
});

test("init saves the selected path only after confirmation", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "flashcards-cli-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const settingsPath = path.join(root, "config", "settings.json");
  const dataDirectory = path.join(root, "chosen-data");
  const env = {
    ...process.env,
    FLASHCARDS_CONFIG_PATH: settingsPath,
  };
  delete env.FLASHCARDS_DIR;

  const result = spawnSync(process.execPath, [entry, "init"], {
    input: `${dataDirectory}\nmaybe\nyes\n`,
    encoding: "utf8",
    env,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Save this location\?/);
  assert.match(result.stdout, /Please enter yes or no/);
  assert.deepEqual(JSON.parse(await readFile(settingsPath, "utf8")), {
    version: 1,
    dataDirectory,
  });
});

test("declining setup leaves settings untouched", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "flashcards-cli-cancel-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const settingsPath = path.join(root, "config", "settings.json");
  const env = {
    ...process.env,
    FLASHCARDS_CONFIG_PATH: settingsPath,
  };
  delete env.FLASHCARDS_DIR;

  const result = spawnSync(process.execPath, [entry, "init"], {
    input: `${path.join(root, "chosen-data")}\nno\n`,
    encoding: "utf8",
    env,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Settings were not changed/);
  await assert.rejects(readFile(settingsPath), { code: "ENOENT" });
});
