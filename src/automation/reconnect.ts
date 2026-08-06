/**
 * Auto Reconnect — multi-state recovery for BaiakIdle.
 *
 * Homepage hop:
 * - Only exact path `/` (never other /* pages — free site navigation)
 * - Wait 10s, then → /jogar/
 * - Session Pause (sessionStorage) blocks auto actions until unpaused
 *
 * Maintenance:
 * - Home "Em Manutenção" never flips to "Jogar Agora" → go to /jogar to watch
 * - /jogar "JOGO EM MANUTENÇÃO": no 3s thrash; reload every 30s; also detect
 *   overlay disappearing live without reload
 *
 * Other: disconnected / multiAccount / stuck on /jogar
 */
import { gameplayConnected } from "../socket";
import {
  defaults,
  loadSettings,
  saveSettings,
  type Settings
} from "./settings";
import { isConnOverlayOpen, isQueueOpen } from "./state";

declare const unsafeWindow: Window & typeof globalThis;

export type ReconnectReason =
  | "homepage"
  | "maintenanceHome"
  | "maintenanceJogar"
  | "disconnected"
  | "multiAccount"
  | "stuck";

const MAINT_RE =
  /jogo\s*em\s*manuten[cç][aã]o|servidor\s*est[aá]\s*em\s*manuten|em\s*manuten[cç][aã]o|under\s*maintenance|game\s*under\s*maintenance/i;

/**
 * Multi-account / IP concurrent session:
 * - Title: "LIMITE DE CONTAS SIMULTÂNEAS"
 * - Hint: "Já existe uma conta jogando nesta conexão…"
 * - Also session takeover elsewhere ("Reassumir aqui")
 */
const MULTI_RE =
  /limite\s*de\s*contas\s*simult|contas\s*simult[aâ]ne|simultaneous\s*accounts|j[aá]\s*existe\s*uma\s*conta|mais\s*de\s*uma\s*conta|s[oó]\s*[eé]\s*permitido\s*uma\s*por\s*vez|desconectar\s*sess[aã]o\s*do\s*jogo|sess[aã]o\s*aberta\s*em\s*outro|assumida\s*em\s*outro|outra\s*aba\s*ou\s*dispositivo|taken\s*over|another\s*device|another\s*tab|only\s*one\s*at\s*a\s*time/i;

const DISCONNECT_HINT_RE =
  /reconectando\s*em|reconectar\s*agora|desconectad|disconnected|reconnecting/i;

/** Exact homepage only — not /ranking, /blog, etc. */
const HOMEPAGE_DELAY_MS = 10_000;
/** While /jogar shows maintenance modal, soft-refresh cadence. */
const MAINT_JOGAR_RELOAD_MS = 30_000;

const MINI_BAR_ID = "baiak-reconnect-mini";
const SS_PAUSE = "baiakidle-helper-rc-pause";
const SS_MAINT_WATCH = "baiakidle-helper-maint-watch";
const VALID_HUNT_IDS = new Set<string>();

let lastActionAt = 0;
let lastReason: ReconnectReason | null = null;
let startedAt = Date.now();
let lastSkipLogAt = 0;
let lastMaintLogAt = 0;
let getSettingsExternal: (() => Settings) | null = null;

export function isJogarPath(pathname = unsafeWindow.location.pathname): boolean {
  return /^\/jogar(\/|$)/i.test(pathname);
}

/** Bare site home only (`/` or empty). Other /* must never auto-hop to /jogar. */
export function pathIsHomepage(pathname: string): boolean {
  const p = (pathname || "/").replace(/\/+$/, "") || "/";
  return p === "/";
}

