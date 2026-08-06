import { onGamePacket } from "./socket";
import {
  calculateSessionRate,
  isInterestingRatePacket,
  parseFx,
  parseSoldGold,
  RATE_MODES,
  type RateMode
} from "./rate";

declare const unsafeWindow: Window & typeof globalThis;

const page = unsafeWindow;
const MODE_STORAGE = "baiakidle-helper-rate-modes";
const SOLD_LOOT_STORAGE = "baiakidle-helper-sold-loot";
const TEXT_PROPERTIES = [
  "font-family",
  "font-size",
  "font-style",
  "font-variant",
  "font-weight",
  "line-height",
  "letter-spacing",
  "color",
  "text-shadow",
  "text-transform"
];
const TARGET_PANELS = new Set([
  "boosts",
  "skills",
  "hunt",
  "partyhunt",
  "dmg",
  "taken",
  "loot",
  "supply"
]);

type MetricKey = "xp" | "gold";
type Metric = {
  key: MetricKey;
  totalId: string;
  sessionId: string;
  outputId: string;
  mode: RateMode;
  lastSessionMs: number;
  sessionSeenAt: number;
  lastDomTotal: number;
  pendingNetwork: number;
};

/** Hunt Analyzer loot from real pouch sells (script + native auto-sell), not monster drops. */
type SoldLootState = {
  total: number;
  lastSessionMs: number;
  /** session = loot vendido; game = valor nativo do Hunt Analyzer. */
  mode: RateMode;
};

type LootField = "loot" | "balance";

function savedModes(): Partial<Record<MetricKey | "loot", RateMode>> {
  try {
    return JSON.parse(page.localStorage.getItem(MODE_STORAGE) ?? "{}");
  } catch {
    return {};
  }
}

const saved = savedModes();
const xp = metric("xp", "an-raw", "an-session", "an-xph");
const gold = metric("gold", "loot-gold", "loot-session", "loot-perhour");
const soldLoot: SoldLootState = loadSoldLoot();

function validMode(value: unknown): RateMode {
  return RATE_MODES.includes(value as RateMode) ? value as RateMode : "session";
}

function loadSoldLoot(): SoldLootState {
  try {
    const raw = JSON.parse(page.localStorage.getItem(SOLD_LOOT_STORAGE) ?? "{}");
    return {
      total: Number.isFinite(raw.total) ? Math.max(0, Number(raw.total)) : 0,
      lastSessionMs: Number.isFinite(raw.lastSessionMs) ? Math.max(0, Number(raw.lastSessionMs)) : 0,
      mode: validMode(raw.mode ?? saved.loot)
    };
  } catch {
    return { total: 0, lastSessionMs: 0, mode: validMode(saved.loot) };
  }
}

let lastSoldLootPersistAt = 0;
let soldLootDirty = false;

function persistSoldLoot(force = false): void {
  const now = Date.now();
  if (!force && now - lastSoldLootPersistAt < 15_000) {
    soldLootDirty = true;
    return;
  }
  lastSoldLootPersistAt = now;
  soldLootDirty = false;
  try {
    page.localStorage.setItem(
      SOLD_LOOT_STORAGE,
      JSON.stringify({
        total: soldLoot.total,
        lastSessionMs: soldLoot.lastSessionMs,
        mode: soldLoot.mode
      })
    );
  } catch {
    /* quota / private mode */
  }
}

function flushSoldLootIfDirty(): void {
  if (soldLootDirty) persistSoldLoot(true);
}

function persistLootMode(): void {
  page.localStorage.setItem(
    MODE_STORAGE,
    JSON.stringify({ xp: xp.mode, gold: gold.mode, loot: soldLoot.mode })
  );
  persistSoldLoot();
}

function resetSoldLoot(sessionMs = 0): void {
  soldLoot.total = 0;
  soldLoot.lastSessionMs = sessionMs;
  persistSoldLoot();
}

function addSoldLoot(amount: number): void {
  if (!(amount > 0)) return;
  soldLoot.total += amount;
  persistSoldLoot();
  renderSoldLoot();
}

function formatGold(value: number): string {
  return Math.round(value).toLocaleString("pt-BR");
}

function selectNextLootMode(): void {
  soldLoot.mode = soldLoot.mode === "session" ? "game" : "session";
  persistLootMode();
  renderSoldLoot();
}

