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
  baseLabel: string;
};

/**
 * Hunt Analyzer "loot vendido": gold that entered the wallet this session.
 * - sell notifies (g + mg) — pouch / auto-sell
 * - fx gold drops — coins that go straight to wallet (no sell)
 */
type SoldLootState = {
  total: number;
  lastSessionMs: number;
  /** session = vendas + gold drop; game = nativo do Hunt Analyzer. */
  mode: RateMode;
};

type LootField = "loot" | "balance";

type RateControl = {
  native: HTMLElement;
  slot: HTMLElement;
  value: HTMLElement;
  label: HTMLElement | null;
  row: HTMLElement | null;
};

function savedModes(): Partial<Record<MetricKey | "loot", string>> {
  try {
    return JSON.parse(page.localStorage.getItem(MODE_STORAGE) ?? "{}");
  } catch {
    return {};
  }
}

const saved = savedModes();
const xp = metric("xp", "an-raw", "an-session", "an-xph", "XP/h");
const gold = metric("gold", "loot-gold", "loot-session", "loot-perhour", "Gold/h");
const soldLoot: SoldLootState = loadSoldLoot();

function validMode(value: unknown): RateMode {
  // Migrate removed "wallet" fallback → session (sell texts + fx gold).
  if (value === "wallet") return "session";
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

function persistAllModes(): void {
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

/** @param renderNow false for high-frequency fx gold (1s tick redraws). */
function addSoldLoot(amount: number, renderNow = true): void {
  if (!(amount > 0)) return;
  soldLoot.total += amount;
  persistSoldLoot();
  if (renderNow) renderSoldLoot();
}

function formatGold(value: number): string {
  return Math.round(value).toLocaleString("pt-BR");
}

function modeLabel(mode: RateMode): string {
  return mode === "session" ? "Sessão" : "Jogo";
}

/** Game-native tooltip only (`data-tip`). Never set `title` — fights browser tooltip. */
function setGameTip(el: HTMLElement | null, tip: string): void {
  if (!el) return;
  if (el.getAttribute("title") != null) el.removeAttribute("title");
  if (el.dataset.tip !== tip) el.dataset.tip = tip;
}

/** "XP/h (Sessão)" with gold mode word — no chip/card. */
function applySideLabel(
  label: HTMLElement | null,
  base: string,
  modeText: string,
  tip: string
): void {
  if (!label) return;
  const html = `${base} <span class="baiak-rate-mode">(${modeText})</span>`;
  if (label.dataset.baiakLabelHtml !== html) {
    label.innerHTML = html;
    label.dataset.baiakLabelHtml = html;
    label.dataset.baiakBase = base;
  }
  setGameTip(label, tip);
}

function selectNextLootMode(): void {
  soldLoot.mode = soldLoot.mode === "session" ? "game" : "session";
  persistAllModes();
  renderSoldLoot();
}

function wireRowClick(row: HTMLElement | null, slot: HTMLElement, onToggle: () => void): void {
  if (row && !row.classList.contains("baiak-rate-row")) {
    row.classList.add("baiak-rate-row");
    row.tabIndex = 0;
    row.setAttribute("role", "button");
    row.addEventListener("click", event => {
      // Don't steal panel min/reset buttons
      const t = event.target as Element | null;
      if (t?.closest?.("button, a, input, select, textarea")) return;
      event.preventDefault();
      onToggle();
    });
    row.addEventListener("keydown", event => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      onToggle();
    });
  }
  if (!slot.dataset.baiakClick) {
    slot.dataset.baiakClick = "1";
    slot.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      onToggle();
    });
  }
}

function ensureLootField(field: LootField): RateControl | undefined {
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

    const value = page.document.createElement("b");
    value.className = "baiak-rate-value";
    slot.append(value);

    native.classList.add("baiak-rate-native");
    matchNativeText(native, value, true);
  } else {
    // Migrate old chip UI if still present
    slot.querySelector(".baiak-rate-period")?.remove();
    const oldBtn = slot.querySelector(".baiak-rate-control");
    if (oldBtn) {
      const inner = oldBtn.querySelector(".baiak-rate-value");
      if (inner) slot.append(inner);
      oldBtn.remove();
    }
    if (!slot.querySelector(".baiak-rate-value")) {
      const value = page.document.createElement("b");
      value.className = "baiak-rate-value";
      slot.append(value);
      matchNativeText(native, value, true);
    }
  }

  const value = slot.querySelector<HTMLElement>(".baiak-rate-value");
  if (!value) return;

  const row = slot.closest<HTMLElement>(".row");
  const label = row?.querySelector<HTMLElement>(":scope > .muted") ?? null;
  wireRowClick(row, slot, selectNextLootMode);
  return { native, slot, value, label, row };
}

