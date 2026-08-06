/**
 * Auto Reconnect — multi-state recovery for BaiakIdle.
 *
 * - homepage: path / → /jogar/ (quick)
 * - maintenance / disconnected / multiAccount / stuck on /jogar
 *
 * Settings are re-read from localStorage each tick (works after enabling on /jogar,
 * and the mini bar on non-jogar can toggle without the full HUD).
 */
import { gameplayConnected } from "../socket";
import {
  STORAGE_KEY,
  defaults,
  loadSettings,
  saveSettings,
  type Settings
} from "./settings";
import { isConnOverlayOpen, isQueueOpen } from "./state";

declare const unsafeWindow: Window & typeof globalThis;

export type ReconnectReason =
  | "homepage"
  | "maintenance"
  | "disconnected"
  | "multiAccount"
  | "stuck";

const MAINT_RE =
  /jogo\s*em\s*manuten[cç][aã]o|servidor\s*est[aá]\s*em\s*manuten|em\s*manuten[cç][aã]o|under\s*maintenance|game\s*under\s*maintenance/i;

const MULTI_RE =
  /sess[aã]o\s*aberta\s*em\s*outro|assumida\s*em\s*outro|outra\s*aba\s*ou\s*dispositivo|mais\s*de\s*uma\s*conta|taken\s*over|another\s*device|another\s*tab/i;

const DISCONNECT_HINT_RE =
  /reconectando\s*em|reconectar\s*agora|desconectad|disconnected|reconnecting/i;

const MINI_BAR_ID = "baiak-reconnect-mini";
const VALID_HUNT_IDS = new Set<string>(); // reconnect doesn't need hunt validation

let lastActionAt = 0;
let lastReason: ReconnectReason | null = null;
let startedAt = Date.now();
let lastSkipLogAt = 0;
let getSettingsExternal: (() => Settings) | null = null;

export function isJogarPath(pathname = unsafeWindow.location.pathname): boolean {
  return /^\/jogar(\/|$)/i.test(pathname);
}

function pathIsHomepage(pathname: string): boolean {
  // Also treat bare origin paths used by some landings.
  return (
    pathname === "/" ||
    pathname === "" ||
    pathname === "/index.html" ||
    pathname === "/index" ||
    /^\/(home|inicio)\/?$/i.test(pathname)
  );
}

function readLiveSettings(): Settings {
  try {
    if (getSettingsExternal) {
      // Prefer in-memory when on /jogar (React may have fresher state).
      const live = getSettingsExternal();
      // Always merge with storage so homepage toggles persist across navigations.
      const stored = loadSettings(unsafeWindow.localStorage, VALID_HUNT_IDS);
      return { ...stored, ...live, transferTiers: live.transferTiers ?? stored.transferTiers };
    }
    return loadSettings(unsafeWindow.localStorage, VALID_HUNT_IDS);
  } catch {
    return { ...defaults, transferTiers: { ...defaults.transferTiers } };
  }
}

function persistPartial(patch: Partial<Settings>): Settings {
  const next = { ...readLiveSettings(), ...patch };
  saveSettings(unsafeWindow.localStorage, next);
  unsafeWindow.dispatchEvent(
    new CustomEvent("baiakidle-helper-settings", { detail: next })
  );
  return next;
}

function sampleText(doc: Document): string {
  const parts: string[] = [];
  if (doc.title) parts.push(doc.title);

  const overlay = doc.getElementById("conn-overlay");
  if (overlay && !overlay.classList.contains("hidden")) {
    parts.push(overlay.textContent ?? "");
  }

  const main =
    doc.querySelector("main") ??
    doc.querySelector(".auth-card") ??
    doc.querySelector("#root > div") ??
    doc.body;
  if (main && main !== overlay) {
    const t = (main.textContent ?? "").trim();
    if (t.length > 0) parts.push(t.slice(0, 2_500));
  }
  return parts.join("\n");
}

function multiAccountOverlay(doc: Document): boolean {
  const overlay = doc.getElementById("conn-overlay");
  if (!overlay || overlay.classList.contains("hidden")) return false;
  const title = (overlay.querySelector(".auth-title")?.textContent ?? "").trim();
  const hint = (doc.getElementById("conn-hint")?.textContent ?? "").trim();
  const retry = (doc.getElementById("conn-retry")?.textContent ?? "").trim();
  return MULTI_RE.test(`${title}\n${hint}\n${retry}`) || /reassumir/i.test(retry);
}

function disconnectedOverlay(doc: Document): boolean {
  if (!isConnOverlayOpen(doc)) return false;
  if (multiAccountOverlay(doc)) return false;
  const hint = (doc.getElementById("conn-hint")?.textContent ?? "").trim();
  const retry = (doc.getElementById("conn-retry")?.textContent ?? "").trim();
  return DISCONNECT_HINT_RE.test(`${hint}\n${retry}`) || isJogarPath();
}