function ensureLootField(field: LootField): {
  native: HTMLElement;
  slot: HTMLElement;
  button: HTMLButtonElement;
  value: HTMLElement;
  period: HTMLElement;
  label: HTMLElement | null;
} | undefined {
  const nativeId = field === "loot" ? "an-loot" : "an-balance";
  const native = page.document.getElementById(nativeId);
  if (!native) return;

  let slot = native.closest<HTMLElement>(`.baiak-rate-slot[data-rate="hunt-${field}"]`);
  if (!slot) {
    slot = page.document.createElement("span");
    slot.className = "baiak-rate-slot";
    slot.dataset.rate = `hunt-${field}`;
    native.before(slot);
    slot.append(native);

    const button = page.document.createElement("button");
    button.type = "button";
    button.className = "baiak-rate-control";
    button.innerHTML = '<b class="baiak-rate-value"></b><span class="baiak-rate-period"></span>';
    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      selectNextLootMode();
    });
    slot.append(button);

    native.classList.add("baiak-rate-native");
    matchNativeText(native, button.querySelector<HTMLElement>(".baiak-rate-value")!);
    native.tabIndex = 0;
    native.setAttribute("role", "button");
    native.addEventListener("click", () => {
      selectNextLootMode();
      button.focus();
    });
    native.addEventListener("keydown", event => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      selectNextLootMode();
      button.focus();
    });
  }

  const button = slot.querySelector<HTMLButtonElement>(".baiak-rate-control");
  const value = button?.querySelector<HTMLElement>(".baiak-rate-value");
  const period = button?.querySelector<HTMLElement>(".baiak-rate-period");
  if (!button || !value || !period) return;

  const row = slot.closest(".row");
  const label = row?.querySelector<HTMLElement>(":scope > .muted") ?? null;
  return { native, slot, button, value, period, label };
}

function renderSoldLoot(): void {
  const loot = ensureLootField("loot");
  const balance = ensureLootField("balance");
  if (!loot || !balance) return;

  const game = soldLoot.mode === "game";
  const label = modeLabel(soldLoot.mode);
  const next = modeLabel(soldLoot.mode === "session" ? "game" : "session");
  const supplies = numberFrom("an-supplies") ?? 0;
  const net = soldLoot.total - supplies;

  for (const field of [loot, balance]) {
    field.slot.dataset.mode = soldLoot.mode;
    if (game) field.native.style.removeProperty("display");
    else field.native.style.setProperty("display", "none", "important");

    if (field.period.textContent !== label) field.period.textContent = label;
    const title = `Loot/Balance: ${label}. Clique para ${next}.`;
    field.button.title = title;
    field.button.dataset.tip = title;
    field.button.setAttribute("aria-label", title);
    field.native.title = game
      ? `Valor original do jogo (drops). Clique para ${next}.`
      : `Loot vendido (sell all / auto-sell). Clique para ${next}.`;
    field.native.dataset.tip = field.native.title;
  }

  if (!game) {
    const lootText = formatGold(soldLoot.total);
    const balanceText = formatGold(net);
    if (loot.value.textContent !== lootText) loot.value.textContent = lootText;
    if (balance.value.textContent !== balanceText) balance.value.textContent = balanceText;

    loot.value.classList.add("good");
    balance.value.classList.toggle("good", net > 0);
    balance.value.classList.toggle("bad", net < 0);
    matchNativeText(loot.native, loot.value);
    matchNativeText(balance.native, balance.value);

    if (loot.label) {
      if (loot.label.textContent !== "Loot vendido") loot.label.textContent = "Loot vendido";
      loot.label.title = "Gold de vendas reais (sell all / auto-sell). Não conta drop sem espaço.";
      loot.label.dataset.tip = loot.label.title;
    }
    if (balance.label) {
      balance.label.title = "Balance = loot vendido − supplies.";
      balance.label.dataset.tip = balance.label.title;
    }
  } else {
    if (loot.label && loot.label.textContent !== "Loot") {
      loot.label.textContent = "Loot";
      loot.label.removeAttribute("title");
      delete loot.label.dataset.tip;
    }
    if (balance.label) {
      balance.label.removeAttribute("title");
      delete balance.label.dataset.tip;
    }
  }
}