function renderSoldLoot(): void {
  const loot = ensureLootField("loot");
  const balance = ensureLootField("balance");
  if (!loot || !balance) return;

  const mode = soldLoot.mode;
  const game = mode === "game";
  const next = modeLabel(mode === "session" ? "game" : "session");
  const modeText = modeLabel(mode);
  const supplies = numberFrom("an-supplies") ?? 0;
  const sold = soldLoot.total;
  const net = sold - supplies;

  const lootBase = game ? "Loot" : "Loot vendido";
  const lootTip = game
    ? `Valor nativo do Hunt Analyzer (drops em valor, vendidos ou não). Clique para ${next}.`
    : `Gold na carteira: vendas (notify g+mg) + gold drop direto (fx). ` +
      `Total=${formatGold(sold)}. Clique para ${next}.`;
  const balTip = game
    ? `Balance nativo do jogo. Clique para ${next}.`
    : `Balance = (vendas + gold drop) − supplies. Clique para ${next}.`;

  for (const field of [loot, balance]) {
    field.slot.dataset.mode = mode;
    const tip = field === loot ? lootTip : balTip;
    setGameTip(field.slot, tip);
    setGameTip(field.row, tip);
    if (field.row) field.row.setAttribute("aria-label", tip);
  }

  applySideLabel(loot.label, lootBase, modeText, lootTip);
  applySideLabel(balance.label, "Balance", modeText, balTip);

  if (!game) {
    const lootText = formatGold(sold);
    const balanceText = formatGold(net);
    if (loot.value.textContent !== lootText) loot.value.textContent = lootText;
    if (balance.value.textContent !== balanceText) balance.value.textContent = balanceText;

    loot.value.classList.add("good");
    balance.value.classList.toggle("good", net > 0);
    balance.value.classList.toggle("bad", net < 0);
    matchNativeText(loot.native, loot.value);
    matchNativeText(balance.native, balance.value);
  }
}

function reconcileSoldLootSession(): void {
  const elapsed = sessionMs("an-session");
  if (elapsed + 2_000 < soldLoot.lastSessionMs || (elapsed === 0 && soldLoot.lastSessionMs > 5_000)) {
    resetSoldLoot(elapsed);
    renderSoldLoot();
    return;
  }
  if (soldLoot.lastSessionMs !== elapsed) {
    soldLoot.lastSessionMs = elapsed;
    persistSoldLoot(false);
  }
}

/**
 * Hunt reset opens #confirm-modal first; only #confirm-yes runs the real clear.
 * Do NOT reset sold loot on #hunt-reset click alone.
 */
function wireSoldLootReset(): void {
  // Capture phase: read modal body before the game's #confirm-yes handler hides it.
  page.document.addEventListener(
    "click",
    event => {
      const target = event.target as Element | null;
      if (!target?.closest?.("#confirm-yes")) return;

      const body = (page.document.getElementById("confirm-modal-body")?.textContent ?? "").trim();
      // Hunt Analyzer confirm is the special multi-analyser message.
      const isHuntReset =
        /Hunt Analyzer/i.test(body) ||
        /Todos os analysers/i.test(body) ||
        /Every analyser \(loot, supply and damage\)/i.test(body);
      if (!isHuntReset) return;

      resetSoldLoot(0);
      // After the game clears the panel, re-apply SESS values if needed.
      page.setTimeout(renderSoldLoot, 0);
      page.setTimeout(renderSoldLoot, 100);
    },
    true
  );
}

