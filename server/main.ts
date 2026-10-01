import { createServer } from "node:http";
import { mkdir, open, readFile, unlink, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve, join, extname, sep } from "node:path";
import { createServer as createViteServer } from "vite";
import { apiHandler } from "./http.ts";
import { ProgressStore } from "./progress.ts";

const directory = resolve(
  process.env.FLASHCARDS_DIR ??
    join(process.env.DATA ?? join(homedir(), "data"), "apps/flashcards"),
);
const port = Number(process.env.PORT ?? 4310);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("PORT must be an integer between 1 and 65535.");
await mkdir(directory, { recursive: true });
const lockPath = join(directory, ".server.lock");
try {
  const pid = Number(await readFile(lockPath, "utf8"));
  if (!Number.isInteger(pid) || pid <= 0)
    throw new Error(
      `Invalid lock file: ${lockPath}. Inspect it before removing it.`,
    );
  try {
    process.kill(pid, 0);
    throw new Error(
      `Another server (PID ${pid}) owns ${directory}. Stop it before starting another.`,
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
  }
  await unlink(lockPath);
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}
const lock = await open(lockPath, "wx", 0o600);
await lock.writeFile(String(process.pid));
await lock.close();

const production = process.argv.includes("--production");
const api = apiHandler(new ProgressStore(directory));
const root = resolve("dist");
const types: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".ico": "image/x-icon",
};
const server = createServer();
let vite: Awaited<ReturnType<typeof createViteServer>> | undefined;

async function cleanup() {
  await vite?.close();
  await unlink(lockPath).catch((error) => {
    if (error.code !== "ENOENT") throw error;
  });
}

try {
  if (!production)
    vite = await createViteServer({
      server: { middlewareMode: true, hmr: { server } },
      appType: "spa",
    });
  else await stat(join(root, "index.html"));
  server.on("request", (request, response) => {
    const host = request.headers.host;
    const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
    if (
      !host ||
      !allowedHosts.has(host) ||
      (request.headers.origin &&
        ![`http://127.0.0.1:${port}`, `http://localhost:${port}`].includes(
          request.headers.origin,
        ))
    ) {
      response.writeHead(403);
      response.end("Local same-origin requests only.");
      return;
    }
    if (request.url?.startsWith("/api/")) {
      void api(request, response);
      return;
    }
    if (vite) {
      vite.middlewares(request, response);
      return;
    }
    void (async () => {
      try {
        if (request.method !== "GET" && request.method !== "HEAD") {
          response.writeHead(405);
          response.end();
          return;
        }
        const pathname = decodeURIComponent(
          new URL(request.url ?? "/", "http://localhost").pathname,
        );
        const file = resolve(
          root,
          `.${pathname === "/" ? "/index.html" : pathname}`,
        );
        if (!file.startsWith(root + sep)) {
          response.writeHead(403);
          response.end();
          return;
        }
        const bytes = await readFile(file);
        response.writeHead(200, {
          "Content-Type": types[extname(file)] ?? "application/octet-stream",
          "X-Content-Type-Options": "nosniff",
        });
        response.end(request.method === "HEAD" ? undefined : bytes);
      } catch (error) {
        response.writeHead(
          (error as NodeJS.ErrnoException).code === "ENOENT" ? 404 : 500,
        );
        response.end("Could not serve this file.");
      }
    })();
  });
  await new Promise<void>((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolveListen);
  });
} catch (error) {
  await cleanup();
  throw error;
}

console.log(`Flashcards: http://localhost:${port}\nDecks: ${directory}`);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => {
    server.close(() => {
      void cleanup().then(() => process.exit(0));
    });
    server.closeAllConnections();
  });