export function detectReconnectReason(doc: Document, loc: Location): ReconnectReason | null {
  const path = loc.pathname || "/";

  if (pathIsHomepage(path)) return "homepage";
  if (isQueueOpen(doc)) return null;

  const sample = sampleText(doc);
  if (MAINT_RE.test(sample) || MAINT_RE.test(doc.title ?? "")) return "maintenance";
  if (multiAccountOverlay(doc) || MULTI_RE.test(sample)) return "multiAccount";
  if (disconnectedOverlay(doc)) return "disconnected";

  if (isJogarPath(path)) {
    if (Date.now() - startedAt < 20_000) return null;
    const hasWave = Boolean(doc.getElementById("wave-title"));
    if (!hasWave && !gameplayConnected() && !isConnOverlayOpen(doc)) return "stuck";
  }
  return null;
}

function findReconnectButton(doc: Document): HTMLElement | null {
  const retry = doc.getElementById("conn-retry");
  if (retry instanceof HTMLElement) return retry;
  const overlay = doc.getElementById("conn-overlay");
  if (overlay && !overlay.classList.contains("hidden")) {
    return overlay.querySelector<HTMLElement>("button, a.button, [role='button']");
  }
  return null;
}

function goToJogar(): void {
  const url = `${unsafeWindow.location.origin}/jogar/`;
  console.info(`[BaiakIdle Helper] reconnect → ${url}`);
  unsafeWindow.location.assign(url);
}

function reloadPage(): void {
  console.info("[BaiakIdle Helper] reconnect → reload");
  unsafeWindow.location.reload();
}

function minIntervalFor(reason: ReconnectReason, baseMs: number): number {
  switch (reason) {
    case "homepage":
      // Fast return to game from landing page.
      return Math.min(baseMs, 3_000);
    case "maintenance":
      return Math.max(baseMs, 60_000);
    case "multiAccount":
      return Math.max(baseMs, 45_000);
    case "stuck":
      return Math.max(baseMs, 25_000);
    case "disconnected":
    default:
      return baseMs;
  }
}

function act(reason: ReconnectReason, doc: Document): void {
  lastReason = reason;
  lastActionAt = Date.now();
  console.info(`[BaiakIdle Helper] reconnect action: ${reason}`);
  updateMiniBar();

  if (reason === "homepage") {
    goToJogar();
    return;
  }

  if (reason === "disconnected" || reason === "multiAccount") {
    const btn = findReconnectButton(doc);
    if (btn) {
      console.info("[BaiakIdle Helper] reconnect: click #conn-retry");
      btn.click();
      unsafeWindow.setTimeout(() => {
        if (
          isConnOverlayOpen(unsafeWindow.document) ||
          pathIsHomepage(unsafeWindow.location.pathname)
        ) {
          reloadPage();
        }
      }, 2_500);
      return;
    }
    reloadPage();
    return;
  }

  if (reason === "maintenance") {
    if (pathIsHomepage(unsafeWindow.location.pathname) || !isJogarPath()) goToJogar();
    else reloadPage();
    return;
  }

  reloadPage();
}

function reasonEnabled(reason: ReconnectReason, settings: Settings): boolean {
  switch (reason) {
    case "homepage":
      return settings.reconnectHomepage;
    case "maintenance":
      return settings.reconnectMaintenance;
    case "disconnected":
    case "stuck":
      return settings.reconnectDisconnected;
    case "multiAccount":
      return settings.reconnectMultiAccount;
    default:
      return false;
  }
}

export function tickAutoReconnect(settings?: Settings): void {
  const page = unsafeWindow;
  const cfg = settings ?? readLiveSettings();
  const reason = detectReconnectReason(page.document, page.location);

  if (!cfg.autoReconnect) {
    const now = Date.now();
    if (now - lastSkipLogAt > 12_000) {
      lastSkipLogAt = now;
      console.info(
        `[BaiakIdle Helper] reconnect idle: autoReconnect=OFF path=${page.location.pathname}` +
          (reason ? ` (would act: ${reason})` : "")
      );
    }
    updateMiniBar();
    return;
  }

  if (!reason) {
    updateMiniBar();
    return;
  }
  if (!reasonEnabled(reason, cfg)) {
    console.info(
      `[BaiakIdle Helper] reconnect skip: reason=${reason} but sub-option OFF`
    );
    updateMiniBar();
    return;
  }

  const wait = minIntervalFor(reason, cfg.reconnectIntervalMs);
  if (Date.now() - lastActionAt < wait) {
    updateMiniBar();
    return;
  }

  act(reason, page.document);
}

