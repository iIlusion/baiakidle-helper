const HOUR = 3_600_000;
const decoder = new TextDecoder();
const SELL_NOTIFY_RE = /vendidos|sold \{n\} items for|sold \{mc\} materials for/i;

export const RATE_MODES = ["session", "game"] as const;
export type RateMode = (typeof RATE_MODES)[number];

function readString(bytes: Uint8Array, offset: number): [string, number] | undefined {
  const prefix = bytes[offset++];
  let length: number;
  if ((prefix & 0xe0) === 0xa0) length = prefix & 0x1f;
  else if (prefix === 0xd9) length = bytes[offset++];
  else if (prefix === 0xda) {
    length = (bytes[offset] << 8) | bytes[offset + 1];
    offset += 2;
  } else return;
  return [decoder.decode(bytes.subarray(offset, offset + length)), offset + length];
}

function readUnsigned(bytes: Uint8Array, offset: number): [number, number] | undefined {
  const prefix = bytes[offset++];
  if (prefix <= 0x7f) return [prefix, offset];
  if (prefix === 0xcc) return [bytes[offset], offset + 1];
  if (prefix === 0xcd) return [(bytes[offset] << 8) | bytes[offset + 1], offset + 2];
  if (prefix === 0xce) {
    return [
      bytes[offset] * 0x1000000 +
        (bytes[offset + 1] << 16) +
        (bytes[offset + 2] << 8) +
        bytes[offset + 3],
      offset + 4
    ];
  }
  if (prefix === 0xcf) {
    // uint64 — gold values fit in JS number for normal play.
    const high = bytes[offset] * 0x1000000 +
      (bytes[offset + 1] << 16) +
      (bytes[offset + 2] << 8) +
      bytes[offset + 3];
    const low = bytes[offset + 4] * 0x1000000 +
      (bytes[offset + 5] << 16) +
      (bytes[offset + 6] << 8) +
      bytes[offset + 7];
    return [high * 0x1_0000_0000 + low, offset + 8];
  }
}

function readMapCount(bytes: Uint8Array, offset: number): [number, number] | undefined {
  const prefix = bytes[offset++];
  if ((prefix & 0xf0) === 0x80) return [prefix & 0x0f, offset];
  if (prefix === 0xde) return [(bytes[offset] << 8) | bytes[offset + 1], offset + 2];
  if (prefix === 0xdf) {
    return [
      ((bytes[offset] << 24) >>> 0) +
        (bytes[offset + 1] << 16) +
        (bytes[offset + 2] << 8) +
        bytes[offset + 3],
      offset + 4
    ];
  }
}

function readNumber(bytes: Uint8Array, offset: number): [number, number] | undefined {
  const unsigned = readUnsigned(bytes, offset);
  if (unsigned) return unsigned;
  const prefix = bytes[offset++];
  if (prefix >= 0xe0) return [prefix - 0x100, offset];
  if (prefix === 0xd0) {
    const value = bytes[offset];
    return [value > 0x7f ? value - 0x100 : value, offset + 1];
  }
  if (prefix === 0xd1) {
    const value = (bytes[offset] << 8) | bytes[offset + 1];
    return [value > 0x7fff ? value - 0x10000 : value, offset + 2];
  }
  if (prefix === 0xd2) {
    const value =
      ((bytes[offset] << 24) |
        (bytes[offset + 1] << 16) |
        (bytes[offset + 2] << 8) |
        bytes[offset + 3]) >>>
      0;
    return [value > 0x7fffffff ? value - 0x100000000 : value, offset + 4];
  }
  if (prefix === 0xca) {
    const view = new DataView(bytes.buffer, bytes.byteOffset + offset, 4);
    return [view.getFloat32(0, false), offset + 4];
  }
  if (prefix === 0xcb) {
    const view = new DataView(bytes.buffer, bytes.byteOffset + offset, 8);
    return [view.getFloat64(0, false), offset + 8];
  }
}

function skipValue(bytes: Uint8Array, offset: number): number | undefined {
  const prefix = bytes[offset];
  if (prefix === undefined) return;
  if (prefix <= 0x7f || prefix >= 0xe0 || prefix === 0xc0 || prefix === 0xc2 || prefix === 0xc3) {
    return offset + 1;
  }
  if ((prefix & 0xe0) === 0xa0) return offset + 1 + (prefix & 0x1f);
  if (prefix === 0xd9) return offset + 2 + bytes[offset + 1];
  if (prefix === 0xda) return offset + 3 + ((bytes[offset + 1] << 8) | bytes[offset + 2]);
  if (prefix === 0xcc || prefix === 0xd0) return offset + 2;
  if (prefix === 0xcd || prefix === 0xd1) return offset + 3;
  if (prefix === 0xce || prefix === 0xd2 || prefix === 0xca) return offset + 5;
  if (prefix === 0xcf || prefix === 0xd3 || prefix === 0xcb) return offset + 9;
  if ((prefix & 0xf0) === 0x80) {
    let next = offset + 1;
    const count = prefix & 0x0f;
    for (let index = 0; index < count; index++) {
      const key = readString(bytes, next);
      if (!key) return;
      const afterValue = skipValue(bytes, key[1]);
      if (afterValue === undefined) return;
      next = afterValue;
    }
    return next;
  }
  if (prefix === 0xde) {
    let next = offset + 3;
    const count = (bytes[offset + 1] << 8) | bytes[offset + 2];
    for (let index = 0; index < count; index++) {
      const key = readString(bytes, next);
      if (!key) return;
      const afterValue = skipValue(bytes, key[1]);
      if (afterValue === undefined) return;
      next = afterValue;
    }
    return next;
  }
  if ((prefix & 0xf0) === 0x90) {
    let next = offset + 1;
    const count = prefix & 0x0f;
    for (let index = 0; index < count; index++) {
      const afterValue = skipValue(bytes, next);
      if (afterValue === undefined) return;
      next = afterValue;
    }
    return next;
  }
}

