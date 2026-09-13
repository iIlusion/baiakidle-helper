import { describe, expect, test } from "vitest";
import { defaults, loadSettings, STORAGE_KEY } from "./settings";

function storage(value: string): Storage {
  return {
    getItem: () => value,
    setItem: () => undefined,
    removeItem: () => undefined,
    clear: () => undefined,
    key: () => null,
    length: 0
  } as Storage;
}

describe("Auto Boss settings", () => {
  test("keeps a safe disabled runtime default", () => {
    expect(defaults.autoBoss).toBe(false);
    expect(defaults.autoBossOnReset).toBe(false);
    expect(defaults.autoBossIds).toEqual([]);
    expect(defaults.autoBossLastResult).toBe("");
  });

  test("validates queue and runtime fields while preserving the legacy key", () => {
    const loaded = loadSettings(storage(JSON.stringify({
      autoBoss: true,
      autoBossIds: ["shadowpelt", "missing", "shadowpelt", "grand_master_oberon"],
      autoBossIndex: 999,
      autoBossLastResult: "bad",
      autoBossResults: { shadowpelt: "win", missing: "lose", grand_master_oberon: "lose" }
    })));

    expect(STORAGE_KEY).toBe("baiakidle-helper-v1");
    expect(loaded.autoBoss).toBe(true);
    expect(loaded.autoBossIds).toEqual(["shadowpelt", "oberon"]);
    expect(loaded.autoBossIndex).toBe(2);
    expect(loaded.autoBossLastResult).toBe("");
    expect(loaded.autoBossResults).toEqual({ shadowpelt: "win", oberon: "lose" });
  });
});
