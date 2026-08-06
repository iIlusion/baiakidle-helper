/**
 * Auto Market Announce — chat `aucshare { listingId }` for *your* active auctions.
 *
 * ID discovery (no helper Bearer/token):
 * - Scrape DOM `.ac-mine .mk-idtag` when Meus anúncios is already open
 * - Else invisible auto-harvest: hide #auction-modal, open #tab-auction →
 *   "Meus anuncios", wait cards, scrape, close. Uses the *game's* tRPC path
 *   (same as manual open) after boot grace — never helper auction.mine + Bearer.
 *
 * Send on chat WS (rt3). Wait aucshareok; handle notyours/rate/repeat.
 */
import { aucSharePacket } from "../packets";
import {
  chatConnected,
  gameplayConnected,
  onGamePacket,
  sendChatPacket
} from "../socket";
import { isConnOverlayOpen } from "./state";
import type { Settings } from "./settings";

declare const unsafeWindow: Window & typeof globalThis;

/** Server rejects aucshare faster than ~4 minutes (any listing). */
const NATIVE_MIN_GAP_MS = 4 * 60 * 1_000;
const JITTER_MIN_MS = 10_000;
const JITTER_MAX_MS = 30_000;
const TICK_MS = 5_000;
const PENDING_TIMEOUT_MS = 8_000;
/** Wait for game join/auth before opening Market (avoids SESSÃO EXPIRADA). */
const BOOT_GRACE_MS = 12_000;
/** Re-open invisible mine tab to refresh IDs. */
const REHARVEST_MS = 3 * 60 * 1_000;
/** Retry harvest sooner when cache still empty. */
const EMPTY_HARVEST_MS = 8_000;
const HARVEST_STYLE_ID = "baiak-mk-harvest-style";
const HARVEST_CLASS = "baiak-mk-harvest";

type Listing = { id: number };
type PendingShare = { id: number; sentAt: number };

let lastShareById = new Map<number, number>();
let nextShareNotBefore = 0;
let cachedListings: Listing[] = [];
let lastHarvestAt = 0;
let harvestInFlight = false;
let started = false;
let startedAt = 0;
let lastChatFailLogAt = 0;
let lastEmptyLogAt = 0;
let pending: PendingShare | null = null;

function randomJitterMs(): number {
  return (
    JITTER_MIN_MS +
    Math.floor(Math.random() * (JITTER_MAX_MS - JITTER_MIN_MS + 1))
  );
}

function scheduleNextShare(fromMs: number, intervalMs: number): void {
  const base = Math.max(intervalMs, NATIVE_MIN_GAP_MS);
  const jitter = randomJitterMs();
  nextShareNotBefore = fromMs + base + jitter;
  console.info(
    `[BaiakIdle Helper] market-announce: next share in ${Math.round((base + jitter) / 1000)}s ` +
      `(base ${Math.round(base / 1000)}s + jitter ${Math.round(jitter / 1000)}s)`
  );
}

function page(): Window & typeof globalThis {
  return unsafeWindow;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => {
    page().setTimeout(resolve, ms);
  });
}

function click(el: Element | null | undefined): boolean {
  if (!el) return false;
  const node = el as HTMLElement;
  try {
    node.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, cancelable: true })
    );
    node.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, cancelable: true })
    );
    node.dispatchEvent(
      new PointerEvent("pointerup", { bubbles: true, cancelable: true })
    );
    node.dispatchEvent(
      new MouseEvent("mouseup", { bubbles: true, cancelable: true })
    );
  } catch {
    /* ignore */
  }
  node.click();
  return true;
}

