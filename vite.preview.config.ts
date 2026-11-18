// Preview-only Vite config. Swaps five modules for labeled fixtures so the
// authenticated views can be rendered for visual review without Firebase.
// NEVER used for the production build (see vite.config.ts).

import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { fileURLToPath, URL } from "node:url";

const fixture = (name: string) => fileURLToPath(new URL(`./preview/fixtures/${name}.ts`, import.meta.url));

const FIXTURES: Record<string, string> = {
  "data/papers": fixture("papers"),
  "data/ledger": fixture("ledger"),
  "ai/actions": fixture("actions"),
  "ai/hybrid": fixture("hybrid"),
  "platform/auth": fixture("auth"),
};

function fixtureSwapPlugin(): Plugin {
  return {
    name: "preview-fixture-swap",
    enforce: "pre",
    resolveId(source) {
      const normalized = source.split("?")[0]?.split("#")[0]?.replace(/\.(ts|js)$/, "") ?? "";
      for (const [key, file] of Object.entries(FIXTURES)) {
        if (normalized === `../${key}` || normalized.endsWith(`/${key}`) || normalized.endsWith(`src/${key}`)) {
          return file;
        }
      }
      return null;
    },
  };
}

export default defineConfig({
  root: fileURLToPath(new URL("./preview", import.meta.url)),
  plugins: [fixtureSwapPlugin(), react()],
  build: {
    outDir: fileURLToPath(new URL("./dist-preview", import.meta.url)),
    emptyOutDir: true,
    target: "es2022",
  },
  server: {
    port: 4175,
    strictPort: true,
  },
});
