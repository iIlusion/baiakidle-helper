import { bossById, brasiliaDateKey, parseAutoBossIds } from "../data/bosses";
import type { BossRoomSnapshot } from "./room-state";
import type { Settings } from "./settings";

export const AUTO_BOSS_MIN_STAMINA_MINUTES = 90;
const ENTER_GAP_MS = 6_000;
const RESULT_WAIT_MS = 4_000;

export type AutoBossPhase =
  | "stopped"
  | "waiting-state"
  | "waiting-stamina"
  | "waiting-charges"
  | "selecting"
  | "entering"
  | "fighting"
  | "confirming-result"
  | "completed";

export type AutoBossView = {
  phase: AutoBossPhase;
  currentId: string;
  index: number;
  total: number;
  chargesLeft: number | null;
  chargesMax: number;
  staminaMinutes: number;
  results: Record<string, "win" | "lose">;
};

export type AutoBossRunnerDeps = {
  sendBoss: (bossId: string, fromCity: boolean) => boolean;
  sendCityPresence: (away: boolean) => boolean;
};

type Persist = (patch: Partial<Settings>) => void;

function sameBoss(left: string, right: string): boolean {
  const a = bossById(left);
  const b = bossById(right);
  return a && b ? a.id === b.id : left === right;
}

function canonicalBossId(id: string): string {
  return bossById(id)?.id ?? id;
}

function inBossRoom(snapshot: BossRoomSnapshot, id: string): boolean {
  if (snapshot.mode !== "boss") return false;
  return sameBoss(snapshot.activeBossId || snapshot.huntId, id);
}

function killCount(snapshot: BossRoomSnapshot, id: string): number {
  const boss = bossById(id);
  if (!boss) return snapshot.bossKills[id] ?? 0;
  return snapshot.bossKills[boss.id] ?? snapshot.bossKills[boss.bossKey] ?? 0;
}

function nextEligibleIndex(
  ids: string[],
  settingsIndex: number,
  snapshot: BossRoomSnapshot,
  now: number
): number {
  let index = Math.max(0, Math.floor(settingsIndex || 0));
  while (index < ids.length) {
    const boss = bossById(ids[index]!);
    if (!boss || snapshot.level < boss.minLevel) {
      index += 1;
      continue;
    }
    const cooldown = snapshot.bossCooldowns[boss.id] ?? snapshot.bossCooldowns[boss.bossKey] ?? 0;
    if (cooldown > now && !inBossRoom(snapshot, boss.id)) {
      index += 1;
      continue;
    }
    return index;
  }
  return index;
}

function mergeResult(
  previous: Record<string, "win" | "lose">,
  id: string,
  result: "win" | "lose"
): Record<string, "win" | "lose"> {
  return { ...previous, [canonicalBossId(id)]: result };
}

export function staminaReadyForBoss(minutes: number): boolean {
  return minutes >= AUTO_BOSS_MIN_STAMINA_MINUTES;
}

export class AutoBossRunner {
  private phase: AutoBossPhase = "stopped";
  private enteringId = "";
  private fightingId = "";
  private killsAtEnter = 0;
  private leftAt = 0;
  private lastEnterAt = 0;
  private currentId = "";

  constructor(private readonly deps: AutoBossRunnerDeps) {}

  tick(
    settings: Settings,
    snapshot: BossRoomSnapshot | undefined,
    persist: Persist,
    now = Date.now()
  ): boolean {
    if (!settings.autoBoss) {
      this.phase = "stopped";
      this.enteringId = "";
      return false;
    }

    const ids = parseAutoBossIds(settings.autoBossIds);
    if (ids.length === 0) {
      this.phase = "completed";
      this.currentId = "";
      return false;
    }
    if (!snapshot) {
      this.phase = "waiting-state";
      return false;
    }
    if (!settings.autoBossStartedAt) persist({ autoBossStartedAt: now });

    this.restore(settings);

    const inside = ids.find(id => inBossRoom(snapshot, id));
    if (inside && !this.fightingId) {
      this.fightingId = inside;
      this.currentId = inside;
      this.killsAtEnter = killCount(snapshot, inside);
      this.leftAt = 0;
      this.phase = "fighting";
      persist({
        autoBossIndex: Math.max(0, ids.findIndex(id => sameBoss(id, inside))),
        autoBossFighting: inside,
        autoBossKillsAtEnter: this.killsAtEnter
      });
      return false;
    }

    if (this.fightingId) return this.handleFighting(settings, ids, snapshot, persist, now);

    if (snapshot.dead) {
      this.phase = "waiting-state";
      return false;
    }

    if (this.enteringId) {
      this.currentId = this.enteringId;
      if (inBossRoom(snapshot, this.enteringId)) {
        this.fightingId = this.enteringId;
        this.killsAtEnter = killCount(snapshot, this.enteringId);
        this.enteringId = "";
        this.leftAt = 0;
        this.phase = "fighting";
        persist({
          autoBossFighting: this.fightingId,
          autoBossKillsAtEnter: this.killsAtEnter
        });
        return false;
      }
      if (now - this.lastEnterAt < ENTER_GAP_MS) {
        this.phase = "entering";
        return false;
      }
      this.enteringId = "";
    }

    const index = nextEligibleIndex(ids, settings.autoBossIndex, snapshot, now);
    this.currentId = ids[index] ?? "";
    if (index !== settings.autoBossIndex) persist({ autoBossIndex: index });
    if (index >= ids.length) {
      this.phase = "completed";
      persist({ autoBoss: false, autoBossIndex: 0, autoBossStartedAt: 0, autoBossFighting: "" });
      return false;
    }

    if (!staminaReadyForBoss(snapshot.staminaMinutes)) {
      this.phase = "waiting-stamina";
      return false;
    }
    if (snapshot.bossChargesLeft === null || snapshot.bossChargesLeft <= 0) {
      this.phase = "waiting-charges";
      return false;
    }
    if (now - this.lastEnterAt < ENTER_GAP_MS) {
      this.phase = "selecting";
      return false;
    }

    const fromCity = snapshot.mode === "city";
    if (fromCity && !this.deps.sendCityPresence(false)) {
      this.phase = "waiting-state";
      return false;
    }
    if (!this.deps.sendBoss(ids[index]!, fromCity)) {
      this.phase = "waiting-state";
      return false;
    }
    this.lastEnterAt = now;
    this.enteringId = ids[index]!;
    this.currentId = this.enteringId;
    this.phase = "entering";
    return true;
  }