function readStringMap(
  bytes: Uint8Array,
  offset: number
): [Record<string, string | number>, number] | undefined {
  const header = readMapCount(bytes, offset);
  if (!header) return;
  let next = header[1];
  const result: Record<string, string | number> = {};
  for (let index = 0; index < header[0]; index++) {
    const key = readString(bytes, next);
    if (!key) return;
    next = key[1];
    const asString = readString(bytes, next);
    if (asString) {
      result[key[0]] = asString[0];
      next = asString[1];
      continue;
    }
    const asNumber = readNumber(bytes, next);
    if (asNumber) {
      result[key[0]] = asNumber[0];
      next = asNumber[1];
      continue;
    }
    const skipped = skipValue(bytes, next);
    if (skipped === undefined) return;
    next = skipped;
  }
  return [result, next];
}

/** Fast reject before full parse (combat floods are mostly 0x0d + short type). */
export function isInterestingRatePacket(bytes: Uint8Array): boolean {
  if (bytes[0] !== 0x0d || bytes.length < 4) return false;
  // fixstr: 0xa2 "fx", 0xa6 "notify", 0xa3 "log"
  const p = bytes[1];
  if (p === 0xa2) return bytes[2] === 0x66 && bytes[3] === 0x78; // fx
  if (p === 0xa3) return bytes[2] === 0x6c && bytes[3] === 0x6f; // log*
  if (p === 0xa6) return bytes[2] === 0x6e && bytes[3] === 0x6f; // notify*
  return false;
}

export function parseFx(bytes: Uint8Array): { type: "xp" | "gold"; amount: number } | undefined {
  if (bytes[0] !== 0x0d) return;
  const message = readString(bytes, 1);
  if (!message || message[0] !== "fx") return;

  let offset = message[1];
  const map = bytes[offset++];
  let count: number;
  if ((map & 0xf0) === 0x80) count = map & 0x0f;
  else if (map === 0xde) {
    count = (bytes[offset] << 8) | bytes[offset + 1];
    offset += 2;
  } else return;

  let type: "xp" | "gold" | undefined;
  let amount: number | undefined;
  for (let index = 0; index < count; index++) {
    const key = readString(bytes, offset);
    if (!key) return;
    offset = key[1];
    if (key[0] === "t") {
      const value = readString(bytes, offset);
      if (!value) return;
      if (value[0] === "xp" || value[0] === "gold") type = value[0];
      offset = value[1];
    } else {
      const value = readUnsigned(bytes, offset);
      if (!value) return;
      if (key[0] === "amount") amount = value[0];
      offset = value[1];
    }
  }
  if (type && amount !== undefined) return { type, amount };
}

/**
 * Gold from pouch sell notifications (manual sellall, script sell, or native auto-sell).
 * Matches server `notify` / `log` payloads like "Vendidos {n} itens por {g}g.".
 */
export function parseSoldGold(bytes: Uint8Array): number | undefined {
  if (bytes[0] !== 0x0d) return;
  const message = readString(bytes, 1);
  if (!message) return;
  const type = message[0];
  if (type !== "notify" && type !== "log") return;

  const root = readStringMap(bytes, message[1]);
  if (!root) return;
  const payload = root[0];
  const text = typeof payload.text === "string" ? payload.text : "";
  if (!SELL_NOTIFY_RE.test(text)) return;

  // Nested params map is stored as skipped above when nested — re-parse params carefully.
  // readStringMap only keeps string/number leaves; nested map for params is skipped.
  // So scan the payload region again for a params map.
  const params = readNestedParams(bytes, message[1]);
  if (!params) return;

  const itemsGold = numberParam(params, "g");
  const matsGold = numberParam(params, "mg");
  const total = itemsGold + matsGold;
  return total > 0 ? total : undefined;
}

function numberParam(params: Record<string, string | number>, key: string): number {
  const value = params[key];
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, value);
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^\d.-]/g, ""));
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  }
  return 0;
}

function readNestedParams(
  bytes: Uint8Array,
  offset: number
): Record<string, string | number> | undefined {
  const header = readMapCount(bytes, offset);
  if (!header) return;
  let next = header[1];
  for (let index = 0; index < header[0]; index++) {
    const key = readString(bytes, next);
    if (!key) return;
    next = key[1];
    if (key[0] === "params") {
      const params = readStringMap(bytes, next);
      return params?.[0];
    }
    const skipped = skipValue(bytes, next);
    if (skipped === undefined) return;
    next = skipped;
  }
}

export function calculateSessionRate(sessionMs: number, total: number): number {
  return sessionMs > 0 ? Math.max(0, total * HOUR / sessionMs) : 0;
}