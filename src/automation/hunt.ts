import { cityPresencePacket, modePacket, stagePacket } from "../packets";
import { gameplayConnected, sendRawPacket } from "../socket";
import { huntById } from "../data/hunts";
import type { Settings } from "./settings";
import {
  inTreinoOnline,
  isAlreadyInHunt,
  isHuntBlocked,
  isInCity,
  readStaminaMinutes,
  waveTitle
} from "./state";

declare const unsafeWindow: Window & typeof globalThis;

const COOLDOWN_MS = 6_000;
const FALLBACK_DELAY_MS = 2_000;
const STAMINA_ROUTE_COOLDOWN_MS = 8_000;
const TELEPORT_WAIT_MS = 3_500;
const TREINO_CONFIRM_MS = 4_000;
/** City → hunt can take a few seconds after stage; do not open DOM early. */
const HUNT_CONFIRM_MS = 5_500;
const HUNT_RETRY_CONFIRM_MS = 3_500;

let entering = false;
let lastAttemptAt = 0;
let lastHuntId: string | null = null;
let lastStaminaRouteAt = 0;
let staminaRouteBusy = false;
let lastSkipLogAt = 0;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => {
    unsafeWindow.setTimeout(resolve, ms);
  });
}

function click(el: Element | null | undefined): boolean {
  if (!el) return false;
  const node = el as HTMLElement;
  // Game listens to normal click; fire a fuller pointer sequence for safety.
  try {
    node.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true }));
    node.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    node.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, cancelable: true }));
    node.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
  } catch {
    /* older engines */
  }
  node.click();
  return true;
}

function waitForSelector(doc: Document, selector: string, timeoutMs: number): Promise<Element | null> {
  return new Promise(resolve => {
    const existing = doc.querySelector(selector);
    if (existing) {
      resolve(existing);
      return;
    }
    const observer = new MutationObserver(() => {
      const found = doc.querySelector(selector);
      if (found) {
        observer.disconnect();
        resolve(found);
      }
    });
    observer.observe(doc.documentElement, { childList: true, subtree: true });
    unsafeWindow.setTimeout(() => {
      observer.disconnect();
      resolve(doc.querySelector(selector));
    }, timeoutMs);
  });
}

async function waitUntil(
  pred: () => boolean,
  timeoutMs: number,
  stepMs = 200
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (pred()) return true;
    await sleep(stepMs);
  }
  return pred();
}

