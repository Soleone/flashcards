import type { IncomingMessage, ServerResponse } from "node:http";
import { ZodError } from "zod";
import { scanDecks } from "./decks.ts";
import { ProgressStore, StudyError } from "./progress.ts";

async function jsonBody(request: IncomingMessage): Promise<unknown> {
  if (!request.headers["content-type"]?.startsWith("application/json"))
    throw new StudyError("Expected application/json.", 415);
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > 8192) throw new StudyError("Request exceeds 8 KB.", 413);
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString());
  } catch {
    throw new StudyError("Invalid JSON request.");
  }
}

export function apiHandler(store: ProgressStore) {
  return async (
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> => {
    const send = (status: number, body: unknown) => {
      response.writeHead(status, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      response.end(JSON.stringify(body));
    };
    try {
      const path = new URL(request.url ?? "/", "http://localhost").pathname;
      if (path === "/api/decks" && request.method === "GET") {
        send(200, (await scanDecks(store.directory)).catalog);
        return;
      }
      const match = /^\/api\/decks\/([a-zA-Z0-9_-]+)(\/reviews)?$/.exec(path);
      if (!match) throw new StudyError("API route not found.", 404);
      if (request.method === "GET" && !match[2])
        send(200, await store.study(match[1]));
      else if (request.method === "POST" && match[2])
        send(
          200,
          await store.review(
            match[1],
            (await jsonBody(request)) as Parameters<ProgressStore["review"]>[1],
          ),
        );
      else throw new StudyError("Method not allowed.", 405);
    } catch (error) {
      if (error instanceof StudyError)
        send(error.status, { error: error.message });
      else if (error instanceof ZodError)
        send(400, {
          error:
            "Invalid deck, progress, or review data. Check the JSON format.",
          details: error.issues,
        });
      else {
        console.error(error);
        send(500, {
          error:
            "Could not read or save local data. Check the server log and file permissions, then retry.",
        });
      }
    }
  };
}
