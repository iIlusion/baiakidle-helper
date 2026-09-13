import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (file: string) => readFileSync(`${root}${file}`, "utf8");

describe("public identity and update contracts", () => {
  test("uses Leviticus Extension for public identity", () => {
    const packageJson = JSON.parse(read("package.json")) as { name: string; description: string };
    expect(packageJson.name).toBe("leviticus-extension");
    expect(packageJson.description).toContain("Leviticus Extension");
    expect(read("scripts/add-userscript-banner.mjs")).toContain("@name Leviticus Extension");
    expect(read("scripts/add-userscript-banner.mjs")).toContain("@name Leviticus Extension DEV");
    expect(read("vite.config.ts")).toContain('name: "LeviticusExtension"');
  });

  test("keeps updater, artifact, namespace, storage, and dev-loader contracts", () => {
    const banner = read("scripts/add-userscript-banner.mjs");
    expect(banner).toContain("@namespace baiakidle-helper");
    expect(banner).toContain("github.com/iIlusion/baiakidle-helper");
    expect(banner).toContain("releases/latest/download/baiakidle-helper.user.js");
    expect(read("src/automation/settings.ts")).toContain('STORAGE_KEY = "baiakidle-helper-v1"');
    expect(read("scripts/add-userscript-banner.mjs")).toContain("dist/baiakidle-helper.dev.user.js");
    expect(read("vite.config.ts")).toContain('"baiakidle-helper.user.js"');
  });
});