  view(settings: Settings, snapshot: BossRoomSnapshot | undefined): AutoBossView {
    const ids = parseAutoBossIds(settings.autoBossIds);
    const currentIndex = this.currentId ? ids.findIndex(id => sameBoss(id, this.currentId)) : -1;
    return {
      phase: settings.autoBoss ? this.phase : "stopped",
      currentId: this.currentId,
      index: currentIndex >= 0 ? currentIndex : Math.min(settings.autoBossIndex, ids.length),
      total: ids.length,
      chargesLeft: snapshot?.bossChargesLeft ?? null,
      chargesMax: snapshot?.bossChargesMax ?? 20,
      staminaMinutes: snapshot?.staminaMinutes ?? 0,
      results: { ...settings.autoBossResults }
    };
  }

  isNavigating(): boolean {
    return this.phase === "entering" || this.phase === "fighting" || this.phase === "confirming-result";
  }

  private restore(settings: Settings): void {
    if (this.fightingId || !settings.autoBossFighting) return;
    this.fightingId = canonicalBossId(settings.autoBossFighting);
    this.killsAtEnter = Math.max(0, Math.floor(settings.autoBossKillsAtEnter || 0));
    this.currentId = this.fightingId;
  }

  private handleFighting(
    settings: Settings,
    ids: string[],
    snapshot: BossRoomSnapshot,
    persist: Persist,
    now: number
  ): boolean {
    this.currentId = this.fightingId;
    if (inBossRoom(snapshot, this.fightingId)) {
      this.phase = "fighting";
      this.leftAt = 0;
      return false;
    }

    const won = killCount(snapshot, this.fightingId) > this.killsAtEnter;
    if (!won && !snapshot.dead) {
      if (!this.leftAt) this.leftAt = now;
      if (now - this.leftAt < RESULT_WAIT_MS) {
        this.phase = "confirming-result";
        return false;
      }
    }

    const fought = this.fightingId;
    const result = won ? "win" : "lose";
    const index = Math.max(0, ids.findIndex(id => sameBoss(id, fought)), Math.floor(settings.autoBossIndex || 0));
    const nextIndex = index + 1;
    const completed = nextIndex >= ids.length;
    this.fightingId = "";
    this.enteringId = "";
    this.leftAt = 0;
    this.phase = completed ? "completed" : "selecting";
    persist({
      autoBossFighting: "",
      autoBossKillsAtEnter: 0,
      autoBossLastId: canonicalBossId(fought),
      autoBossLastResult: result,
      autoBossResults: mergeResult(settings.autoBossResults, fought, result),
      ...(completed
        ? { autoBoss: false, autoBossIndex: 0, autoBossStartedAt: 0 }
        : { autoBossIndex: nextIndex })
    });
    return true;
  }
}

export function autoBossClaimsNavigation(settings: Settings, runner: AutoBossRunner): boolean {
  return settings.autoBoss && runner.isNavigating();
}

export function maybeStartAtMidnight(
  settings: Settings,
  snapshot: BossRoomSnapshot | undefined,
  now = Date.now()
): Partial<Settings> | null {
  if (!settings.autoBossOnReset) return null;
  const today = brasiliaDateKey(now);
  if (!settings.autoBossDay) return { autoBossDay: today };
  if (settings.autoBossDay === today || !snapshot) return null;
  if (!staminaReadyForBoss(snapshot.staminaMinutes)) return null;
  return {
    autoBoss: true,
    autoBossIndex: 0,
    autoBossDay: today,
    autoBossStartedAt: now,
    autoBossFighting: "",
    autoBossKillsAtEnter: 0,
    autoBossLastId: "",
    autoBossLastResult: "",
    autoBossResults: {}
  };
}
