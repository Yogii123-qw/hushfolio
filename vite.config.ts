import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // Project site on GitHub Pages: https://yogii123-qw.github.io/hushfolio/
  // Assets must resolve under /hushfolio/, not the domain root.
  base: "/hushfolio/",
  build: {
    sourcemap: false,
    target: "es2022",
    chunkSizeWarningLimit: 600,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
