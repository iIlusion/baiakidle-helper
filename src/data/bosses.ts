import rawBosses from "./boss-catalog.json";

export type BossRarity = "bane" | "archfoe" | "nemesis";

export type BossEntry = {
  id: string;
  name: string;
  minLevel: number;
  bossKey: string;
  rarity: BossRarity;
  summons: string[];
  summonCount?: number;
};

export function sortBossesByLevel(bosses: readonly BossEntry[]): BossEntry[] {
  return [...bosses].sort((a, b) => a.minLevel - b.minLevel || a.name.localeCompare(b.name, "en"));
}

export const BOSSES: BossEntry[] = sortBossesByLevel(rawBosses as BossEntry[]);

export function bossCatalog(): BossEntry[] {
  return [...BOSSES];
}

export function bossById(id: string | null | undefined): BossEntry | undefined {
  const value = id?.trim();
  if (!value) return undefined;
  return BOSSES.find(boss => boss.id === value || boss.bossKey === value);
}

export function bossByName(name: string): BossEntry | undefined {
  const needle = name.trim().toLowerCase();
  if (!needle) return undefined;
  return BOSSES.find(boss => boss.name.toLowerCase() === needle);
}

export function parseAutoBossIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const row of value) {
    const entry = typeof row === "string" ? bossById(row) : undefined;
    if (!entry || seen.has(entry.id)) continue;
    seen.add(entry.id);
    ids.push(entry.id);
  }
  return ids;
}

/** Calendar date in America/Sao_Paulo; the daily reset is civil midnight there. */
export function brasiliaDateKey(now = Date.now()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(now);
}
