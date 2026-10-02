import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { APP_NAME, COMMAND_NAME, saveSettings, resolveDataDirectory, checkDirectory } from "./settings.js";

export async function configureDataDirectory(settings, { input = stdin, output = stdout } = {}) {
  const rl = createInterface({ input, output });
  const answers = rl[Symbol.asyncIterator]();
  let interrupted = false;
  rl.on("SIGINT", () => {
    interrupted = true;
    rl.close();
  });

  const ask = async (prompt) => {
    output.write(prompt);
    const answer = await answers.next();
    if (answer.done) {
      const error = new Error(interrupted ? "Setup cancelled." : "Setup ended before confirmation.");
      error.code = interrupted ? "SETUP_CANCELLED" : "SETUP_INCOMPLETE";
      throw error;
    }
    return answer.value.trim();
  };
  try {
    output.write([
      `${APP_NAME} setup`,
      "Choose where your decks and study progress live.",
      `Deck JSON stays yours; ${APP_NAME} writes progress/ and .server.lock in this folder.`,
      "No sample deck will be copied and existing decks will not be changed.",
      "Changing an existing setup only changes the saved path; it does not move files.",
      `Settings: ${settings.filePath}`,
      settings.source === "FLASHCARDS_DIR"
        ? "FLASHCARDS_DIR is set and will override this saved location until it is unset."
        : "",
      "",
    ].filter(Boolean).join("\n") + "\n");

    let dataDirectory;
    while (!dataDirectory) {
      const entered = await ask(`App data folder [${settings.dataDirectory}]: `);
      const candidate = resolveDataDirectory(entered || settings.dataDirectory);
      const check = await checkDirectory(candidate);
      if (check.kind === "error") {
        output.write(`  Cannot use ${candidate}: ${check.message}. Choose another path.\n`);
        continue;
      }
      dataDirectory = candidate;
    }

    output.write(`\nSave app data to: ${dataDirectory}\n`);
    let confirmation;
    while (confirmation === undefined) {
      const answer = (await ask("Save this location? [Y/n]: ")).toLowerCase();
      if (!answer || ["y", "yes"].includes(answer)) confirmation = true;
      else if (["n", "no"].includes(answer)) confirmation = false;
      else output.write("Please enter yes or no.\n");
    }
    if (!confirmation) {
      output.write("Setup cancelled. Settings were not changed.\n");
      return false;
    }

    await saveSettings(dataDirectory, settings.filePath);
    output.write(`Saved settings: ${settings.filePath}\nNext: ${COMMAND_NAME} doctor, then ${COMMAND_NAME}\n`);
    return true;
  } catch (error) {
    if (interrupted || error.code === "SETUP_CANCELLED") {
      output.write("Setup cancelled. Settings were not changed.\n");
      return false;
    }
    if (error.code === "SETUP_INCOMPLETE") {
      throw new Error(`Setup ended before confirmation. Settings were not changed. Run '${COMMAND_NAME} init' to try again.`);
    }
    throw error;
  } finally {
    rl.close();
  }
}
