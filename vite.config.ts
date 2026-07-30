import { defineConfig } from "vite";

export default defineConfig({
  define: {
    "process.env.NODE_ENV": JSON.stringify("production")
  },
  build: {
    lib: {
      entry: "src/control.tsx",
      name: "BaiakIdleHelper",
      formats: ["iife"],
      fileName: () => "baiakidle-helper.user.js"
    },
    outDir: "dist",
    emptyOutDir: false,
    minify: true
  }
});