function clearHuntSearch(doc: Document): void {
  const input = doc.querySelector<HTMLInputElement>(
    "#picker-modal input.pick-search, .pick-search[placeholder]"
  );
  if (!input) return;
  input.value = "";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

/** DOM fallback: teleport → Hunts → stage-row → Caçar. */
async function enterHuntViaDom(doc: Document, huntId: string, huntName: string): Promise<boolean> {
  const wave = doc.getElementById("wave-title");
  if (!wave) return false;
  click(wave);
  await sleep(350);

  const huntsBtn = await waitForSelector(
    doc,
    'button.tp-opt[data-tp="hunts"], #teleport-menu button.tp-opt[data-tp="hunts"]',
    TELEPORT_WAIT_MS
  );
  if (!click(huntsBtn)) {
    const byText = [...doc.querySelectorAll("button.tp-opt, button")].find(btn =>
      /^(hunts|fases)$/i.test((btn.textContent ?? "").trim())
    );
    if (!click(byText ?? null)) return false;
  }
  await sleep(400);

  await waitForSelector(doc, "#picker-modal .stage-row, .hunt-grid .stage-row", 2_000);
  clearHuntSearch(doc);

  const allBtn = [...doc.querySelectorAll("button.sp-cat, button.pick-leanbtn, button")].find(btn =>
    /^(todas|all)$/i.test((btn.textContent ?? "").trim())
  );
  if (allBtn) {
    click(allBtn);
    await sleep(250);
  }

  const rows = [...doc.querySelectorAll<HTMLElement>(".hunt-grid .stage-row, #picker-modal .stage-row")];
  const target =
    rows.find(row => row.dataset.hunt === huntId) ??
    rows.find(row => {
      const nameEl = row.querySelector(".stage-name-line b, b");
      return (nameEl?.textContent ?? "").trim().toLowerCase() === huntName.toLowerCase();
    });

  if (!target) return false;
  if (!target.classList.contains("expanded")) {
    click(target);
    await sleep(300);
  }

  const go =
    target.querySelector<HTMLButtonElement>("button.stage-go") ??
    [...target.querySelectorAll("button")].find(btn =>
      /caçar|cacar|hunt|atual/i.test((btn.textContent ?? "").trim())
    );
  if (!go || go.disabled) return false;
  click(go);
  return true;
}

/**
 * Open teleport menu and click Treino online.
 * Menu nodes only exist after #wave-title is clicked.
 * Works from city or hunt (same native handler: mode { mode: "exercise" }).
 */
async function goToTreinoViaDom(doc: Document): Promise<boolean> {
  const wave = doc.getElementById("wave-title");
  if (!wave) {
    console.warn("[BaiakIdle Helper] treino DOM: #wave-title missing");
    return false;
  }

  // Close leftover picker if open, then open teleport.
  const pickerClose = doc.querySelector<HTMLElement>(
    "#picker-modal .pick-close, #picker-modal button.close, .modal-close"
  );
  if (pickerClose) click(pickerClose);

  click(wave);
  console.info("[BaiakIdle Helper] treino DOM: opened teleport via #wave-title");

  const exerciseBtn = await waitForSelector(
    doc,
    'button.tp-opt[data-tp="exercise"], #teleport-menu .tp-opt[data-tp="exercise"], [data-tp="exercise"]',
    TELEPORT_WAIT_MS
  );

  if (exerciseBtn) {
    if ((exerciseBtn as HTMLButtonElement).disabled) {
      console.warn("[BaiakIdle Helper] treino DOM: data-tp=exercise is disabled");
      return false;
    }
    const ok = click(exerciseBtn);
    console.info(`[BaiakIdle Helper] treino DOM: click data-tp=exercise → ${ok}`);
    return ok;
  }

  const byText = [...doc.querySelectorAll("button.tp-opt, button, [role='menuitem']")].find(btn =>
    /treino\s*online|online\s*training/i.test((btn.textContent ?? "").trim())
  );
  if (byText) {
    const ok = click(byText);
    console.info(`[BaiakIdle Helper] treino DOM: click by text → ${ok}`);
    return ok;
  }

  const menu = doc.getElementById("teleport-menu");
  const opts = [...doc.querySelectorAll("button.tp-opt, [data-tp]")].map(b => {
    const el = b as HTMLElement;
    return `${el.dataset.tp ?? "?"}:${(el.textContent ?? "").trim()}`;
  });
  console.warn(
    `[BaiakIdle Helper] treino DOM: exercise button not found. menu=${Boolean(menu)} ` +
      `menuHtml=${menu ? "yes" : "no"} opts=[${opts.join(", ")}]`
  );
  return false;
}

async function confirmTreino(doc: Document): Promise<boolean> {
  return waitUntil(() => inTreinoOnline(doc, doc.title ?? ""), TREINO_CONFIRM_MS);
}

/** Only true when wave title matches the hunt — never treat "—" / mid-transition as success. */
async function confirmHuntEnter(doc: Document, huntName: string, timeoutMs: number): Promise<boolean> {
  return waitUntil(() => isAlreadyInHunt(doc, huntName), timeoutMs);
}

/**
 * Prefer native `stage { huntId }` on the room WS (works from city and treino).
 * DOM teleport is last resort only after WS attempts fail — avoids flashing the picker.
 */
async function enterHuntNativeOrDom(
  doc: Document,
  huntId: string,
  huntName: string
): Promise<boolean> {
  if (isAlreadyInHunt(doc, huntName)) {
    lastHuntId = huntId;
    return true;
  }

  const tryStage = async (label: string, timeoutMs: number): Promise<boolean> => {
    if (!gameplayConnected()) return false;
    // Leaving city canvas: client often clears away before mode/stage.
    if (isInCity(doc)) {
      sendRawPacket(cityPresencePacket(false));
      await sleep(80);
    }
    const sent = sendRawPacket(stagePacket(huntId));
    console.info(
      `[BaiakIdle Helper] auto hunt: ${label} stage ${huntId} (${huntName}) sent=${sent} ` +
        `wave="${waveTitle(doc)}" city=${isInCity(doc)}`
    );
    if (!sent) return false;
    if (await confirmHuntEnter(doc, huntName, timeoutMs)) {
      lastHuntId = huntId;
      console.info(`[BaiakIdle Helper] auto hunt: stage confirmed → "${waveTitle(doc)}"`);
      return true;
    }
    console.info(
      `[BaiakIdle Helper] auto hunt: stage not confirmed after ${timeoutMs}ms ` +
        `(wave="${waveTitle(doc)}" city=${isInCity(doc)})`
    );
    return false;
  };

  if (await tryStage("WS", HUNT_CONFIRM_MS)) return true;
  if (await tryStage("WS-retry", HUNT_RETRY_CONFIRM_MS)) return true;

  if (!gameplayConnected()) {
    console.info("[BaiakIdle Helper] auto hunt: no room WS — DOM fallback");
  } else {
    console.info(
      `[BaiakIdle Helper] auto hunt: WS stage failed twice — DOM fallback ` +
        `(wave="${waveTitle(doc)}")`
    );
  }

  const ok = await enterHuntViaDom(doc, huntId, huntName);
  if (ok) {
    // DOM click may still take a moment to apply.
    if (await confirmHuntEnter(doc, huntName, HUNT_RETRY_CONFIRM_MS) || ok) {
      console.info(`[BaiakIdle Helper] auto hunt: DOM enter ${huntId}`);
      lastHuntId = huntId;
      return true;
    }
  }

  console.warn(
    `[BaiakIdle Helper] auto hunt: failed for ${huntId} (wave="${waveTitle(doc)}")`
  );
  return false;
}

/**
 * Stamina routing while Auto Hunt stays ON:
 * - stamina ≤ toTreino + not in Treino (city or hunt) → Treino online
 * - stamina ≥ toHunt + in Treino online → selected hunt
 */
export async function maybeStaminaHuntRoute(
  settings: Settings,
  doc: Document
): Promise<"treino" | "hunt" | false> {
  if (!settings.autoHunt || !settings.autoHuntTreinoOnLowStamina) return false;
  if (entering || staminaRouteBusy) return false;
  if (isHuntBlocked(doc)) return false;

  const stamina = readStaminaMinutes(doc);
  if (stamina === undefined) {
    logSkipThrottled(
      `stamina unreadable wave="${waveTitle(doc)}" #stamina-time missing/format`
    );
    return false;
  }

  const toTreino = settings.autoHuntStaminaToTreinoMinutes;
  const toHunt = settings.autoHuntStaminaToHuntMinutes;
  const inTreino = inTreinoOnline(doc, doc.title ?? "");
  const city = isInCity(doc);
  const hunt = huntById(settings.selectedHuntId);
  const now = Date.now();
  if (now - lastStaminaRouteAt < STAMINA_ROUTE_COOLDOWN_MS) return false;

  // Recovered enough while training → go back to hunt.
  if (inTreino && stamina >= toHunt) {
    if (!hunt) {
      logSkipThrottled(`stamina ${stamina}m ≥ huntLimit ${toHunt}m but no hunt selected`);
      return false;
    }
    if (isAlreadyInHunt(doc, hunt.name)) return false;

    lastStaminaRouteAt = now;
    staminaRouteBusy = true;
    entering = true;
    try {
      console.info(
        `[BaiakIdle Helper] stamina ${stamina}m ≥ huntLimit ${toHunt}m in Treino — entering hunt ${hunt.id}`
      );
      await enterHuntNativeOrDom(doc, hunt.id, hunt.name);
      return "hunt";
    } finally {
      entering = false;
      staminaRouteBusy = false;
    }
  }

  // Low stamina outside Treino (city OR hunt) → Treino online. Auto Hunt stays ON.
  if (!inTreino && stamina <= toTreino) {
    lastStaminaRouteAt = now;
    staminaRouteBusy = true;
    try {
      console.info(
        `[BaiakIdle Helper] stamina ${stamina}m ≤ treinoLimit ${toTreino}m ` +
          `wave="${waveTitle(doc)}" city=${city} gameplay=${gameplayConnected()} — going to Treino online`
      );

      // City still has gameplay WS (probe: mode:exercise on rt2 works from city).
      // Prefer WS first everywhere; DOM is only fallback if mode does not stick.
      if (gameplayConnected()) {
        // Mirror client Bae(): when leaving city canvas, clear away before mode.
        if (city) {
          const presence = sendRawPacket(cityPresencePacket(false));
          console.info(`[BaiakIdle Helper] cityPresence away=false sent=${presence}`);
          await sleep(120);
        }
        const sent = sendRawPacket(modePacket("exercise"));
        console.info(`[BaiakIdle Helper] mode:exercise sent=${sent}`);
        if (sent && (await confirmTreino(doc))) {
          console.info("[BaiakIdle Helper] Treino online confirmed via WS");
          return "treino";
        }
      } else {
        console.info("[BaiakIdle Helper] no gameplay WS — DOM teleport for Treino");
      }

      const okDom = await goToTreinoViaDom(doc);
      if (okDom && (await confirmTreino(doc))) {
        console.info("[BaiakIdle Helper] Treino online confirmed via DOM");
        return "treino";
      }

      // Retry WS once after DOM (menu path may re-bind / wake the room).
      if (gameplayConnected()) {
        if (city) sendRawPacket(cityPresencePacket(false));
        const sent = sendRawPacket(modePacket("exercise"));
        console.info(`[BaiakIdle Helper] mode:exercise retry sent=${sent}`);
        if (sent && (await confirmTreino(doc))) {
          console.info("[BaiakIdle Helper] Treino online confirmed via WS retry");
          return "treino";
        }
      }

      console.warn(
        `[BaiakIdle Helper] Treino online NOT confirmed (wave="${waveTitle(doc)}" ` +
          `city=${city} gameplay=${gameplayConnected()}) — will retry`
      );
      return false;
    } finally {
      staminaRouteBusy = false;
    }
  }

  return false;
}

function logSkipThrottled(msg: string): void {
  const now = Date.now();
  if (now - lastSkipLogAt < 15_000) return;
  lastSkipLogAt = now;
  console.info(`[BaiakIdle Helper] stamina-route skip: ${msg}`);
}

/**
 * Enter the selected hunt when the player is in the city (and stamina allows).
 * Primary: WS `stage { huntId }`. Fallback: teleport modal DOM.
 */
export async function runAutoHunt(settings: Settings, doc: Document): Promise<boolean> {
  if (!settings.autoHunt || entering || staminaRouteBusy) return false;
  if (isHuntBlocked(doc)) return false;

  // Stamina routing owns low-stamina transitions and treino→hunt re-entry.
  if (settings.autoHuntTreinoOnLowStamina) {
    const stamina = readStaminaMinutes(doc);
    if (stamina !== undefined) {
      if (stamina <= settings.autoHuntStaminaToTreinoMinutes) return false;
      if (inTreinoOnline(doc, doc.title ?? "")) return false;
    }
  }

  const hunt = huntById(settings.selectedHuntId);
  if (!hunt) return false;

  if (isAlreadyInHunt(doc, hunt.name)) {
    lastHuntId = hunt.id;
    return false;
  }
  if (!isInCity(doc)) return false;

  const now = Date.now();
  if (now - lastAttemptAt < COOLDOWN_MS) return false;
  lastAttemptAt = now;
  entering = true;

  try {
    return await enterHuntNativeOrDom(doc, hunt.id, hunt.name);
  } finally {
    entering = false;
  }
}

export function isHuntEntering(): boolean {
  return entering || staminaRouteBusy;
}

export function lastAutoHuntId(): string | null {
  return lastHuntId;
}