function reconcileSoldLootSession(): void {
  const elapsed = sessionMs("an-session");
  // Hunt reset / new session: timer went backwards or restarted.
  if (elapsed + 2_000 < soldLoot.lastSessionMs || (elapsed === 0 && soldLoot.lastSessionMs > 5_000)) {
    resetSoldLoot(elapsed);
    renderSoldLoot();
    return;
  }
  if (soldLoot.lastSessionMs !== elapsed) {
    soldLoot.lastSessionMs = elapsed;
    // Throttled — do not hit localStorage every tick.
    persistSoldLoot(false);
  }
}

function wireSoldLootReset(): void {
  page.document.addEventListener(
    "click",
    event => {
      const target = event.target as Element | null;
      if (!target?.closest?.("#hunt-reset")) return;
      resetSoldLoot(0);
      // Let the game clear the panel, then re-apply our values if in SESS mode.
      page.setTimeout(renderSoldLoot, 0);
      page.setTimeout(renderSoldLoot, 100);
    },
    true
  );
}

function metric(key: MetricKey, totalId: string, sessionId: string, outputId: string): Metric {
  return {
    key,
    totalId,
    sessionId,
    outputId,
    mode: validMode(saved[key]),
    lastSessionMs: 0,
    sessionSeenAt: 0,
    lastDomTotal: 0,
    pendingNetwork: 0
  };
}

function numberFrom(id: string): number | undefined {
  const text = page.document.getElementById(id)?.textContent;
  if (!text) return;
  const value = Number(text.replace(/[^\d-]/g, ""));
  return Number.isFinite(value) ? value : undefined;
}

function sessionMs(id: string): number {
  const parts = (page.document.getElementById(id)?.textContent ?? "")
    .split(":")
    .map(Number);
  if (parts.length !== 3 || parts.some(value => !Number.isFinite(value))) return 0;
  return ((parts[0] * 60 + parts[1]) * 60 + parts[2]) * 1000;
}

function reset(metric: Metric, now: number, total: number): void {
  metric.lastSessionMs = sessionMs(metric.sessionId);
  metric.sessionSeenAt = now;
  metric.lastDomTotal = total;
  metric.pendingNetwork = 0;
}

function reconcile(metric: Metric, now: number): void {
  const total = numberFrom(metric.totalId);
  if (total === undefined) return;
  const elapsed = sessionMs(metric.sessionId);
  if (!metric.sessionSeenAt || total < metric.lastDomTotal || elapsed + 2_000 < metric.lastSessionMs) {
    reset(metric, now, total);
    return;
  }
  if (total > metric.lastDomTotal) {
    metric.lastDomTotal = total;
    metric.pendingNetwork = 0;
  }
  metric.lastSessionMs = elapsed;
  metric.sessionSeenAt = now;
}

function modeLabel(mode: RateMode): string {
  return mode === "session" ? "SESS" : "JOGO";
}

function selectNext(metric: Metric): void {
  metric.mode = metric.mode === "session" ? "game" : "session";
  page.localStorage.setItem(
    MODE_STORAGE,
    JSON.stringify({ xp: xp.mode, gold: gold.mode, loot: soldLoot.mode })
  );
  render(metric, Date.now());
}

/** Copy font styles once — getComputedStyle every tick was a major layout thrash source. */
function matchNativeText(native: HTMLElement, value: HTMLElement, force = false): void {
  if (!force && value.dataset.baiakStyled === "1") {
    // Still sync utility classes (good/bad) without re-reading computed styles.
    const extras = [...native.classList].filter(name => name !== "baiak-rate-native");
    const next = ["baiak-rate-value", ...extras].join(" ");
    if (value.className !== next) value.className = next;
    return;
  }
  const style = page.getComputedStyle(native);
  for (const property of TEXT_PROPERTIES) {
    value.style.setProperty(property, style.getPropertyValue(property));
  }
  value.className = [
    "baiak-rate-value",
    ...[...native.classList].filter(name => name !== "baiak-rate-native")
  ].join(" ");
  value.dataset.baiakStyled = "1";
}

