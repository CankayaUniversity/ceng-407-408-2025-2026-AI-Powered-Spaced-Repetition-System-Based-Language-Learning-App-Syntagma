import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve } from "path";
import { copyFileSync, mkdirSync, existsSync, readdirSync, statSync } from "fs";
import { join } from "path";

// Plugin to copy static extension assets after build
function copyExtensionAssets() {
  return {
    name: "copy-extension-assets",
    closeBundle() {
      const root = __dirname;
      const dist = join(root, "dist");

      // Copy manifest.json
      copyFileSync(join(root, "manifest.json"), join(dist, "manifest.json"));

      // Copy src/assets/ → dist/assets/
      const assetsDir = join(root, "src", "assets");
      const distAssetsDir = join(dist, "assets");
      if (existsSync(assetsDir)) {
        if (!existsSync(distAssetsDir)) mkdirSync(distAssetsDir, { recursive: true });
        for (const file of readdirSync(assetsDir)) {
          if (statSync(join(assetsDir, file)).isFile()) {
            copyFileSync(join(assetsDir, file), join(distAssetsDir, file));
          }
        }
      }

      // Copy icons/ → dist/icons/ (if present)
      const iconsDir = join(root, "icons");
      const distIconsDir = join(dist, "icons");
      if (existsSync(iconsDir)) {
        if (!existsSync(distIconsDir)) mkdirSync(distIconsDir, { recursive: true });
        for (const file of readdirSync(iconsDir)) {
          if (statSync(join(iconsDir, file)).isFile()) {
            copyFileSync(join(iconsDir, file), join(distIconsDir, file));
          }
        }
      }

      // Copy dictionary.json → dist/dictionary.json (if present at extension root)
      const dictSrc = join(root, "dictionary.json");
      if (existsSync(dictSrc)) {
        copyFileSync(dictSrc, join(dist, "dictionary.json"));
      }
    },
  };
}

export default defineConfig(({ command }) => {
  if (command === "build") {
    return {
      plugins: [react(), copyExtensionAssets()],
      build: {
        outDir: "dist",
        emptyOutDir: true,
        rollupOptions: {
          input: {
            // Popup and options are extension pages — ES modules work fine there
            popup: resolve(__dirname, "popup.html"),
            options: resolve(__dirname, "options.html"),
            "card-creator": resolve(__dirname, "card-creator.html"),
            auth: resolve(__dirname, "auth.html"),
            reader: resolve(__dirname, "reader.html"),
            // Background service worker — MV3 service workers support ES modules
            "background/service-worker": resolve(
              __dirname,
              "src/background/service-worker.ts"
            ),
            // NOTE: content/index is built separately via vite.content.config.ts as IIFE
          },
          output: {
            entryFileNames: (chunkInfo) => {
              if (chunkInfo.name.includes("/")) {
                return `${chunkInfo.name}.js`;
              }
              return `[name].js`;
            },
            chunkFileNames: "chunks/[name]-[hash].js",
            assetFileNames: "assets/[name]-[hash][extname]",
          },
        },
      },
      resolve: {
        alias: {
          "@": resolve(__dirname, "src"),
        },
      },
    };
  }

  // dev / test mode
  return {
    plugins: [react()],
    test: {
      globals: true,
      environment: "jsdom",
      setupFiles: "./vitest.setup.ts",
    },
    resolve: {
      alias: {
        "@": resolve(__dirname, "src"),
      },
    },
  };
});
