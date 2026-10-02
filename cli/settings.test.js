import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  APP_ID,
  checkDirectory,
  defaultDataDirectory,
  loadSettings,
  saveSettings,
  settingsFilePath,
} from "./settings.js";

test("settings and data defaults follow XDG locations, not DATA", async (t) => {
  const home = await mkdtemp(path.join(tmpdir(), "flashcards-config-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  const env = {
    DATA: path.join(home, "personal-data"),
    XDG_CONFIG_HOME: path.join(home, "config"),
    XDG_DATA_HOME: path.join(home, "data"),
  };

  assert.equal(settingsFilePath({ env, home }), path.join(home, "config", APP_ID, "settings.json"));
  assert.equal(defaultDataDirectory({ env, home }), path.join(home, "data", APP_ID));
  const settings = await loadSettings({ env, home });
  assert.equal(settings.dataDirectory, path.join(home, "data", APP_ID));
  assert.equal(settings.source, "default");
  assert.equal(settings.configured, false);
  assert.equal(settingsFilePath({ env: { DATA: env.DATA }, home }), path.join(home, ".config", APP_ID, "settings.json"));
  assert.equal(defaultDataDirectory({ env: { DATA: env.DATA }, home }), path.join(home, ".local", "share", APP_ID));
});

test("saved path persists atomically and FLASHCARDS_DIR overrides it", async (t) => {
  const home = await mkdtemp(path.join(tmpdir(), "flashcards-settings-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  const filePath = path.join(home, "config", "settings.json");
  const saved = path.join(home, "chosen-decks");
  await saveSettings(saved, filePath);
  assert.deepEqual(JSON.parse(await readFile(filePath, "utf8")), {
    version: 1,
    dataDirectory: saved,
  });

  const settings = await loadSettings({
    env: { FLASHCARDS_DIR: path.join(home, "override") },
    home,
    filePath,
  });
  assert.equal(settings.dataDirectory, path.join(home, "override"));
  assert.equal(settings.savedDataDirectory, saved);
  assert.equal(settings.source, "FLASHCARDS_DIR");
  assert.equal(settings.configured, true);
});

test("path check does not create missing app data and checks existing folders", async (t) => {
  const home = await mkdtemp(path.join(tmpdir(), "flashcards-path-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  const missing = path.join(home, "new", "decks");
  assert.deepEqual(await checkDirectory(missing), {
    kind: "will-create",
    parent: home,
  });
  await assert.rejects(stat(missing), { code: "ENOENT" });
  assert.deepEqual(await checkDirectory(home), { kind: "ready", exists: true });
  const filePath = path.join(home, "not-a-folder");
  await writeFile(filePath, "file");
  assert.deepEqual(await checkDirectory(filePath), {
    kind: "error",
    message: "path is not a directory",
  });
});

