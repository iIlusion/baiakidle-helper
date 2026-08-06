export type TransferTiers = {
  rare: boolean;
  epic: boolean;
  legendary: boolean;
  mythical: boolean;
};

export type Settings = {
  autoSell: boolean;
  /**
   * Sell when loot pouch fill % is at least this value (1–100).
   * 100 = only when full (legacy behaviour).
   */
  autoSellThresholdPct: number;
  autoOpenAll: boolean;
  autoSellSupplyPotions: boolean;
  supplyPotionsOnlyTreino: boolean;
  supplyPotionsOnlyNoGlooth: boolean;
  supplyPotionsOnlyEmptyLoot: boolean;
  /** Move rare+ equip items from Loot Pouch to Backpack. */
  autoTransfer: boolean;
  transferTiers: TransferTiers;
  // Reserved for later phases (defaults keep them off / empty).
  autoHunt: boolean;
  selectedHuntId: string | null;
  /**
   * While Auto Hunt is on: route by two stamina thresholds (hysteresis).
   * Auto Hunt stays enabled (never auto-disabled by this route).
   */
  autoHuntTreinoOnLowStamina: boolean;
  /** Go to Treino when stamina ≤ this (minutes), from city or hunt. */
  autoHuntStaminaToTreinoMinutes: number;
  /** Leave Treino and enter selected hunt when stamina ≥ this (minutes). */
  autoHuntStaminaToHuntMinutes: number;
  autoReconnect: boolean;
  reconnectIntervalMs: number;
  reconnectHomepage: boolean;
  reconnectMaintenance: boolean;
  reconnectDisconnected: boolean;
  reconnectMultiAccount: boolean;
  /**
   * Drop inbound `fx` packets before the game/Pixi sees them
   * (particles, projectiles, floating combat art). Combat still resolves server-side.
   */
  reduceVfx: boolean;
  /** Share each active auction on Market chat (`aucshare`) on a per-listing timer. */
  autoMarketAnnounce: boolean;
  /** Per-listing interval in ms (default 10 minutes). */
  autoMarketAnnounceIntervalMs: number;
};

export const STORAGE_KEY = "baiakidle-helper-v1";

export const defaults: Settings = {
  autoSell: true,
  autoSellThresholdPct: 90,
  autoOpenAll: true,
  autoSellSupplyPotions: false,
  supplyPotionsOnlyTreino: true,
  supplyPotionsOnlyNoGlooth: true,
  supplyPotionsOnlyEmptyLoot: true,
  autoTransfer: false,
  transferTiers: {
    rare: false,
    epic: true,
    legendary: true,
    mythical: true
  },
  autoHunt: false,
  selectedHuntId: null,
  autoHuntTreinoOnLowStamina: false,
  autoHuntStaminaToTreinoMinutes: 60, // 1h
  autoHuntStaminaToHuntMinutes: 42 * 60, // 2520 = 42h
  autoReconnect: false,
  reconnectIntervalMs: 30_000,
  reconnectHomepage: true,
  reconnectMaintenance: true,
  reconnectDisconnected: true,
  reconnectMultiAccount: false,
  reduceVfx: false,
  autoMarketAnnounce: false,
  autoMarketAnnounceIntervalMs: 10 * 60 * 1_000
};

function asBool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asTransferTiers(value: unknown): TransferTiers {
  const raw = value && typeof value === "object" ? value as Partial<TransferTiers> : {};
  return {
    rare: asBool(raw.rare, defaults.transferTiers.rare),
    epic: asBool(raw.epic, defaults.transferTiers.epic),
    legendary: asBool(raw.legendary, defaults.transferTiers.legendary),
    mythical: asBool(raw.mythical, defaults.transferTiers.mythical)
  };
}

