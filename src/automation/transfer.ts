import { bagMovePacket } from "../packets";
import { sendRawPacket } from "../socket";
import { enabledTransferTiers, type Settings } from "./settings";

const TRANSFER_LOOP_MS = 5_000;
const BETWEEN_ITEMS_MS = 200;

declare const unsafeWindow: Window & typeof globalThis;

let transferring = false;
let lastRunAt = 0;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => {
    unsafeWindow.setTimeout(resolve, ms);
  });
}

/** Game wires Shift+click on pouch cells to bagmove(hash, "backpack"). */
function shiftClick(element: Element): void {
  const page = unsafeWindow;
  const opts: MouseEventInit = {
    bubbles: true,
    cancelable: true,
    view: page,
    shiftKey: true,
    button: 0
  };
  element.dispatchEvent(new page.MouseEvent("mousedown", opts));
  element.dispatchEvent(new page.MouseEvent("mouseup", opts));
  element.dispatchEvent(new page.MouseEvent("click", opts));
}

function transferableCells(doc: Document, settings: Settings): HTMLElement[] {
  const allowed = enabledTransferTiers(settings);
  if (allowed.size === 0) return [];
  const cells: HTMLElement[] = [];
  for (const cell of doc.querySelectorAll<HTMLElement>("#inv-grid .cell[data-tier]")) {
    const tier = Number(cell.dataset.tier);
    if (!Number.isFinite(tier) || !allowed.has(tier)) continue;
    // Empty placeholder cells have no children / no item chrome.
    if (!cell.querySelector("img, .qty, b")) continue;
    cells.push(cell);
  }
  return cells;
}

export function hasMarkedTransferItems(settings: Settings, doc: Document): boolean {
  return settings.autoTransfer && transferableCells(doc, settings).length > 0;
}

export type TransferOptions = {
  /** Ignore the periodic loop cooldown (used before sell / drain). */
  force?: boolean;
};

/**
 * Move equip items of selected rarities from Loot Pouch → Backpack.
 * Prefers native bagmove when data-hash is present; otherwise Shift+click
 * (client already maps that to bagmove).
 */
export async function runAutoTransfer(
  settings: Settings,
  doc: Document,
  options?: TransferOptions
): Promise<number> {
  if (!settings.autoTransfer) return 0;
  if (transferring) return 0;

  const force = Boolean(options?.force);
  const now = Date.now();
  if (!force && now - lastRunAt < TRANSFER_LOOP_MS) return 0;

  const cells = transferableCells(doc, settings);
  if (cells.length === 0) {
    if (!force) lastRunAt = now;
    return 0;
  }

  transferring = true;
  lastRunAt = now;
  let moved = 0;
  try {
    for (const cell of cells) {
      const hash = cell.dataset.hash?.trim();
      if (hash && sendRawPacket(bagMovePacket(hash, "backpack"))) {
        moved += 1;
      } else {
        shiftClick(cell);
        moved += 1;
      }
      await sleep(BETWEEN_ITEMS_MS);
    }
  } finally {
    transferring = false;
  }
  if (moved > 0) {
    console.info(
      `[BaiakIdle Helper] auto transfer: ${moved} item(s) → backpack${force ? " (pre-sell)" : ""}`
    );
  }
  return moved;
}

export function isTransferring(): boolean {
  return transferring;
}
