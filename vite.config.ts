import { defineConfig } from "vite";
import { readFileSync } from "node:fs";

const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string };

export default defineConfig(({ mode }) => ({
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
    __BAIAKIDLE_DEV__: JSON.stringify(mode === "development"),
    __LEVITICUS_VERSION__: JSON.stringify(version)
  },
  build: {
    lib: {
      entry: "src/control.tsx",
      name: "LeviticusExtension",
      formats: ["iife"],
      fileName: () => mode === "development" ? "baiakidle-helper.dev.js" : "baiakidle-helper.user.js"
    },
    outDir: "dist",
    emptyOutDir: false,
    minify: true
  }
}));
