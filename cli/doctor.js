import { readFile } from "node:fs/promises";
import path from "node:path";
import { APP_NAME, COMMAND_NAME, checkDirectory } from "./settings.js";

async function checkLock(directory) {
  let contents;
  try {
    contents = await readFile(path.join(directory, ".server.lock"), "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return { kind: "none" };
    return { kind: "error", message: error.message };
  }

  const pid = Number(contents.trim());
  if (!Number.isInteger(pid) || pid <= 0) {
    return { kind: "invalid", message: "lock file does not contain a valid process ID" };
  }
  try {
    process.kill(pid, 0);
    return { kind: "active", pid };
  } catch (error) {
    if (error.code === "ESRCH") return { kind: "stale", pid };
    if (error.code === "EPERM") return { kind: "active", pid };
    return { kind: "error", message: error.message };
  }
}

export async function runDoctor(settings, { log = console.log, error = console.error } = {}) {
  let issues = 0;
  let warnings = 0;
  log(`${APP_NAME} doctor`);
  log(`Settings: ${settings.filePath}${settings.configured ? " (saved)" : " (not saved)"}`);
  log(`Data directory: ${settings.dataDirectory}${settings.source === "FLASHCARDS_DIR" ? " (FLASHCARDS_DIR override)" : ""}`);
  if (!settings.configured && settings.source !== "FLASHCARDS_DIR") {
    log(`INFO  Run '${COMMAND_NAME} init' to choose and save a different folder.`);
  }

  const directory = await checkDirectory(settings.dataDirectory);
  if (directory.kind === "ready") {
    log("OK    Directory exists and is readable/writable.");
  } else if (directory.kind === "will-create") {
    log(`OK    Directory does not exist yet; it can be created from ${directory.parent} on first launch.`);
  } else {
    error(`FIX   ${directory.message}. Run '${COMMAND_NAME} init' to choose another folder.`);
    issues++;
  }

  if (directory.kind !== "error" && directory.exists) {
    const lock = await checkLock(settings.dataDirectory);
    if (lock.kind === "active") {
      log(`WARN  Another ${APP_NAME} server may already be using this folder (PID ${lock.pid}).`);
      warnings++;
    } else if (lock.kind === "stale") {
      log(`WARN  Stale server lock for PID ${lock.pid}; startup will reclaim it.`);
      warnings++;
    } else if (lock.kind === "invalid") {
      error(`FIX   ${lock.message}. Inspect ${path.join(settings.dataDirectory, ".server.lock")} before changing it.`);
      issues++;
    } else if (lock.kind === "error") {
      error(`FIX   Could not inspect the server lock: ${lock.message}.`);
      issues++;
    } else {
      log("OK    No server lock is present.");
    }
  }

  if (issues) {
    error(`\n${issues} issue${issues === 1 ? "" : "s"} to fix. Run '${COMMAND_NAME} doctor' again after making changes.`);
    return 1;
  }
  log(`\nChecks passed${warnings ? ` with ${warnings} warning${warnings === 1 ? "" : "s"}` : ""}. Next: ${COMMAND_NAME}`);
  return 0;
}
