import { SELL_ALL_BASE64 } from "../packets";
import { sendRawPacket } from "../socket";
import type { Settings } from "./settings";
import { readInventory } from "./state";
import {
  hasMarkedTransferItems,
  isTransferring,
  runAutoTransfer
} from "./transfer";

declare const unsafeWindow: Window & typeof globalThis;

const POLL_MS = 250;
const SETTLE_MS = 350;
const SELL_RETRY_GAP_MS = 1_200;

let selling = false;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => {
    unsafeWindow.setTimeout(resolve, ms);
  });
}

export function isSelling(): boolean {
  return selling;
}

/**
 * Transfer marked rarities first (ignores transfer loop cooldown), then sell all.
 * Returns true if pouch emptied or sell packet was sent.
 * Waits briefly after transfer so the sell button can refresh.
 */
export async function sellAllRespectingTransfer(
  settings: Settings,
  doc: Document
): Promise<boolean> {
  if (selling) return false;

  // Wait out an in-progress periodic transfer instead of failing hard.
  for (let i = 0; i < 40 && isTransferring(); i++) {
    await sleep(POLL_MS);
  }
  if (isTransferring()) return false;

  selling = true;
  try {
    await transferMarkedUntilClear(settings, doc);
    await sleep(SETTLE_MS);

    let state = readInventory(doc);
    if (!state || state.current === 0) return true;

    // Brief wait if sell just entered cooldown / button still disabled after transfer.
    if (!state.canSell && !state.sellCooldown) {
      await sleep(SETTLE_MS);
      state = readInventory(doc);
      if (!state || state.current === 0) return true;
    }

    if (!state.canSell) return false;
    const sent = sendRawPacket(SELL_ALL_BASE64);
    if (sent) {
      console.info(
        `[BaiakIdle Helper] auto sell: sell all ` +
          `(${state.current}/${state.capacity} ≥ threshold, transfer-first)`
      );
    }
    return sent;
  } finally {
    selling = false;
  }
}

/**
 * Keep transferring marked rarities + selling until Loot Pouch is empty.
 * Waits through sell cooldown; no short timeout — only finishes when empty.
 */
export async function drainLootPouch(
  settings: Settings,
  doc: Document,
  logPrefix = "drain loot"
): Promise<boolean> {
  if (selling) return false;
  selling = true;
  let lastSellAt = 0;
  let lastLogAt = 0;

  try {
    for (;;) {
      const state = readInventory(doc);
      if (!state || state.current === 0) {
        console.info(`[BaiakIdle Helper] ${logPrefix}: Loot Pouch empty`);
        return true;
      }

      const now = Date.now();
      if (now - lastLogAt >= 15_000) {
        lastLogAt = now;
        console.info(
          `[BaiakIdle Helper] ${logPrefix}: ${state.current}/${state.capacity}` +
            `${state.sellCooldown ? " (sell cooldown)" : state.canSell ? "" : " (sell blocked)"}` +
            " — waiting until empty"
        );
      }

      if (settings.autoTransfer && hasMarkedTransferItems(settings, doc)) {
        await runAutoTransfer(settings, doc, { force: true });
        await sleep(SETTLE_MS);
        continue;
      }

      if (state.canSell && now - lastSellAt >= SELL_RETRY_GAP_MS) {
        if (sendRawPacket(SELL_ALL_BASE64)) {
          lastSellAt = now;
          console.info(`[BaiakIdle Helper] ${logPrefix}: sell all sent`);
          await sleep(SETTLE_MS);
          continue;
        }
      }

      await sleep(POLL_MS);
    }
  } finally {
    selling = false;
  }
}

async function transferMarkedUntilClear(settings: Settings, doc: Document): Promise<void> {
  if (!settings.autoTransfer) return;

  for (let pass = 0; pass < 24; pass++) {
    if (!hasMarkedTransferItems(settings, doc)) return;
    const moved = await runAutoTransfer(settings, doc, { force: true });
    if (moved === 0) return;
    await sleep(SETTLE_MS);
  }
}
