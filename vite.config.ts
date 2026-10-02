import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

const manifest = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
const productName = manifest.productName ?? "Flashcards";

export default defineConfig({
  define: { __PRODUCT_NAME__: JSON.stringify(productName) },
  plugins: [
    {
      name: "product-title",
      transformIndexHtml(html) {
        return html.replaceAll("%PRODUCT_NAME%", productName);
      },
    },
    react(),
    tailwindcss(),
  ],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  build: { outDir: "dist/client" },
});
