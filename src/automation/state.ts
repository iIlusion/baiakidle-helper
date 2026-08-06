export type InventoryState = {
  current: number;
  capacity: number;
  full: boolean;
  /** Real sell timer (class `cd`). Disabled alone means "no items", not cooldown. */
  sellCooldown: boolean;
  /** Button unlocked — has sellable items and not on timer. */
  canSell: boolean;
  hasGloothBag: boolean;
};

const TREINO_ONLINE_RE = /treino\s*online|online\s*training/i;
const CITY_RE = /^cidade$|^city$/i;

export function readInventory(doc: Document): InventoryState | undefined {
  const match = /^\s*(\d+)\s*\/\s*(\d+)/.exec(
    doc.getElementById("inv-count")?.textContent ?? ""
  );
  if (!match) return;

  const current = Number(match[1]);
  const capacity = Number(match[2]);
  const sellButton = doc.getElementById("sell-all") as HTMLButtonElement | null;
  const sellCooldown = Boolean(sellButton?.classList.contains("cd"));
  return {
    current,
    capacity,
    full: capacity > 0 && current >= capacity,
    sellCooldown,
    canSell: Boolean(sellButton && !sellButton.disabled && !sellCooldown),
    hasGloothBag: Boolean(doc.querySelector('#backpack-grid img[alt="glooth bag"]'))
  };
}

export function waveTitle(doc: Document): string {
  return (doc.getElementById("wave-title")?.textContent ?? "").trim();
}

export function isInCity(doc: Document): boolean {
  const title = waveTitle(doc);
  if (CITY_RE.test(title)) return true;
  // Subtitle is a reliable secondary signal on the city canvas.
  const sub = (doc.getElementById("wave-sub")?.textContent ?? "").trim();
  return /lugar seguro|safe place|nada de hunt/i.test(sub) && !TREINO_ONLINE_RE.test(title);
}

/** Connection / multi-account / reconnect overlay on /jogar/. */
export function isConnOverlayOpen(doc: Document): boolean {
  const overlay = doc.getElementById("conn-overlay");
  return Boolean(overlay && !overlay.classList.contains("hidden"));
}

/** Server entry queue (not multi-account). */
export function isQueueOpen(doc: Document): boolean {
  const overlay = doc.getElementById("queue-overlay");
  return Boolean(overlay && !overlay.classList.contains("hidden"));
}

export function isHuntBlocked(doc: Document): boolean {
  return isConnOverlayOpen(doc) || isQueueOpen(doc);
}

/** True when the wave title already matches the selected hunt name. */
export function isAlreadyInHunt(doc: Document, huntName: string | undefined): boolean {
  if (!huntName) return false;
  const title = waveTitle(doc).toLowerCase();
  if (!title || CITY_RE.test(title)) return false;
  return title === huntName.trim().toLowerCase() || title.includes(huntName.trim().toLowerCase());
}

/**
 * True only when the player is *in* Treino online (wave title / document title).
 * Do NOT use stamina tip/title — those often say "use o Treino online" while in city/hunt.
 */
export function inTreinoOnline(doc: Document, pageTitle: string): boolean {
  const wave = waveTitle(doc);
  if (TREINO_ONLINE_RE.test(wave)) return true;
  // Document title is like "nick · Treino online — Baiak Idle"
  if (TREINO_ONLINE_RE.test(pageTitle)) {
    // Avoid false positive if only a generic site title ever mentions treino.
    return /·\s*treino\s*online|treino\s*online\s*—/i.test(pageTitle) || TREINO_ONLINE_RE.test(wave);
  }
  return false;
}

/**
 * Parse `#stamina-time` (e.g. "42:00", "0:45") as total minutes remaining.
 */
export function readStaminaMinutes(doc: Document): number | undefined {
  const text = (doc.getElementById("stamina-time")?.textContent ?? "").trim();
  const match = /^(\d+)\s*:\s*(\d{1,2})$/.exec(text);
  if (!match) return;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || minutes > 59) return;
  return hours * 60 + minutes;
}

export function supplyPotionNames(doc: Document): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const img of doc.querySelectorAll<HTMLImageElement>("#supplypouch-grid .cell img[alt]")) {
    const name = img.alt.trim();
    if (!/potion/i.test(name) || seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }
  return names;
}
