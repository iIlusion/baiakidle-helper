import { describe, expect, test } from "vitest";
import { defaults, type Settings } from "./settings";
import {
  AUTO_BOSS_MIN_STAMINA_MINUTES,
  AutoBossRunner,
  maybeStartAtMidnight,
} from "./auto-boss";
import type { BossRoomSnapshot } from "./room-state";

function snapshot(overrides: Partial<BossRoomSnapshot> = {}): BossRoomSnapshot {
  return {
    ready: true,
    mode: "city",
    huntId: "",
    activeBossId: "",
    bossChargesLeft: 20,
    bossChargesMax: 20,
    bossCooldowns: {},
    bossKills: {},
    level: 250,
    staminaMinutes: 200,
    dead: false,
    ...overrides
  };
}

function settings(overrides: Partial<Settings> = {}): Settings {
  return {
    ...defaults,
    autoBoss: true,
    autoBossIds: ["shadowpelt", "bloodback"],
    ...overrides
  };
}

describe("AutoBossRunner", () => {
  test("waits for state, stamina and charges before entering the next eligible boss", () => {
    const sent: string[] = [];
    const runner = new AutoBossRunner({
      sendCityPresence: away => {
        sent.push(`city:${away}`);
        return true;
      },
      sendBoss: (id, fromCity) => {
        sent.push(`boss:${id}:${fromCity}`);
        return true;
      }
    });
    let config = settings();
    const persist = (patch: Partial<Settings>) => { config = { ...config, ...patch }; };

    runner.tick(config, undefined, persist, 0);
    expect(runner.view(config, undefined).phase).toBe("waiting-state");

    const lowStamina = snapshot({ staminaMinutes: AUTO_BOSS_MIN_STAMINA_MINUTES - 1 });
    runner.tick(config, lowStamina, persist, 1);
    expect(runner.view(config, lowStamina).phase).toBe("waiting-stamina");
    expect(sent).toEqual([]);

    const noCharges = snapshot({ bossChargesLeft: 0 });
    runner.tick(config, noCharges, persist, 2);
    expect(runner.view(config, noCharges).phase).toBe("waiting-charges");
    expect(sent).toEqual([]);

    runner.tick(config, snapshot(), persist, 6_000);
    expect(sent).toEqual(["city:false", "boss:shadowpelt:true"]);
    expect(runner.view(config, snapshot()).phase).toBe("entering");
  });

  test("skips a level-locked or cooling-down boss", () => {
    const sent: string[] = [];
    const runner = new AutoBossRunner({
      sendCityPresence: () => true,
      sendBoss: id => { sent.push(id); return true; }
    });
    const config = settings({ autoBossIds: ["shadowpelt", "bloodback"] });
    runner.tick(config, snapshot({ level: 10, bossCooldowns: { shadowpelt: 5_000 } }), () => undefined, 1_000);
    expect(sent).toEqual([]);
    expect(runner.view(config, snapshot({ level: 10, bossCooldowns: { shadowpelt: 5_000 } })).phase)
      .toBe("completed");
  });

  test("waits for result confirmation after leaving and advances the queue", () => {
    const runner = new AutoBossRunner({ sendCityPresence: () => true, sendBoss: () => true });
    let config = settings({ autoBossIds: ["shadowpelt", "bloodback"] });
    const persist = (patch: Partial<Settings>) => { config = { ...config, ...patch }; };
    const inside = snapshot({ mode: "boss", activeBossId: "shadowpelt", bossKills: { shadowpelt: 3 } });
    runner.tick(config, inside, persist, 1_000);
    expect(config.autoBossFighting).toBe("shadowpelt");

    const left = snapshot({ bossKills: { shadowpelt: 3 } });
    runner.tick(config, left, persist, 2_000);
    expect(runner.view(config, left).phase).toBe("confirming-result");
    runner.tick(config, left, persist, 6_000);
    expect(config.autoBossResults).toEqual({ shadowpelt: "lose" });
    expect(config.autoBossIndex).toBe(1);
  });

  test("restores an in-flight boss after a reload", () => {
    const runner = new AutoBossRunner({ sendCityPresence: () => true, sendBoss: () => true });
    const config = settings({
      autoBossFighting: "bloodback",
      autoBossIndex: 1,
      autoBossKillsAtEnter: 8
    });
    const state = snapshot({ mode: "boss", activeBossId: "bloodback", bossKills: { bloodback: 8 } });
    runner.tick(config, state, () => undefined, 10_000);
    expect(runner.view(config, state)).toMatchObject({ phase: "fighting", currentId: "bloodback", index: 1 });
  });
});

describe("midnight schedule", () => {
  test("starts once per Brasilia date and waits for stamina", () => {
    const beforeMidnight = Date.parse("2026-09-13T02:59:59.000Z");
    const daily = { autoBossOnReset: true, autoBossDay: "2026-09-11" };
    expect(maybeStartAtMidnight(settings({ ...daily }), snapshot({ staminaMinutes: 89 }), beforeMidnight))
      .toBeNull();
    expect(maybeStartAtMidnight(settings({ ...daily }), snapshot(), beforeMidnight))
      .toMatchObject({ autoBoss: true, autoBossIndex: 0, autoBossDay: "2026-09-12" });

    const midnight = Date.parse("2026-09-13T03:00:00.000Z");
    expect(maybeStartAtMidnight(settings({ autoBossOnReset: true, autoBossDay: "2026-09-12" }), snapshot(), midnight))
      .toMatchObject({ autoBoss: true, autoBossIndex: 0, autoBossDay: "2026-09-13" });
    expect(maybeStartAtMidnight(settings({ autoBossOnReset: true, autoBossDay: "2026-09-13" }), snapshot(), midnight)).toBeNull();
  });
});
