/**
 * Auto Market Announce — chat room `aucshare { listingId }` every N minutes per listing.
 * Discovers active auctions via tRPC `auction.mine` (no Market modal required).
 */
import { aucSharePacket } from "../packets";
import { chatConnected, sendChatPacket } from "../socket";
import type { Settings } from "./settings";

declare const unsafeWindow: Window & typeof globalThis;

/** Game market-channel rate limit is 120s for normal accounts; stay slightly above. */
const GLOBAL_GAP_MS = 125_000;
const LISTINGS_REFRESH_MS = 120_000;
const TICK_MS = 5_000;

type Listing = { id: number };

let lastShareById = new Map<number, number>();
let lastGlobalShareAt = 0;
let cachedListings: Listing[] = [];
let lastListingsFetchAt = 0;
let fetchInFlight = false;
let started = false;

function page(): Window & typeof globalThis {
  return unsafeWindow;
}

/**
 * tRPC query without opening UI. Response shapes vary by tRPC version / superjson.
 */
async function fetchMyListingIds(): Promise<Listing[]> {
  const origin = page().location.origin;
  const inputs = [
    // tRPC v11 superjson-ish
    encodeURIComponent(JSON.stringify({ json: null, meta: { values: ["undefined"] } })),
    // plain
    encodeURIComponent(JSON.stringify({})),
    // batch style
    encodeURIComponent(JSON.stringify({ "0": { json: null, meta: { values: ["undefined"] } } }))
  ];
  const urls = [
    `${origin}/api/trpc/auction.mine?input=${inputs[0]}`,
    `${origin}/api/trpc/auction.mine?input=${inputs[1]}`,
    `${origin}/api/trpc/auction.mine?batch=1&input=${inputs[2]}`
  ];

  for (const url of urls) {
    try {
      const res = await page().fetch(url, {
        method: "GET",
        credentials: "include",
        headers: { accept: "application/json" }
      });
      if (!res.ok) continue;
      const json: unknown = await res.json();
      const ids = extractListingIds(json);
      if (ids.length > 0 || res.ok) return ids;
    } catch {
      /* try next shape */
    }
  }
  return [];
}

function extractListingIds(payload: unknown): Listing[] {
  const ids = new Set<number>();

  const visit = (node: unknown, depth: number): void => {
    if (depth > 8 || node == null) return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item, depth + 1);
      return;
    }
    if (typeof node !== "object") return;
    const obj = node as Record<string, unknown>;

    // Row shaped like { id: 46944, status: "active", ... }
    if (typeof obj.id === "number" && Number.isFinite(obj.id) && obj.id > 0) {
      const status = typeof obj.status === "string" ? obj.status.toLowerCase() : "";
      // Prefer active-looking rows; still accept id if auction-like fields exist
      const looksAuction =
        "currentPrice" in obj ||
        "endsAt" in obj ||
        "bidCount" in obj ||
        "startPrice" in obj ||
        status.includes("active") ||
        status === "" ||
        status === "open";
      if (looksAuction && (!status || !/cancel|end|sold|close|expire/i.test(status))) {
        ids.add(Math.floor(obj.id));
      }
    }

    for (const value of Object.values(obj)) visit(value, depth + 1);
  };

  visit(payload, 0);
  return [...ids].sort((a, b) => a - b).map(id => ({ id }));
}

async function refreshListings(force = false): Promise<void> {
  const now = Date.now();
  if (fetchInFlight) return;
  if (!force && now - lastListingsFetchAt < LISTINGS_REFRESH_MS) return;
  fetchInFlight = true;
  try {
    const list = await fetchMyListingIds();
    cachedListings = list;
    lastListingsFetchAt = now;
    // Drop timers for listings that disappeared
    for (const id of [...lastShareById.keys()]) {
      if (!list.some(l => l.id === id)) lastShareById.delete(id);
    }
    console.info(
      `[BaiakIdle Helper] market-announce: ${list.length} listing(s) [${list.map(l => l.id).join(", ")}]`
    );
  } catch (err) {
    console.warn("[BaiakIdle Helper] market-announce: mine query failed", err);
  } finally {
    fetchInFlight = false;
  }
}

function pickDueListing(intervalMs: number): Listing | null {
  const now = Date.now();
  if (now - lastGlobalShareAt < GLOBAL_GAP_MS) return null;
  for (const listing of cachedListings) {
    const last = lastShareById.get(listing.id) ?? 0;
    if (now - last >= intervalMs) return listing;
  }
  return null;
}

async function tick(settings: Settings): Promise<void> {
  if (!settings.autoMarketAnnounce) return;
  if (!chatConnected()) {
    // Chat room may not be classified yet; still try send later.
  }

  await refreshListings(false);
  if (cachedListings.length === 0) return;

  const due = pickDueListing(settings.autoMarketAnnounceIntervalMs);
  if (!due) return;

  const packet = aucSharePacket(due.id);
  const sent = sendChatPacket(packet);
  console.info(
    `[BaiakIdle Helper] market-announce: aucshare listingId=${due.id} sent=${sent} chat=${chatConnected()}`
  );
  if (!sent) return;

  const now = Date.now();
  lastShareById.set(due.id, now);
  lastGlobalShareAt = now;
}

export function startMarketAnnounce(getSettings: () => Settings): void {
  if (started) return;
  started = true;
  const w = page();

  // Initial fetch after short settle (cookies / session ready).
  w.setTimeout(() => {
    void refreshListings(true);
  }, 4_000);

  w.setInterval(() => {
    try {
      void tick(getSettings());
    } catch (err) {
      console.warn("[BaiakIdle Helper] market-announce tick error", err);
    }
  }, TICK_MS);

  console.info("[BaiakIdle Helper] market-announce watcher ready");
}

export function marketAnnounceStatus(): {
  listings: number[];
  lastShareById: Record<number, number>;
} {
  return {
    listings: cachedListings.map(l => l.id),
    lastShareById: Object.fromEntries(lastShareById)
  };
}
