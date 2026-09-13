import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

function productionTypeScriptFiles(root: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) files.push(...productionTypeScriptFiles(path));
    else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) files.push(path);
  }
  return files;
}

describe("native Auto Boss boundary", () => {
  test("production TypeScript never embeds native automation contracts", () => {
    const forbidden = [
      ["auto", "boss"].join(""),
      ["auto", "boss", "list"].join(""),
      ["auto", "boss", "preset"].join(""),
      ["auto", "boss", "state"].join("")
    ];
    const source = productionTypeScriptFiles(fileURLToPath(new URL(".", import.meta.url)))
      .map(file => readFileSync(file, "utf8"))
      .join("\n");
    for (const contract of forbidden) {
      expect(source).not.toMatch(new RegExp("[\"']" + contract + "[\"']", "i"));
    }
  });
});
