import { describe, expect, test } from "vitest";
import {
  BOSSES,
  bossById,
  brasiliaDateKey,
  parseAutoBossIds,
  sortBossesByLevel
} from "./bosses";

describe("boss catalog", () => {
  test("looks up stable ids and boss keys", () => {
    expect(BOSSES.length).toBeGreaterThan(50);
    expect(bossById("shadowpelt")?.name).toBe("Shadowpelt");
    expect(bossById("grand_master_oberon")?.id).toBe("oberon");
  });

  test("normalizes a persisted queue without duplicates or unknown ids", () => {
    expect(parseAutoBossIds(["shadowpelt", "shadowpelt", "missing", " grand_master_oberon "]))
      .toEqual(["shadowpelt", "oberon"]);
  });

  test("sorts by level and name without mutating the source", () => {
    const input = [
      { ...BOSSES.find(boss => boss.id === "bloodback")!, minLevel: 15 },
      { ...BOSSES.find(boss => boss.id === "shadowpelt")!, minLevel: 5 }
    ];
    expect(sortBossesByLevel(input).map(boss => boss.id)).toEqual(["shadowpelt", "bloodback"]);
    expect(input[0].id).toBe("bloodback");
  });

  test("uses the Brasilia civil date", () => {
    expect(brasiliaDateKey(Date.parse("2026-09-13T02:30:00.000Z"))).toBe("2026-09-12");
    expect(brasiliaDateKey(Date.parse("2026-09-13T03:00:00.000Z"))).toBe("2026-09-13");
  });
});