export function loadSettings(
  storage: Storage,
  validHuntIds?: ReadonlySet<string>
): Settings {
  try {
    const raw = JSON.parse(storage.getItem(STORAGE_KEY) ?? "{}") as Partial<Settings>;
    let selectedHuntId =
      typeof raw.selectedHuntId === "string" ? raw.selectedHuntId : null;
    // Drop removed stages that should not appear in Auto Hunt.
    if (selectedHuntId && validHuntIds && !validHuntIds.has(selectedHuntId)) {
      selectedHuntId = null;
    }
    return {
      ...defaults,
      ...raw,
      transferTiers: asTransferTiers(raw.transferTiers),
      selectedHuntId,
      autoHuntTreinoOnLowStamina: asBool(
        raw.autoHuntTreinoOnLowStamina,
        defaults.autoHuntTreinoOnLowStamina
      ),
      // Migrate legacy single threshold if present.
      autoHuntStaminaToTreinoMinutes: clampStaminaMinutes(
        raw.autoHuntStaminaToTreinoMinutes ??
          (raw as { autoHuntStaminaMinutes?: number }).autoHuntStaminaMinutes
      ),
      autoHuntStaminaToHuntMinutes: clampStaminaMinutes(
        raw.autoHuntStaminaToHuntMinutes ??
          (raw as { autoHuntStaminaMinutes?: number }).autoHuntStaminaMinutes ??
          defaults.autoHuntStaminaToHuntMinutes,
        defaults.autoHuntStaminaToHuntMinutes
      ),
      reconnectIntervalMs: clampReconnectIntervalMs(raw.reconnectIntervalMs),
      autoSellThresholdPct: clampAutoSellThresholdPct(raw.autoSellThresholdPct),
      autoReconnect: asBool(raw.autoReconnect, defaults.autoReconnect),
      reconnectHomepage: asBool(raw.reconnectHomepage, defaults.reconnectHomepage),
      reconnectMaintenance: asBool(raw.reconnectMaintenance, defaults.reconnectMaintenance),
      reconnectDisconnected: asBool(
        raw.reconnectDisconnected,
        defaults.reconnectDisconnected
      ),
      reconnectMultiAccount: asBool(
        raw.reconnectMultiAccount,
        defaults.reconnectMultiAccount
      ),
      reduceVfx: asBool(raw.reduceVfx, defaults.reduceVfx),
      autoMarketAnnounce: asBool(raw.autoMarketAnnounce, defaults.autoMarketAnnounce),
      autoMarketAnnounceIntervalMs: clampMarketAnnounceIntervalMs(
        raw.autoMarketAnnounceIntervalMs
      )
    };
  } catch {
    return { ...defaults, transferTiers: { ...defaults.transferTiers } };
  }
}

/** 1% … 100% of loot pouch capacity before auto-sell. */
export function clampAutoSellThresholdPct(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return defaults.autoSellThresholdPct;
  return Math.max(1, Math.min(100, Math.round(n)));
}

/** 2 min … 6 h per listing (game market channel also enforces ~120s global). */
export function clampMarketAnnounceIntervalMs(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return defaults.autoMarketAnnounceIntervalMs;
  return Math.max(2 * 60 * 1_000, Math.min(6 * 60 * 60 * 1_000, Math.round(n)));
}

/** 5s … 10 min between reconnect attempts. */
export function clampReconnectIntervalMs(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return defaults.reconnectIntervalMs;
  return Math.max(5_000, Math.min(600_000, Math.round(n)));
}

/** Max stamina minutes for both hunt/treino thresholds (42h game bar). */
export const STAMINA_MAX_MINUTES = 42 * 60; // 2520

/** 1 minute … 42 hours (game stamina bar). */
export function clampStaminaMinutes(
  value: unknown,
  fallback: number = defaults.autoHuntStaminaToTreinoMinutes
): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) {
    const fb = typeof fallback === "number" ? fallback : Number(fallback);
    if (!Number.isFinite(fb)) return defaults.autoHuntStaminaToTreinoMinutes;
    return Math.max(1, Math.min(STAMINA_MAX_MINUTES, Math.round(fb)));
  }
  return Math.max(1, Math.min(STAMINA_MAX_MINUTES, Math.round(n)));
}

export function formatStaminaMinutes(totalMinutes: number): string {
  const mins = clampStaminaMinutes(totalMinutes);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h <= 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h${String(m).padStart(2, "0")}m`;
}

export function saveSettings(storage: Storage, next: Settings): void {
  storage.setItem(STORAGE_KEY, JSON.stringify(next));
}

/** data-tier values used by the game for equip rarity. */
export function enabledTransferTiers(settings: Settings): Set<number> {
  const tiers = new Set<number>();
  if (settings.transferTiers.rare) tiers.add(2);
  if (settings.transferTiers.epic) tiers.add(3);
  if (settings.transferTiers.legendary) tiers.add(4);
  if (settings.transferTiers.mythical) tiers.add(5);
  return tiers;
}
