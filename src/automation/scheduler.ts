import {
  OPEN_ALL_GLOOTH_BAGS_BASE64,
  supplyMoveToLootPacket
} from "../packets";
import { sendRawPacket } from "../socket";
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
};

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
  let sellInFlight = false;
  let lastSellAttemptAt = 0;
  let openLatched = false;
  let supplyPotionJob: SupplyPotionJob | null = null;

  page.setInterval(() => {
    const settings = api.getSettings();
    const doc = page.document;
    const navBusy = isHuntEntering();
    const sellBusy = isSelling() || isTransferring() || sellInFlight;

    if (
      settings.autoHunt &&
      settings.autoHuntTreinoOnLowStamina &&
      !isHuntEntering()
    ) {
      void maybeStaminaHuntRoute(settings, doc);
    }

    if (settings.autoHunt && !isHuntEntering()) {
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
