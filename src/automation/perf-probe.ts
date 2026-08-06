/**
 * Lightweight freeze detector. Always-on, low overhead.
 * Exposes window.__baiakPerf for inspection.
 *
 * Tracks:
 * - long tasks (PerformanceObserver)
 * - setInterval lag (main-thread stalls)
 * - inbound WS message rate (via onGamePacket, type-only peek)
 * - GC-ish spikes via time-origin delta
 */
import { onGamePacket } from "../socket";
import { messageType } from "../socket-role";

declare const unsafeWindow: Window & typeof globalThis;

const MAX_EVENTS = 40;
const INTERVAL_MS = 1_000;
const LAG_SPIKE_MS = 80;
const LONG_TASK_MS = 50;

type Spike = {
  t: number;
  kind: "longtask" | "lag" | "ws_burst";
  ms: number;
  detail: string;
};

type PerfApi = {
  spikes: Spike[];
  last: {
    t: number;
    lagMs: number;
    wsPerSec: number;
    longTasks1s: number;
    typesTop: string;
  };
  dump: () => Spike[];
  summary: () => string;
};

export function startPerfProbe(): void {
  const page = unsafeWindow;
  const spikes: Spike[] = [];
  let wsCount = 0;
  let longTaskCount = 0;
  let longTaskMs = 0;
  const typeCounts = new Map<string, number>();

  const push = (kind: Spike["kind"], ms: number, detail: string) => {
    spikes.push({ t: Date.now(), kind, ms, detail });
    if (spikes.length > MAX_EVENTS) spikes.splice(0, spikes.length - MAX_EVENTS);
    console.warn(
      `[BaiakIdle Helper][perf] ${kind} ${Math.round(ms)}ms ${detail}`
    );
  };

  // Long tasks (Chrome / Brave)
  try {
    const po = new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        const ms = entry.duration;
        longTaskCount += 1;
        longTaskMs += ms;
        if (ms >= LONG_TASK_MS) {
          push(
            "longtask",
            ms,
            `name=${entry.name} start=${Math.round(entry.startTime)}`
          );
        }
      }
    });
    po.observe({ entryTypes: ["longtask"] as string[] });
  } catch {
    /* unsupported */
  }

  // WS inbound rate — count only; type sample 1/32 to stay near-zero cost.
  onGamePacket(bytes => {
    wsCount += 1;
    if ((wsCount & 31) === 0) {
      const t = messageType(bytes) || (bytes[0] === 0x0d ? "room?" : `bin${bytes[0]}`);
      typeCounts.set(t, (typeCounts.get(t) ?? 0) + 1);
    }
  });

  let expected = Date.now() + INTERVAL_MS;
  page.setInterval(() => {
    const now = Date.now();
    const lag = now - expected;
    expected = now + INTERVAL_MS;

    const ws = wsCount;
    wsCount = 0;
    const lt = longTaskCount;
    const ltMs = longTaskMs;
    longTaskCount = 0;
    longTaskMs = 0;

    const top = [...typeCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([k, v]) => `${k}:${v}`)
      .join(",");
    typeCounts.clear();

    if (lag >= LAG_SPIKE_MS) {
      push(
        "lag",
        lag,
        `ws/s=${ws} longtasks=${lt}(${Math.round(ltMs)}ms) types=${top || "-"}`
      );
    } else if (ws >= 120) {
      push("ws_burst", ws, `msgs/s types=${top || "-"}`);
    }

    const api = (page as typeof page & { __baiakPerf?: PerfApi }).__baiakPerf;
    if (api) {
      api.last = {
        t: now,
        lagMs: lag,
        wsPerSec: ws,
        longTasks1s: lt,
        typesTop: top
      };
    }
  }, INTERVAL_MS);

  const api: PerfApi = {
    spikes,
    last: { t: Date.now(), lagMs: 0, wsPerSec: 0, longTasks1s: 0, typesTop: "" },
    dump: () => spikes.slice(),
    summary: () => {
      const s = spikes.slice(-10);
      return (
        `last lag=${api.last.lagMs}ms ws/s=${api.last.wsPerSec} lt=${api.last.longTasks1s} ` +
        `types=${api.last.typesTop || "-"} spikes=${spikes.length} recent=${JSON.stringify(s)}`
      );
    }
  };
  (page as typeof page & { __baiakPerf?: PerfApi }).__baiakPerf = api;
  console.info(
    "[BaiakIdle Helper][perf] probe on. DevTools: window.__baiakPerf.summary()"
  );
}