function ensureControl(metric: Metric): {
  native: HTMLElement;
  slot: HTMLElement;
  button: HTMLButtonElement;
  value: HTMLElement;
  period: HTMLElement;
} | undefined {
  const native = page.document.getElementById(metric.outputId);
  if (!native) return;

  let slot = native.closest<HTMLElement>(`.baiak-rate-slot[data-rate="${metric.key}"]`);
  if (!slot) {
    slot = page.document.createElement("span");
    slot.className = "baiak-rate-slot";
    slot.dataset.rate = metric.key;
    native.before(slot);
    slot.append(native);

    const button = page.document.createElement("button");
    button.type = "button";
    button.className = "baiak-rate-control";
    button.innerHTML = '<b class="baiak-rate-value"></b><span class="baiak-rate-period"></span>';
    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      selectNext(metric);
    });
    slot.append(button);

    native.classList.add("baiak-rate-native");
    matchNativeText(native, button.querySelector<HTMLElement>(".baiak-rate-value")!);
    native.tabIndex = 0;
    native.setAttribute("role", "button");
    native.addEventListener("click", () => {
      selectNext(metric);
      button.focus();
    });
    native.addEventListener("keydown", event => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      selectNext(metric);
      button.focus();
    });
  }

  const button = slot.querySelector<HTMLButtonElement>(".baiak-rate-control");
  const value = button?.querySelector<HTMLElement>(".baiak-rate-value");
  const period = button?.querySelector<HTMLElement>(".baiak-rate-period");
  if (!button || !value || !period) return;
  return { native, slot, button, value, period };
}

function render(metric: Metric, now: number): void {
  const control = ensureControl(metric);
  if (!control) return;
  const { native, slot, button, value, period } = control;
  const game = metric.mode === "game";
  slot.dataset.mode = metric.mode;
  if (game) native.style.removeProperty("display");
  else native.style.setProperty("display", "none", "important");

  if (!game) {
    const elapsed = metric.lastSessionMs + Math.max(0, now - metric.sessionSeenAt);
    const text = Math.round(calculateSessionRate(
      elapsed,
      metric.lastDomTotal + metric.pendingNetwork
    )).toLocaleString("pt-BR");
    if (value.textContent !== text) value.textContent = text;
  }

  const label = modeLabel(metric.mode);
  if (period.textContent !== label) period.textContent = label;
  const next = modeLabel(metric.mode === "session" ? "game" : "session");
  const title = `${metric.key === "xp" ? "XP/h" : "Gold/h"}: ${label}. Clique para ${next}.`;
  button.title = title;
  button.dataset.tip = title;
  button.setAttribute("aria-label", title);
  native.title = `Valor original do jogo. Clique para ${next}.`;
  native.dataset.tip = native.title;
}

function startRates(): void {
  onGamePacket((bytes, receivedAt) => {
    // Skip ~99% of combat packets before any msgpack walk.
    if (!isInterestingRatePacket(bytes)) return;

    const sold = parseSoldGold(bytes);
    if (sold !== undefined) addSoldLoot(sold);

    const event = parseFx(bytes);
    if (!event) return;
    const metric = event.type === "xp" ? xp : gold;
    metric.pendingNetwork += event.amount;
    metric.sessionSeenAt ||= receivedAt;
  });

  wireSoldLootReset();
  page.addEventListener("visibilitychange", () => {
    if (page.document.hidden) flushSoldLootIfDirty();
  });
  page.addEventListener("pagehide", () => flushSoldLootIfDirty());

  // 1s is enough for rates; 500ms + localStorage + getComputedStyle was janky in combat.
  page.setInterval(() => {
    const now = Date.now();
    reconcile(xp, now);
    reconcile(gold, now);
    reconcileSoldLootSession();
    render(xp, now);
    render(gold, now);
    renderSoldLoot();
    if (soldLootDirty) persistSoldLoot(false);
  }, 1_000);
}

function startIndependentPanels(): void {
  page.document.addEventListener("click", event => {
    const button = (event.target as Element | null)?.closest<HTMLButtonElement>(".pmin[data-panel]");
    const panelName = button?.dataset.panel;
    if (!button || !panelName || !TARGET_PANELS.has(panelName)) return;

    const panel = button.closest<HTMLElement>(".panel");
    if (!panel) return;
    event.preventDefault();
    event.stopImmediatePropagation();

    const collapsed = panel.classList.toggle("min");
    button.textContent = collapsed ? "+" : "\u2212";
    button.title = collapsed ? "Expandir" : "Minimizar";
    button.dataset.tip = button.title;
  }, true);
}

export function startAnalyserEnhancements(): void {
  startRates();
  startIndependentPanels();
}