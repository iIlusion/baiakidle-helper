import {
  OPEN_ALL_GLOOTH_BAGS_BASE64,
  bossPacket,
  cityPresencePacket,
  supplyMoveToLootPacket
} from "../packets";
import { sendRawPacket } from "../socket";
import {
  autoBossClaimsNavigation,
  AutoBossRunner,
  maybeStartAtMidnight
} from "./auto-boss";
import { readBossRoomSnapshot, startRoomStateMirror } from "./room-state";
import type { Settings } from "./settings";
import { isHuntEntering, maybeStaminaHuntRoute, runAutoHunt } from "./hunt";
import {
  inTreinoOnline,
  readInventory,
  supplyPotionNames,
  type InventoryState
} from "./state";
import { isSelling, sellAllRespectingTransfer } from "./sell";
import { hasMarkedTransferItems, isTransferring, runAutoTransfer } from "./transfer";

declare const unsafeWindow: Window & typeof globalThis;

const SUPPLY_POTION_SELL_DELAY_MS = 450;
const TICK_MS = 250;
/** Min gap between auto-sell attempts while pouch stays above threshold. */
const SELL_ATTEMPT_GAP_MS = 2_000;

type SupplyPotionJob = { movedAt: number; sold: boolean };

export type SchedulerApi = {
  getSettings: () => Settings;
  persist?: (next: Settings) => void;
};

const autoBossRunner = new AutoBossRunner({
  sendBoss: (bossId, fromCity) => sendRawPacket(bossPacket(bossId, fromCity)),
  sendCityPresence: away => sendRawPacket(cityPresencePacket(away))
});

export function readAutoBossView(settings: Settings) {
  return autoBossRunner.view(settings, readBossRoomSnapshot());
}

function supplyPotionGuardsPass(
  settings: Settings,
  state: InventoryState,
  doc: Document,
  pageTitle: string
): boolean {
  if (settings.supplyPotionsOnlyTreino && !inTreinoOnline(doc, pageTitle)) return false;
  if (settings.supplyPotionsOnlyNoGlooth && state.hasGloothBag) return false;
  if (settings.supplyPotionsOnlyEmptyLoot && state.current !== 0) return false;
  return true;
}

/** Unified automation tick: hunt → transfer → sell → open glooth → supply potions. */
export function startScheduler(api: SchedulerApi): void {
  const page = unsafeWindow;
  startRoomStateMirror();
  let sellInFlight = false;
  let lastSellAttemptAt = 0;
  let openLatched = false;
  let supplyPotionJob: SupplyPotionJob | null = null;

  page.setInterval(() => {
    let settings = api.getSettings();
    const doc = page.document;
    const tickAt = Date.now();
    const persistAutoBoss = (patch: Partial<Settings>): void => {
      const next = { ...api.getSettings(), ...patch };
      api.persist?.(next);
      settings = next;
    };
    const dailyPatch = maybeStartAtMidnight(settings, readBossRoomSnapshot(), tickAt);
    if (dailyPatch) persistAutoBoss(dailyPatch);
    settings = api.getSettings();
    autoBossRunner.tick(settings, readBossRoomSnapshot(), persistAutoBoss, tickAt);
    settings = api.getSettings();
    const autoBossBusy = autoBossClaimsNavigation(settings, autoBossRunner);
    const navBusy = isHuntEntering() || autoBossBusy;
    const sellBusy = isSelling() || isTransferring() || sellInFlight;

    if (
      settings.autoHunt &&
      settings.autoHuntTreinoOnLowStamina &&
      !isHuntEntering() && !autoBossBusy
    ) {
      void maybeStaminaHuntRoute(settings, doc);
    }

    if (settings.autoHunt && !isHuntEntering() && !autoBossBusy) {
      void runAutoHunt(settings, doc);
    }

    const state = readInventory(doc);
    if (!state) return;

    if (settings.autoTransfer && !isTransferring() && !navBusy && !isSelling() && !sellInFlight) {
      void runAutoTransfer(settings, doc);
    }

    const fillPct =
      state.capacity > 0 ? (state.current / state.capacity) * 100 : 0;
    const sellReady = fillPct + 1e-9 >= settings.autoSellThresholdPct;
    const now = Date.now();

    if (
      settings.autoSell &&
      sellReady &&
      state.current > 0 &&
      !sellBusy &&
      !navBusy &&
      now - lastSellAttemptAt >= SELL_ATTEMPT_GAP_MS
    ) {
      // Transfer marked rarities first (force), then sell when button is free.
      const needTransfer = hasMarkedTransferItems(settings, doc);
      if (state.canSell || needTransfer) {
        sellInFlight = true;
        lastSellAttemptAt = now;
        void sellAllRespectingTransfer(settings, doc).finally(() => {
          sellInFlight = false;
        });
      }
    }

    if (!settings.autoOpenAll || !state.hasGloothBag || state.full || state.sellCooldown) {
      openLatched = false;
    } else if (!openLatched && !navBusy && !sellBusy) {
      openLatched = sendRawPacket(OPEN_ALL_GLOOTH_BAGS_BASE64);
    }

    if (!settings.autoSellSupplyPotions) {
      supplyPotionJob = null;
      return;
    }

    if (!supplyPotionJob) {
      if (state.sellCooldown || sellBusy || !supplyPotionGuardsPass(settings, state, doc, page.document.title)) {
        return;
      }
      const potions = supplyPotionNames(doc);
      if (potions.length === 0) return;
      let moved = false;
      for (const name of potions) {
        if (sendRawPacket(supplyMoveToLootPacket(name))) moved = true;
      }
      if (moved) supplyPotionJob = { movedAt: Date.now(), sold: false };
      return;
    }

    if (!supplyPotionJob.sold) {
      if (state.sellCooldown || sellBusy) return;
      if (Date.now() - supplyPotionJob.movedAt < SUPPLY_POTION_SELL_DELAY_MS) return;
      if (state.current === 0) {
        if (Date.now() - supplyPotionJob.movedAt < 2_000) return;
        supplyPotionJob = null;
        return;
      }
      supplyPotionJob.sold = true;
      sellInFlight = true;
      lastSellAttemptAt = Date.now();
      void sellAllRespectingTransfer(settings, doc).finally(() => {
        sellInFlight = false;
        // Retry sell phase if pouch still has items after this attempt.
        const after = readInventory(doc);
        if (supplyPotionJob && after && after.current > 0) {
          supplyPotionJob.sold = false;
        }
      });
      return;
    }

    if (state.current === 0 || supplyPotionNames(doc).length === 0) {
      supplyPotionJob = null;
    }
  }, TICK_MS);
}
