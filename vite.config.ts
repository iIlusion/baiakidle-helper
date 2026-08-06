import { defineConfig } from "vite";

export default defineConfig(({ mode }) => ({
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
    __BAIAKIDLE_DEV__: JSON.stringify(mode === "development")
  },
  build: {
    lib: {
      entry: "src/control.tsx",
      name: "BaiakIdleHelper",
      formats: ["iife"],
      fileName: () => mode === "development" ? "baiakidle-helper.dev.js" : "baiakidle-helper.user.js"
    },
    outDir: "dist",
    emptyOutDir: false,
    minify: true
  }
}));