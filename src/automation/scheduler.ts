import {
  OPEN_ALL_GLOOTH_BAGS_BASE64,
  SELL_ALL_BASE64,
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
import { isTransferring, runAutoTransfer } from "./transfer";

declare const unsafeWindow: Window & typeof globalThis;

const SUPPLY_POTION_SELL_DELAY_MS = 450;
const TICK_MS = 250;

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
  let sellLatched = false;
  let openLatched = false;
  let supplyPotionJob: SupplyPotionJob | null = null;

  page.setInterval(() => {
    const settings = api.getSettings();
    const doc = page.document;
    const navBusy = isHuntEntering();

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

    if (settings.autoTransfer && !isTransferring() && !navBusy) {
      void runAutoTransfer(settings, doc);
    }

    const fillPct =
      state.capacity > 0 ? (state.current / state.capacity) * 100 : 0;
    const sellReady = fillPct >= settings.autoSellThresholdPct;
    if (!settings.autoSell || !sellReady) sellLatched = false;
    if (
      settings.autoSell &&
      sellReady &&
      state.canSell &&
      !sellLatched &&
      !isTransferring() &&
      !navBusy
    ) {
      sellLatched = sendRawPacket(SELL_ALL_BASE64);
    }

    if (!settings.autoOpenAll || !state.hasGloothBag || state.full || state.sellCooldown) {
      openLatched = false;
    } else if (!openLatched && !navBusy) {
      openLatched = sendRawPacket(OPEN_ALL_GLOOTH_BAGS_BASE64);
    }

    if (!settings.autoSellSupplyPotions) {
      supplyPotionJob = null;
      return;
    }

    if (!supplyPotionJob) {
      if (state.sellCooldown || !supplyPotionGuardsPass(settings, state, doc, page.document.title)) {
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
      if (state.sellCooldown) return;
      if (Date.now() - supplyPotionJob.movedAt < SUPPLY_POTION_SELL_DELAY_MS) return;
      if (state.current === 0) {
        if (Date.now() - supplyPotionJob.movedAt < 2_000) return;
        supplyPotionJob = null;
        return;
      }
      if (sendRawPacket(SELL_ALL_BASE64)) {
        supplyPotionJob.sold = true;
        sellLatched = true;
      }
      return;
    }

    if (state.current === 0 || supplyPotionNames(doc).length === 0) {
      supplyPotionJob = null;
    }
  }, TICK_MS);
}
