#!/usr/bin/env node
import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { stdin, stdout } from "node:process";
import { runDoctor } from "../cli/doctor.js";
import { configureDataDirectory } from "../cli/setup.js";
import {
  APP_NAME,
  APP_VERSION,
  COMMAND_NAME,
  loadSettings,
} from "../cli/settings.js";

const usage = `Usage: ${COMMAND_NAME} [command]

Commands:
  (no command)  Start the local app
  init          Choose the decks and study-progress folder
  doctor        Check the saved app-data path and server lock
  help          Show this help
  --version     Show the installed version

Options:
  start --no-open  Start without opening a browser

Settings live in the platform config directory. Decks and progress default to
XDG_DATA_HOME or ~/.local/share on Linux. FLASHCARDS_DIR overrides the saved path.
`;

function openBrowser(url) {
  const [command, args] = process.platform === "darwin"
    ? ["open", [url]]
    : process.platform === "win32"
      ? ["cmd", ["/c", "start", "", url]]
      : ["xdg-open", [url]];
  const child = spawn(command, args, { detached: true, stdio: "ignore", windowsHide: true });
  child.once("error", () => {
    console.log(`Could not open a browser automatically. Visit ${url}`);
  });
  child.unref();
}

async function startServer(settings, { open = true } = {}) {
  const port = Number(process.env.PORT ?? 4310);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535.");
  }
  const serverPath = new URL("../dist/server.js", import.meta.url);
  try {
    await access(fileURLToPath(serverPath));
  } catch {
    throw new Error(`Built app files are missing. From the project, run 'pnpm build' first.`);
  }

  process.env.FLASHCARDS_DIR = settings.dataDirectory;
  process.argv.push("--production");
  await import(serverPath.href);
  if (open) openBrowser(`http://localhost:${port}`);
}

async function main(args) {
  if (["--version", "-v"].includes(args[0])) {
    console.log(`${APP_NAME} ${APP_VERSION}`);
    return 0;
  }

  let [command, ...options] = args;
  if (!command || command.startsWith("-")) {
    options = command ? [command, ...options] : options;
    command = "start";
  }

  if (command === "help" || options.includes("--help")) {
    console.log(usage);
    return 0;
  }
  const settings = await loadSettings();
  if (command === "init") {
    if (options.length) throw new Error(`Usage: ${COMMAND_NAME} init`);
    await configureDataDirectory(settings);
    return 0;
  }
  if (command === "doctor") {
    if (options.length) throw new Error(`Usage: ${COMMAND_NAME} doctor`);
    return runDoctor(settings);
  }
  if (command !== "start") {
    throw new Error(`Unknown command '${command}'. Run '${COMMAND_NAME} help'.`);
  }

  const open = !options.includes("--no-open");
  if (options.some((option) => option !== "--no-open")) {
    throw new Error(`Unknown start option. Run '${COMMAND_NAME} help'.`);
  }
  if (!settings.configured && settings.source !== "FLASHCARDS_DIR") {
    if (!stdin.isTTY || !stdout.isTTY) {
      throw new Error(`No data folder is configured. Run '${COMMAND_NAME} init' in a terminal, or set FLASHCARDS_DIR.`);
    }
    if (!await configureDataDirectory(settings)) return 0;
    return startServer(await loadSettings(), { open });
  }
  return startServer(settings, { open });
}

main(process.argv.slice(2)).then((status) => {
  process.exitCode = status;
}).catch((error) => {
  console.error(`${COMMAND_NAME}: ${error.message}`);
  process.exitCode = 1;
});