function ssGet(key: string): boolean {
  try {
    return unsafeWindow.sessionStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function ssSet(key: string, on: boolean): void {
  try {
    if (on) unsafeWindow.sessionStorage.setItem(key, "1");
    else unsafeWindow.sessionStorage.removeItem(key);
  } catch {
    /* private mode */
  }
}

export function isReconnectSessionPaused(): boolean {
  return ssGet(SS_PAUSE);
}

export function setReconnectSessionPaused(paused: boolean): void {
  ssSet(SS_PAUSE, paused);
  console.info(`[BaiakIdle Helper] reconnect session pause=${paused}`);
  updateMiniBar();
}

function isMaintWatch(): boolean {
  return ssGet(SS_MAINT_WATCH);
}

function setMaintWatch(on: boolean): void {
  ssSet(SS_MAINT_WATCH, on);
}

function readLiveSettings(): Settings {
  try {
    if (getSettingsExternal) {
      const live = getSettingsExternal();
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
  if (main) {
    const t = (main.textContent ?? "").trim();
    if (t.length > 0) parts.push(t.slice(0, 2_500));
  }
  return parts.join("\n");
}

/** Visible #conn-overlay with JOGO EM MANUTENÇÃO (on /jogar). */
function maintenanceOverlayOpen(doc: Document): boolean {
  const overlay = doc.getElementById("conn-overlay");
  if (!overlay || overlay.classList.contains("hidden")) return false;
  return MAINT_RE.test(overlay.textContent ?? "");
}

/** Homepage CTA still "Em Manutenção" (button never flips by itself). */
function maintenanceHomeCta(doc: Document): boolean {
  for (const el of doc.querySelectorAll<HTMLElement>("a, button, [role='button']")) {
    const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
    if (text && MAINT_RE.test(text)) return true;
  }
  return MAINT_RE.test(doc.title ?? "") || MAINT_RE.test(sampleText(doc));
}

function looksLikeMaintenance(doc: Document): boolean {
  return maintenanceOverlayOpen(doc) || maintenanceHomeCta(doc);
}

function multiAccountOverlay(doc: Document): boolean {
  const overlay = doc.getElementById("conn-overlay");
  if (!overlay || overlay.classList.contains("hidden")) return false;
  const title = (overlay.querySelector(".auth-title")?.textContent ?? "").trim();
  const hint = (doc.getElementById("conn-hint")?.textContent ?? "").trim();
  const retry = (doc.getElementById("conn-retry")?.textContent ?? "").trim();
  const blob = `${title}\n${hint}\n${retry}\n${overlay.textContent ?? ""}`;
  return MULTI_RE.test(blob) || /reassumir/i.test(retry);
}

function disconnectedOverlay(doc: Document): boolean {
  if (!isConnOverlayOpen(doc)) return false;
  if (multiAccountOverlay(doc)) return false;
  if (maintenanceOverlayOpen(doc)) return false;
  const hint = (doc.getElementById("conn-hint")?.textContent ?? "").trim();
  const retry = (doc.getElementById("conn-retry")?.textContent ?? "").trim();
  return DISCONNECT_HINT_RE.test(`${hint}\n${retry}`) || isJogarPath();
}

export function detectReconnectReason(doc: Document, loc: Location): ReconnectReason | null {
  const path = loc.pathname || "/";
  const sample = sampleText(doc);

  // /jogar maintenance modal
  if (isJogarPath(path) && maintenanceOverlayOpen(doc)) return "maintenanceJogar";

  // Exact home with "Em Manutenção" CTA
  if (pathIsHomepage(path) && maintenanceHomeCta(doc)) return "maintenanceHome";

  // Only bare `/` auto-enters game (never other site pages)
  if (pathIsHomepage(path)) return "homepage";

  if (isQueueOpen(doc)) return null;
  if (multiAccountOverlay(doc) || MULTI_RE.test(sample)) return "multiAccount";
  if (disconnectedOverlay(doc)) return "disconnected";

  if (isJogarPath(path)) {
    if (Date.now() - startedAt < 20_000) return null;
    const wave = (doc.getElementById("wave-title")?.textContent ?? "").trim();
    const waveOk = wave.length > 0 && wave !== "—";
    if (!waveOk && !gameplayConnected() && !isConnOverlayOpen(doc)) return "stuck";
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

function goToJogar(fromMaint = false): void {
  if (fromMaint) setMaintWatch(true);
  const url = `${unsafeWindow.location.origin}/jogar/`;
  console.info(
    `[BaiakIdle Helper] reconnect → ${url}${fromMaint ? " (maint watch)" : ""}`
  );
  unsafeWindow.location.assign(url);
}

function reloadPage(): void {
  console.info("[BaiakIdle Helper] reconnect → reload");
  unsafeWindow.location.reload();
}

function minIntervalFor(reason: ReconnectReason, baseMs: number): number {
  switch (reason) {
    case "homepage":
    case "maintenanceHome":
      return HOMEPAGE_DELAY_MS;
    case "maintenanceJogar":
      return MAINT_JOGAR_RELOAD_MS;
    case "multiAccount":
      // Fixed 10s retry for "LIMITE DE CONTAS SIMULTÂNEAS".
      return 10_000;
    case "stuck":
      return Math.max(baseMs, 25_000);
    case "disconnected":
    default:
      return Math.max(baseMs, 10_000);
  }
}

function act(reason: ReconnectReason, doc: Document): void {
  lastReason = reason;
  lastActionAt = Date.now();
  console.info(`[BaiakIdle Helper] reconnect action: ${reason}`);
  updateMiniBar();

  if (reason === "homepage") {
    goToJogar(false);
    return;
  }

  if (reason === "maintenanceHome") {
    // Home CTA never self-updates — park on /jogar maint modal to watch.
    goToJogar(true);
    return;
  }

  if (reason === "maintenanceJogar") {
    // Soft refresh every 30s while modal still present.
    setMaintWatch(true);
    reloadPage();
    return;
  }

  if (reason === "disconnected" || reason === "multiAccount") {
    const btn = findReconnectButton(doc);
    if (btn) {
      console.info(
        `[BaiakIdle Helper] reconnect: click #conn-retry (${reason})`
      );
      btn.click();
      // Multi-account "Tentar de novo" only reloads — if still blocked, next tick retries.
      unsafeWindow.setTimeout(() => {
        if (looksLikeMaintenance(unsafeWindow.document)) return;
        if (
          isConnOverlayOpen(unsafeWindow.document) ||
          pathIsHomepage(unsafeWindow.location.pathname)
        ) {
          reloadPage();
        }
      }, reason === "multiAccount" ? 1_200 : 2_500);
      return;
    }
    reloadPage();
    return;
  }

  reloadPage();
}

function reasonEnabled(reason: ReconnectReason, settings: Settings): boolean {
  switch (reason) {
    case "homepage":
      return settings.reconnectHomepage;
    case "maintenanceHome":
    case "maintenanceJogar":
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

/**
 * If we were watching maint on /jogar and the modal is gone, clear the flag.
 * Game may reconnect itself; otherwise disconnected/stuck handlers take over.
 */
function clearMaintWatchIfEnded(doc: Document): void {
  if (!isJogarPath()) return;
  if (!isMaintWatch()) return;
  if (maintenanceOverlayOpen(doc)) return;
  setMaintWatch(false);
  console.info(
    "[BaiakIdle Helper] reconnect: JOGO EM MANUTENÇÃO sumiu — maint watch off"
  );
}

export function tickAutoReconnect(settings?: Settings): void {
  const page = unsafeWindow;
  const cfg = settings ?? readLiveSettings();
  const doc = page.document;

  clearMaintWatchIfEnded(doc);

  const reason = detectReconnectReason(doc, page.location);
  const paused = isReconnectSessionPaused();

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

  if (paused) {
    const now = Date.now();
    if (now - lastSkipLogAt > 12_000) {
      lastSkipLogAt = now;
      console.info(
        `[BaiakIdle Helper] reconnect session PAUSED path=${page.location.pathname}` +
          (reason ? ` (held: ${reason})` : "")
      );
    }
    updateMiniBar();
    return;
  }

  if (!reason) {
    updateMiniBar();
    return;
  }

  // Live detect: maint overlay gone on /jogar between 30s reloads — no action needed.
  if (reason === "maintenanceJogar") {
    lastReason = reason;
    // fall through to interval reload
  }

  if (!reasonEnabled(reason, cfg)) {
    if (Date.now() - lastSkipLogAt > 12_000) {
      lastSkipLogAt = Date.now();
      console.info(
        `[BaiakIdle Helper] reconnect skip: reason=${reason} but sub-option OFF`
      );
    }
    updateMiniBar();
    return;
  }

  const wait = minIntervalFor(reason, cfg.reconnectIntervalMs);
  if (Date.now() - lastActionAt < wait) {
    if (
      (reason === "maintenanceJogar" || reason === "maintenanceHome") &&
      Date.now() - lastMaintLogAt > 15_000
    ) {
      lastMaintLogAt = Date.now();
      const left = Math.ceil((wait - (Date.now() - lastActionAt)) / 1_000);
      console.info(
        `[BaiakIdle Helper] reconnect: ${reason} — next in ~${left}s path=${page.location.pathname}`
      );
    }
    updateMiniBar();
    return;
  }

  act(reason, doc);
}

/** Mini bar on non-/jogar so user can pause / force /jogar without full HUD. */
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
        display:flex;flex-direction:column;gap:6px;min-width:220px;max-width:300px;
        padding:10px 12px;border:1px solid #5c5c56;border-radius:8px;
        background:linear-gradient(180deg,rgba(40,40,38,.96),rgba(22,22,20,.96));
        color:#eae8e2;font:12px/1.35 system-ui,"Segoe UI",sans-serif;
        box-shadow:0 10px 28px rgba(0,0,0,.55);
      }
      #${MINI_BAR_ID} b{color:#e8c34e;font-size:11px;letter-spacing:.04em;text-transform:uppercase}
      #${MINI_BAR_ID} .st{color:#a9a69d;font-size:11px}
      #${MINI_BAR_ID} .st.on{color:#7dcea0}
      #${MINI_BAR_ID} .st.pause{color:#e8a54e}
      #${MINI_BAR_ID} .row{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
      #${MINI_BAR_ID} button{
        all:unset;box-sizing:border-box;cursor:pointer;flex:1;text-align:center;
        padding:6px 8px;border:1px solid #5c5c56;border-radius:5px;
        background:#1c1c1a;color:#eae8e2;font:700 11px system-ui;
      }
      #${MINI_BAR_ID} button.primary{border-color:#e8c34e;color:#fff6c9;background:rgba(95,81,30,.55)}
      #${MINI_BAR_ID} button.pause-on{border-color:#e8a54e;color:#ffd9a0}
      #${MINI_BAR_ID} button:hover{border-color:#e8c34e}
    </style>
    <b>Helper · Reconnect</b>
    <div class="st" data-st></div>
    <div class="row">
      <button type="button" data-act="toggle">Ligar</button>
      <button type="button" data-act="pause">Pause</button>
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
      reconnectMaintenance: true,
      reconnectMultiAccount: true
    });
    console.info(`[BaiakIdle Helper] reconnect mini: autoReconnect=${next}`);
    updateMiniBar();
    if (next) tickAutoReconnect();
  });
  bar.querySelector<HTMLButtonElement>('[data-act="pause"]')?.addEventListener("click", () => {
    setReconnectSessionPaused(!isReconnectSessionPaused());
  });
  bar.querySelector<HTMLButtonElement>('[data-act="now"]')?.addEventListener("click", () => {
    // Manual always allowed (user intent).
    goToJogar(looksLikeMaintenance(unsafeWindow.document));
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
  const paused = isReconnectSessionPaused();
  const st = bar.querySelector<HTMLElement>("[data-st]");
  const toggle = bar.querySelector<HTMLButtonElement>('[data-act="toggle"]');
  const pauseBtn = bar.querySelector<HTMLButtonElement>('[data-act="pause"]');
  const path = unsafeWindow.location.pathname;
  const homeOnly = pathIsHomepage(path);

  if (st) {
    st.classList.toggle("on", cfg.autoReconnect && !paused);
    st.classList.toggle("pause", paused);
    if (!cfg.autoReconnect) {
      st.textContent = `OFF · path ${path}`;
    } else if (paused) {
      st.textContent = `PAUSADO (sessão) · path ${path} · despause p/ auto`;
    } else if (reason === "maintenanceHome") {
      st.textContent = `ON · maint home → /jogar em 10s · ${path}`;
    } else if (reason === "homepage") {
      st.textContent = homeOnly
        ? `ON · home → /jogar em 10s`
        : `ON · path ${path} (auto só em /)`;
    } else {
      st.textContent = `ON · ${reason ?? "ok"} · ${path}${homeOnly ? "" : " (sem auto hop)"}`;
    }
  }
  if (toggle) toggle.textContent = cfg.autoReconnect ? "Desligar" : "Ligar";
  if (pauseBtn) {
    pauseBtn.textContent = paused ? "Retomar" : "Pause";
    pauseBtn.classList.toggle("pause-on", paused);
  }
}

export function startReconnectWatcher(getSettings: () => Settings): void {
  getSettingsExternal = getSettings;
  startedAt = Date.now();
  // Force first homepage/maint action to wait full delay (not immediate on load).
  lastActionAt = Date.now();
  lastReason = null;

  const page = unsafeWindow;
  page.setInterval(() => {
    try {
      tickAutoReconnect();
    } catch (err) {
      console.warn("[BaiakIdle Helper] reconnect tick error", err);
    }
  }, 1_500);

  page.setTimeout(() => {
    try {
      tickAutoReconnect();
    } catch {
      /* ignore */
    }
  }, 1_200);

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
      `autoReconnect=${readLiveSettings().autoReconnect} ` +
      `sessionPause=${isReconnectSessionPaused()} maintWatch=${isMaintWatch()}`
  );
}

export function lastReconnectReason(): ReconnectReason | null {
  return lastReason;
}