function coerceId(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  if (typeof value === "string") {
    const m = value.trim().match(/^#?(\d+)$/);
    if (m) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  return undefined;
}

/** Own listings only — never chat auction links. */
function listingsFromMineDom(doc: Document): Listing[] {
  const ids = new Set<number>();
  const cards = doc.querySelectorAll<HTMLElement>(
    ".mk-livehost.ac-mine .mk-card:not(.ac-ended), .ac-mine .mk-card:not(.ac-ended)"
  );
  for (const card of cards) {
    const tag = card.querySelector(".mk-idtag")?.textContent ?? "";
    const id = coerceId(tag);
    if (id !== undefined) ids.add(id);
  }
  return [...ids].sort((a, b) => a - b).map(id => ({ id }));
}

function applyListings(list: Listing[], source: string): void {
  cachedListings = list;
  lastHarvestAt = Date.now();
  for (const id of [...lastShareById.keys()]) {
    if (!list.some(l => l.id === id)) lastShareById.delete(id);
  }
  if (list.length === 0) {
    if (Date.now() - lastEmptyLogAt > 45_000) {
      lastEmptyLogAt = Date.now();
      console.info(
        `[BaiakIdle Helper] market-announce: 0 active listings (${source})`
      );
    }
  } else {
    console.info(
      `[BaiakIdle Helper] market-announce: ${list.length} listing(s) via ${source} ` +
        `[${list.map(l => l.id).join(", ")}]`
    );
  }
}

function isAuctionOpen(doc: Document): boolean {
  const modal = doc.getElementById("auction-modal");
  return Boolean(modal && !modal.classList.contains("hidden"));
}

function ensureHarvestStyle(doc: Document): void {
  if (doc.getElementById(HARVEST_STYLE_ID)) return;
  const style = doc.createElement("style");
  style.id = HARVEST_STYLE_ID;
  // Invisible but still laid out so the game can mount .ac-mine cards.
  style.textContent = `
    #auction-modal.${HARVEST_CLASS} {
      opacity: 0 !important;
      pointer-events: none !important;
      visibility: hidden !important;
    }
    #auction-modal.${HARVEST_CLASS} * {
      pointer-events: none !important;
    }
  `;
  (doc.head ?? doc.documentElement).appendChild(style);
}

function setHarvestHidden(doc: Document, on: boolean): void {
  ensureHarvestStyle(doc);
  const modal = doc.getElementById("auction-modal");
  if (!modal) return;
  modal.classList.toggle(HARVEST_CLASS, on);
}

async function waitFor(
  pred: () => boolean,
  timeoutMs: number,
  stepMs = 40
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (pred()) return true;
    await sleep(stepMs);
  }
  return pred();
}

function findMkNav(
  doc: Document,
  re: RegExp,
  fallbackIndex?: number
): HTMLElement | null {
  const buttons = [
    ...doc.querySelectorAll<HTMLElement>("#auction-modal .mk-navi, .mk-rail .mk-navi")
  ];
  for (const btn of buttons) {
    const label = (
      btn.getAttribute("aria-label") ??
      btn.textContent ??
      ""
    )
      .replace(/\s+/g, " ")
      .trim();
    if (re.test(label)) return btn;
  }
  if (fallbackIndex !== undefined) {
    const rail = doc.querySelectorAll<HTMLElement>("#auction-modal .mk-navi");
    return rail[fallbackIndex] ?? null;
  }
  return null;
}

/** Order: browse, favorites, history, sell, mine, bids, wallet */
function findMineNav(doc: Document): HTMLElement | null {
  return findMkNav(doc, /meus\s*an[uú]ncios|my\s*listings/i, 4);
}

function findBrowseNav(doc: Document): HTMLElement | null {
  return findMkNav(doc, /^vitrine$|showcase|^browse$/i, 0);
}

function mineHostReady(doc: Document): boolean {
  if (doc.querySelector(".ac-mine, .mk-livehost.ac-mine")) return true;
  const main = doc.querySelector("#auction-modal .mk-main");
  if (!main) return false;
  const text = (main.textContent ?? "").toLowerCase();
  // Empty state after mine query settled.
  return (
    /n[aã]o tem an[uú]ncios|no active listings|voc[eê] n[aã]o tem/i.test(text) ||
    /an[uú]ncios ativos:\s*0\//i.test(text)
  );
}

function closeAuction(doc: Document): void {
  const closeBtn = doc.getElementById("auction-modal-close");
  if (closeBtn instanceof HTMLElement) {
    click(closeBtn);
    return;
  }
  // Toggle tab if close missing.
  const tab = doc.getElementById("tab-auction");
  if (tab instanceof HTMLElement && isAuctionOpen(doc)) click(tab);
}

/**
 * Open Market → Meus anúncios invisibly, scrape IDs, close.
 * Uses native game UI only (game's own auth) — no helper token.
 */
async function harvestListingsInvisible(): Promise<Listing[]> {
  const doc = page().document;
  if (isConnOverlayOpen(doc) || !gameplayConnected()) return [];

  // Already on mine tab — just read.
  const existing = listingsFromMineDom(doc);
  if (existing.length > 0) return existing;
  if (isAuctionOpen(doc) && mineHostReady(doc)) {
    return listingsFromMineDom(doc);
  }

  // Don't steal UI if the player already has Market open on another tab.
  if (isAuctionOpen(doc)) {
    const mineBtn = findMineNav(doc);
    if (mineBtn && !mineBtn.classList.contains("on")) {
      // Leave user's open market alone.
      return [];
    }
    return listingsFromMineDom(doc);
  }

  const tab = doc.getElementById("tab-auction");
  if (!(tab instanceof HTMLElement)) return [];

  setHarvestHidden(doc, true);
  let weOpened = false;
  try {
    if (!click(tab)) return [];
    weOpened = true;

    const opened = await waitFor(() => isAuctionOpen(doc), 2_500, 30);
    if (!opened) return [];

    // Nav buttons exist before tab content finishes loading.
    const navOk = await waitFor(() => Boolean(findMineNav(doc)), 2_500, 30);
    if (!navOk) return [];

    const mineBtn = findMineNav(doc);
    if (!mineBtn?.classList.contains("on")) {
      click(mineBtn);
    }

    const ready = await waitFor(() => mineHostReady(doc), 4_000, 40);
    if (!ready) {
      // One more click if first race lost to browse paint.
      click(findMineNav(doc));
      await waitFor(() => mineHostReady(doc), 2_500, 40);
    }

    return listingsFromMineDom(doc);
  } finally {
    if (weOpened) {
      // Leave Market on Vitrine so next open isn't stuck on Meus anúncios.
      const browse = findBrowseNav(doc);
      if (browse && !browse.classList.contains("on")) {
        click(browse);
        await waitFor(
          () => findBrowseNav(doc)?.classList.contains("on") ?? false,
          600,
          30
        );
      }
      closeAuction(doc);
      // Brief wait so close class applies before unhide.
      await waitFor(() => !isAuctionOpen(doc), 800, 30);
    }
    setHarvestHidden(doc, false);
  }
}

async function refreshListings(force = false): Promise<void> {
  if (harvestInFlight) return;
  const now = Date.now();
  const gap =
    cachedListings.length === 0 ? EMPTY_HARVEST_MS : REHARVEST_MS;
  if (!force && now - lastHarvestAt < gap) {
    // Still pick up IDs if user has mine open.
    const live = listingsFromMineDom(page().document);
    if (live.length > 0) applyListings(live, "dom-live");
    return;
  }

  // Fast path: mine already visible.
  const live = listingsFromMineDom(page().document);
  if (live.length > 0) {
    applyListings(live, "dom");
    return;
  }

  harvestInFlight = true;
  try {
    const list = await harvestListingsInvisible();
    applyListings(list, "auto-mine");
  } catch (err) {
    console.warn("[BaiakIdle Helper] market-announce: harvest failed", err);
    lastHarvestAt = Date.now();
  } finally {
    harvestInFlight = false;
  }
}

function pickDueListing(intervalMs: number): Listing | null {
  const now = Date.now();
  if (pending) return null;
  if (now < nextShareNotBefore) return null;
  const minAge = Math.max(intervalMs, NATIVE_MIN_GAP_MS);
  let best: Listing | null = null;
  let bestLast = Number.POSITIVE_INFINITY;
  for (const listing of cachedListings) {
    const last = lastShareById.get(listing.id) ?? 0;
    if (last > 0 && now - last < minAge) continue;
    if (last < bestLast) {
      bestLast = last;
      best = listing;
    }
  }
  if (!best && cachedListings.length > 0) {
    for (const listing of cachedListings) {
      const last = lastShareById.get(listing.id) ?? 0;
      if (last < bestLast) {
        bestLast = last;
        best = listing;
      }
    }
  }
  return best;
}

function messageType(bytes: Uint8Array): string {
  if (bytes[0] !== 0x0d || bytes.length < 3) return "";
  const p = bytes[1]!;
  let off = 2;
  let len = 0;
  if ((p & 0xe0) === 0xa0) len = p & 0x1f;
  else if (p === 0xd9) {
    len = bytes[2] ?? 0;
    off = 3;
  } else return "";
  if (off + len > bytes.length) return "";
  try {
    return new TextDecoder().decode(bytes.subarray(off, off + len));
  } catch {
    return "";
  }
}

function errReason(bytes: Uint8Array): string {
  const text = new TextDecoder().decode(bytes);
  if (text.includes("notyours")) return "notyours";
  if (text.includes("rate")) return "rate";
  if (text.includes("repeat")) return "repeat";
  if (text.includes("muted")) return "muted";
  return "unknown";
}

function onChatRelatedPacket(bytes: Uint8Array): void {
  const type = messageType(bytes);
  if (type !== "aucshareok" && type !== "aucshareerr") return;
  if (!pending) return;

  const id = pending.id;
  const now = Date.now();

  if (type === "aucshareok") {
    lastShareById.set(id, now);
    console.info(
      `[BaiakIdle Helper] market-announce: OK listingId=${id} — deve aparecer no canal Market`
    );
    pending = null;
    return;
  }

  const reason = errReason(bytes);
  console.warn(
    `[BaiakIdle Helper] market-announce: ERR listingId=${id} reason=${reason}`
  );

  if (reason === "notyours") {
    cachedListings = cachedListings.filter(l => l.id !== id);
    lastShareById.delete(id);
    nextShareNotBefore = now + randomJitterMs();
    // Force re-harvest soon — listing may have sold/cancelled.
    lastHarvestAt = 0;
  } else if (reason === "rate" || reason === "repeat") {
    lastShareById.set(id, now);
    scheduleNextShare(now, NATIVE_MIN_GAP_MS);
  } else {
    scheduleNextShare(now, NATIVE_MIN_GAP_MS);
  }
  pending = null;
}

async function tick(settings: Settings): Promise<void> {
  if (!settings.autoMarketAnnounce) {
    pending = null;
    return;
  }

  if (Date.now() - startedAt < BOOT_GRACE_MS) return;
  if (isConnOverlayOpen(page().document)) return;
  if (!gameplayConnected()) return;

  if (pending && Date.now() - pending.sentAt > PENDING_TIMEOUT_MS) {
    console.warn(
      `[BaiakIdle Helper] market-announce: timeout waiting ok/err for ${pending.id}`
    );
    pending = null;
  }

  await refreshListings(false);
  if (cachedListings.length === 0) return;

  const due = pickDueListing(settings.autoMarketAnnounceIntervalMs);
  if (!due) return;

  if (!chatConnected()) {
    const now = Date.now();
    if (now - lastChatFailLogAt > 30_000) {
      lastChatFailLogAt = now;
      console.warn(
        "[BaiakIdle Helper] market-announce: chat socket offline — waiting"
      );
    }
    return;
  }

  const packet = aucSharePacket(due.id);
  const sent = sendChatPacket(packet);
  console.info(
    `[BaiakIdle Helper] market-announce: aucshare listingId=${due.id} sent=${sent} chat=${chatConnected()}`
  );
  if (!sent) return;

  const now = Date.now();
  pending = { id: due.id, sentAt: now };
  scheduleNextShare(now, settings.autoMarketAnnounceIntervalMs);
}

export function startMarketAnnounce(getSettings: () => Settings): void {
  if (started) return;
  started = true;
  startedAt = Date.now();
  const w = page();

  onGamePacket(bytes => {
    try {
      onChatRelatedPacket(bytes);
    } catch {
      /* ignore */
    }
  });

  w.addEventListener("baiakidle-helper-settings", () => {
    if (getSettings().autoMarketAnnounce) {
      lastHarvestAt = 0;
      void refreshListings(true);
    }
  });

  w.setInterval(() => {
    try {
      void tick(getSettings());
    } catch (err) {
      console.warn("[BaiakIdle Helper] market-announce tick error", err);
    }
  }, TICK_MS);

  console.info(
    "[BaiakIdle Helper] market-announce ready (invisible mine harvest, no helper token)"
  );
}

export function marketAnnounceStatus(): {
  listings: number[];
  lastShareById: Record<number, number>;
  chat: boolean;
  pending: number | null;
  harvesting: boolean;
} {
  return {
    listings: cachedListings.map(l => l.id),
    lastShareById: Object.fromEntries(lastShareById),
    chat: chatConnected(),
    pending: pending?.id ?? null,
    harvesting: harvestInFlight
  };
}
