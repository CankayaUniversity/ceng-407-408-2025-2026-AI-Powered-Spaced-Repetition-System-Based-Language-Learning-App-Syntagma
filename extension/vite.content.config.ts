/**
 * Separate Vite build config for the content script.
 * Content scripts injected via manifest.json are loaded as plain <script> tags
 * (not ES modules) — they cannot use top-level `import` statements.
 * We must build the content script as IIFE (self-contained, all deps inlined).
 */
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  build: {
    outDir: "dist",
    emptyOutDir: false, // keep the other files built by the main config
    lib: {
      entry: resolve(__dirname, "src/content/index.ts"),
      formats: ["iife"],
      name: "SyntagmaContent",
      fileName: () => "content/index.js",
    },
    rollupOptions: {
      output: {
        // No code splitting for IIFE — everything inlined in one file
        inlineDynamicImports: true,
      },
    },
    minify: true,
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
});
