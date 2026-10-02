import { readFileSync } from "node:fs";
import { access, mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

const manifest = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);

export const APP_ID = manifest.appId ?? manifest.name.split("/").at(-1);
export const APP_NAME = manifest.productName ?? APP_ID.replace(/[-_]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
export const COMMAND_NAME = Object.keys(manifest.bin ?? {})[0] ?? APP_ID;
export const APP_VERSION = manifest.version;

function expandPath(value, home) {
  if (value === "~") return home;
  if (value.startsWith("~/")) return path.join(home, value.slice(2));
  return path.resolve(value);
}

export function settingsFilePath({ platform = process.platform, env = process.env, home = homedir() } = {}) {
  if (env.FLASHCARDS_CONFIG_PATH) return expandPath(env.FLASHCARDS_CONFIG_PATH, home);

  if (platform === "win32") {
    return path.join(env.APPDATA || path.join(home, "AppData", "Roaming"), APP_ID, "settings.json");
  }
  if (platform === "darwin") {
    return path.join(home, "Library", "Application Support", APP_ID, "settings.json");
  }
  return path.join(env.XDG_CONFIG_HOME || path.join(home, ".config"), APP_ID, "settings.json");
}

export function defaultDataDirectory({ platform = process.platform, env = process.env, home = homedir() } = {}) {
  if (platform === "win32") {
    return path.join(env.LOCALAPPDATA || path.join(home, "AppData", "Local"), APP_ID);
  }
  if (platform === "darwin") {
    return path.join(home, "Library", "Application Support", APP_ID);
  }
  return path.join(env.XDG_DATA_HOME || path.join(home, ".local", "share"), APP_ID);
}

export function resolveDataDirectory(value, home = homedir()) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("The app data directory must be a non-empty path.");
  }
  return expandPath(value.trim(), home);
}

export async function loadSettings(options = {}) {
  const env = options.env ?? process.env;
  const home = options.home ?? homedir();
  const filePath = options.filePath ?? settingsFilePath({
    platform: options.platform,
    env,
    home,
  });
  let stored = {};
  let configured = false;

  try {
    stored = JSON.parse(await readFile(filePath, "utf8"));
    configured = true;
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw new Error(`Could not read settings at ${filePath}: ${error.message}`);
    }
  }

  if (!stored || typeof stored !== "object" || Array.isArray(stored)) {
    throw new Error(`Settings at ${filePath} must contain a JSON object.`);
  }
  if (stored.version !== undefined && stored.version !== 1) {
    throw new Error(`Unsupported settings version: ${stored.version}`);
  }
  if (stored.dataDirectory !== undefined && (typeof stored.dataDirectory !== "string" || !stored.dataDirectory.trim())) {
    throw new Error("The saved app data directory must be a non-empty path string.");
  }

  const savedDataDirectory = stored.dataDirectory
    ? resolveDataDirectory(stored.dataDirectory, home)
    : defaultDataDirectory({ platform: options.platform, env, home });
  const environmentDirectory = env.FLASHCARDS_DIR?.trim();
  const dataDirectory = environmentDirectory
    ? resolveDataDirectory(environmentDirectory, home)
    : savedDataDirectory;

  return {
    filePath,
    configured: configured && Boolean(stored.dataDirectory),
    dataDirectory,
    savedDataDirectory,
    source: environmentDirectory ? "FLASHCARDS_DIR" : configured ? "settings" : "default",
  };
}

export async function saveSettings(dataDirectory, filePath = settingsFilePath()) {
  const persisted = {
    version: 1,
    dataDirectory: resolveDataDirectory(dataDirectory),
  };
  await mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const temporary = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(persisted, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    });
    await rename(temporary, filePath);
  } finally {
    await unlink(temporary).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
  return filePath;
}

export async function checkDirectory(directory) {
  try {
    const info = await stat(directory);
    if (!info.isDirectory()) return { kind: "error", message: "path is not a directory" };
    await access(directory, constants.R_OK | constants.W_OK | constants.X_OK);
    return { kind: "ready", exists: true };
  } catch (error) {
    if (error.code !== "ENOENT") {
      return { kind: "error", message: error.message };
    }
  }

  let parent = path.dirname(directory);
  while (true) {
    try {
      const info = await stat(parent);
      if (!info.isDirectory()) return { kind: "error", message: `${parent} is not a directory` };
      await access(parent, constants.W_OK | constants.X_OK);
      return { kind: "will-create", parent };
    } catch (error) {
      if (error.code !== "ENOENT") return { kind: "error", message: `${parent}: ${error.message}` };
      const next = path.dirname(parent);
      if (next === parent) return { kind: "error", message: "no writable parent directory was found" };
      parent = next;
    }
  }
}