function metric(
  key: MetricKey,
  totalId: string,
  sessionId: string,
  outputId: string,
  baseLabel: string
): Metric {
  return {
    key,
    totalId,
    sessionId,
    outputId,
    baseLabel,
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

function selectNext(metric: Metric): void {
  metric.mode = metric.mode === "session" ? "game" : "session";
  persistAllModes();
  render(metric, Date.now());
}

/** Copy font styles once — getComputedStyle every tick was a major layout thrash source. */
function matchNativeText(native: HTMLElement, value: HTMLElement, force = false): void {
  if (!force && value.dataset.baiakStyled === "1") {
    const extras = [...native.classList].filter(
      name => name !== "baiak-rate-native" && name !== "baiak-rate-value"
    );
    const next = ["baiak-rate-value", ...extras].join(" ");
    if (value.className !== next) value.className = next;
    return;
  }
  const style = page.getComputedStyle(native);
  for (const property of TEXT_PROPERTIES) {
    value.style.setProperty(property, style.getPropertyValue(property));
  }
  // Size bump applied via CSS .baiak-rate-value { font-size: 1.12em }
  value.className = [
    "baiak-rate-value",
    ...[...native.classList].filter(name => name !== "baiak-rate-native")
  ].join(" ");
  value.dataset.baiakStyled = "1";
}

function ensureControl(metric: Metric): RateControl | undefined {
  const native = page.document.getElementById(metric.outputId);
  if (!native) return;

  let slot = native.closest<HTMLElement>(`.baiak-rate-slot[data-rate="${metric.key}"]`);
  if (!slot) {
    slot = page.document.createElement("span");
    slot.className = "baiak-rate-slot";
    slot.dataset.rate = metric.key;
    native.before(slot);
    slot.append(native);

    const value = page.document.createElement("b");
    value.className = "baiak-rate-value";
    slot.append(value);

    native.classList.add("baiak-rate-native");
    matchNativeText(native, value, true);
  } else {
    slot.querySelector(".baiak-rate-period")?.remove();
    const oldBtn = slot.querySelector(".baiak-rate-control");
    if (oldBtn) {
      const inner = oldBtn.querySelector(".baiak-rate-value");
      if (inner) slot.append(inner);
      oldBtn.remove();
    }
    if (!slot.querySelector(".baiak-rate-value")) {
      const value = page.document.createElement("b");
      value.className = "baiak-rate-value";
      slot.append(value);
      matchNativeText(native, value, true);
    }
  }

  const value = slot.querySelector<HTMLElement>(".baiak-rate-value");
  if (!value) return;

  const row = slot.closest<HTMLElement>(".row");
  const label = row?.querySelector<HTMLElement>(":scope > .muted") ?? null;
  wireRowClick(row, slot, () => selectNext(metric));
  return { native, slot, value, label, row };
}

function render(metric: Metric, now: number): void {
  const control = ensureControl(metric);
  if (!control) return;
  const { native, slot, value, label, row } = control;
  const game = metric.mode === "game";
  slot.dataset.mode = metric.mode;

  if (!game) {
    const elapsed = metric.lastSessionMs + Math.max(0, now - metric.sessionSeenAt);
    const text = Math.round(calculateSessionRate(
      elapsed,
      metric.lastDomTotal + metric.pendingNetwork
    )).toLocaleString("pt-BR");
    if (value.textContent !== text) value.textContent = text;
    matchNativeText(native, value);
  }

  const next = modeLabel(metric.mode === "session" ? "game" : "session");
  const tip = `${metric.baseLabel}: ${modeLabel(metric.mode)}. Clique em qualquer lugar da linha para ${next}.`;
  applySideLabel(label, metric.baseLabel, modeLabel(metric.mode), tip);
  setGameTip(slot, tip);
  setGameTip(row, tip);
  if (row) row.setAttribute("aria-label", tip);
}

function startRates(): void {
  onGamePacket((bytes, receivedAt) => {
    if (!isInterestingRatePacket(bytes)) return;

    // Pouch sells (items/materials) — notify text with g / mg.
    const sold = parseSoldGold(bytes);
    if (sold !== undefined) addSoldLoot(sold, true);

    const event = parseFx(bytes);
    if (!event) return;

    // Direct gold coin drops go straight to wallet (no sell notify).
    // Same fx.t=gold used for Gold/h — count once into loot vendido.
    if (event.type === "gold") addSoldLoot(event.amount, false);

    const metric = event.type === "xp" ? xp : gold;
    metric.pendingNetwork += event.amount;
    metric.sessionSeenAt ||= receivedAt;
  });

  wireSoldLootReset();
  page.addEventListener("visibilitychange", () => {
    if (page.document.hidden) flushSoldLootIfDirty();
  });
  page.addEventListener("pagehide", () => flushSoldLootIfDirty());

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
    setGameTip(button, collapsed ? "Expandir" : "Minimizar");
  }, true);
}

export function startAnalyserEnhancements(): void {
  startRates();
  startIndependentPanels();
}
