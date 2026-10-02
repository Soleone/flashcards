import { rm } from "node:fs/promises";
import { build as buildServer } from "esbuild";
import { build as buildClient } from "vite";

await rm("dist", { recursive: true, force: true });
await buildClient();
await buildServer({
  entryPoints: ["server/main.ts"],
  outfile: "dist/server.js",
  bundle: true,
  packages: "external",
  platform: "node",
  format: "esm",
  target: "node22",
});
