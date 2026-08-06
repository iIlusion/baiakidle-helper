/**
 * Console + in-memory probe for teleport / Treino online debugging.
 * Manual test: leave Treino → city (or hunt) → enter Treino online once.
 * Watch console for [probe-out] / [probe-wave] / [probe-menu], or
 * inspect `window.__baiakProbe.events` in DevTools.
 */
import { onOutgoingPacket, gameplayConnected, gameplaySocketUrl } from "../socket";
import { readStaminaMinutes, waveTitle, isInCity, inTreinoOnline } from "./state";

declare const unsafeWindow: Window & typeof globalThis;

const INTERESTING =
  /^(mode|stage|boss|tocity|citypresence|leaveearly|sellall|useitem|cityPresence)$/i;
const MAX_EVENTS = 80;

type ProbeEvent = {
  t: number;
  kind: string;
  detail: string;
};

type ProbeApi = {
  events: ProbeEvent[];
  dump: () => ProbeEvent[];
  status: () => string;
};

function roomType(bytes: Uint8Array): string {
  if (bytes[0] !== 0x0d) return "";
  const prefix = bytes[1];
  let offset = 2;
  let length = 0;
  if ((prefix & 0xe0) === 0xa0) length = prefix & 0x1f;
  else if (prefix === 0xd9) {
    length = bytes[2] ?? 0;
    offset = 3;
  } else if (prefix === 0xda) {
    length = ((bytes[2] ?? 0) << 8) | (bytes[3] ?? 0);
    offset = 4;
  } else return "";
  try {
    return new TextDecoder().decode(bytes.subarray(offset, offset + length));
  } catch {
    return "";
  }
}

function hexHead(bytes: Uint8Array, n = 64): string {
  return [...bytes.subarray(0, n)].map(b => b.toString(16).padStart(2, "0")).join(" ");
}

function pushEvent(api: ProbeApi, kind: string, detail: string): void {
  api.events.push({ t: Date.now(), kind, detail });
  if (api.events.length > MAX_EVENTS) api.events.splice(0, api.events.length - MAX_EVENTS);
}

function statusLine(doc: Document): string {
  return (
    `wave="${waveTitle(doc)}" city=${isInCity(doc)} ` +
    `treino=${inTreinoOnline(doc, doc.title ?? "")} ` +
    `stam=${readStaminaMinutes(doc) ?? "?"} ` +
    `gameplay=${gameplayConnected()} sock=${gameplaySocketUrl() ?? "none"}`
  );
}

export function startTeleportProbe(): void {
  const page = unsafeWindow;
  const doc = page.document;

  const api: ProbeApi = {
    events: [],
    dump: () => api.events.slice(),
    status: () => statusLine(doc)
  };
  (page as typeof page & { __baiakProbe?: ProbeApi }).__baiakProbe = api;

  onOutgoingPacket((bytes, url) => {
    const type = roomType(bytes);
    if (!type) return;
    // Always keep mode/stage/etc.; also keep short unknown room types for discovery.
    if (!INTERESTING.test(type) && type.length > 24) return;
    if (!INTERESTING.test(type) && bytes.length > 80) return;
    const detail =
      `type=${type} ws=${url} ${statusLine(doc)} hex=${hexHead(bytes)}`;
    pushEvent(api, "out", detail);
    console.info(`[BaiakIdle Helper][probe-out] ${detail}`);
  });

  const wave = doc.getElementById("wave-title");
  if (wave) {
    let last = wave.textContent ?? "";
    const obs = new MutationObserver(() => {
      const next = wave.textContent ?? "";
      if (next === last) return;
      last = next;
      const detail = `"${next.trim()}" ${statusLine(doc)}`;
      pushEvent(api, "wave", detail);
      console.info(`[BaiakIdle Helper][probe-wave] ${detail}`);
    });
    obs.observe(wave, { childList: true, characterData: true, subtree: true });
  }

  // Detect teleport menu mount/unmount and list options (exercise path).
  const bodyObs = new MutationObserver(() => {
    const menu = doc.getElementById("teleport-menu");
    if (!menu) return;
    const opts = [...menu.querySelectorAll<HTMLElement>("button.tp-opt, .tp-opt")].map(b => {
      const tp = b.dataset.tp ?? "?";
      const label = (b.textContent ?? "").trim().replace(/\s+/g, " ");
      const disabled = (b as HTMLButtonElement).disabled ? "!" : "";
      return `${disabled}${tp}:${label}`;
    });
    if (opts.length === 0) return;
    const key = opts.join("|");
    const lastKey = (bodyObs as MutationObserver & { __lastOpts?: string }).__lastOpts;
    if (key === lastKey) return;
    (bodyObs as MutationObserver & { __lastOpts?: string }).__lastOpts = key;
    const detail = `opts=[${opts.join(", ")}] ${statusLine(doc)}`;
    pushEvent(api, "menu", detail);
    console.info(`[BaiakIdle Helper][probe-menu] ${detail}`);
  });
  bodyObs.observe(doc.documentElement, { childList: true, subtree: true });

  const boot = statusLine(doc);
  pushEvent(api, "boot", boot);
  console.info(
    `[BaiakIdle Helper][probe] ready. Manual: sair do Treino → abrir Teleportes → Treino online. ` +
      `Console: [probe-out]/[probe-wave]/[probe-menu]. DevTools: window.__baiakProbe.dump(). ${boot}`
  );
}