/** Tiny bar on non-/jogar pages so user can enable reconnect without HUD. */
function ensureMiniBar(): HTMLElement | null {
  const page = unsafeWindow;
  if (isJogarPath()) {
    page.document.getElementById(MINI_BAR_ID)?.remove();
    return null;
  }
  let bar = page.document.getElementById(MINI_BAR_ID);
  if (bar) return bar;
  if (!page.document.body) return null;

  bar = page.document.createElement("div");
  bar.id = MINI_BAR_ID;
  bar.innerHTML = `
    <style>
      #${MINI_BAR_ID}{
        position:fixed;z-index:2147483646;right:12px;bottom:12px;
        display:flex;flex-direction:column;gap:6px;min-width:200px;max-width:280px;
        padding:10px 12px;border:1px solid #5c5c56;border-radius:8px;
        background:linear-gradient(180deg,rgba(40,40,38,.96),rgba(22,22,20,.96));
        color:#eae8e2;font:12px/1.35 system-ui,"Segoe UI",sans-serif;
        box-shadow:0 10px 28px rgba(0,0,0,.55);
      }
      #${MINI_BAR_ID} b{color:#e8c34e;font-size:11px;letter-spacing:.04em;text-transform:uppercase}
      #${MINI_BAR_ID} .st{color:#a9a69d;font-size:11px}
      #${MINI_BAR_ID} .st.on{color:#7dcea0}
      #${MINI_BAR_ID} .row{display:flex;gap:6px;align-items:center}
      #${MINI_BAR_ID} button{
        all:unset;box-sizing:border-box;cursor:pointer;flex:1;text-align:center;
        padding:6px 8px;border:1px solid #5c5c56;border-radius:5px;
        background:#1c1c1a;color:#eae8e2;font:700 11px system-ui;
      }
      #${MINI_BAR_ID} button.primary{border-color:#e8c34e;color:#fff6c9;background:rgba(95,81,30,.55)}
      #${MINI_BAR_ID} button:hover{border-color:#e8c34e}
    </style>
    <b>Helper · Reconnect</b>
    <div class="st" data-st></div>
    <div class="row">
      <button type="button" data-act="toggle">Ligar</button>
      <button type="button" data-act="now" class="primary">Ir /jogar</button>
    </div>
  `;
  bar.querySelector<HTMLButtonElement>('[data-act="toggle"]')?.addEventListener("click", () => {
    const cfg = readLiveSettings();
    const next = !cfg.autoReconnect;
    persistPartial({
      autoReconnect: next,
      reconnectHomepage: true,
      reconnectDisconnected: true,
      reconnectMaintenance: true
    });
    console.info(`[BaiakIdle Helper] reconnect mini: autoReconnect=${next}`);
    updateMiniBar();
    if (next) tickAutoReconnect();
  });
  bar.querySelector<HTMLButtonElement>('[data-act="now"]')?.addEventListener("click", () => {
    goToJogar();
  });
  page.document.body.append(bar);
  return bar;
}

function updateMiniBar(): void {
  if (isJogarPath()) return;
  const bar = ensureMiniBar();
  if (!bar) return;
  const cfg = readLiveSettings();
  const reason = detectReconnectReason(unsafeWindow.document, unsafeWindow.location);
  const st = bar.querySelector<HTMLElement>("[data-st]");
  const toggle = bar.querySelector<HTMLButtonElement>('[data-act="toggle"]');
  if (st) {
    st.classList.toggle("on", cfg.autoReconnect);
    st.textContent = cfg.autoReconnect
      ? `ON · ${reason ?? "aguardando"} · path ${unsafeWindow.location.pathname}`
      : `OFF · ligue para auto /jogar · path ${unsafeWindow.location.pathname}`;
  }
  if (toggle) toggle.textContent = cfg.autoReconnect ? "Desligar" : "Ligar";
}

export function startReconnectWatcher(getSettings: () => Settings): void {
  getSettingsExternal = getSettings;
  startedAt = Date.now();
  lastActionAt = 0;
  lastReason = null;

  const page = unsafeWindow;
  page.setInterval(() => {
    try {
      tickAutoReconnect();
    } catch (err) {
      console.warn("[BaiakIdle Helper] reconnect tick error", err);
    }
  }, 1_500);

  // Homepage: try quickly once settings allow.
  page.setTimeout(() => {
    try {
      tickAutoReconnect();
    } catch {
      /* ignore */
    }
  }, 1_200);

  // Mini bar after body exists
  const mountMini = () => {
    try {
      updateMiniBar();
    } catch {
      /* ignore */
    }
  };
  if (page.document.body) mountMini();
  else page.document.addEventListener("DOMContentLoaded", mountMini, { once: true });
  page.setTimeout(mountMini, 500);

  console.info(
    `[BaiakIdle Helper] reconnect watcher ready path=${page.location.pathname} ` +
      `autoReconnect=${readLiveSettings().autoReconnect}`
  );
}

export function lastReconnectReason(): ReconnectReason | null {
  return lastReason;
}
