/** Colyseus ROOM_DATA (0x0d) + msgpackr record packing used by BaiakIdle client sends. */

function packStr(value: string): Uint8Array {
  const bytes = new TextEncoder().encode(value);
  if (bytes.length < 32) {
    const out = new Uint8Array(1 + bytes.length);
    out[0] = 0xa0 | bytes.length;
    out.set(bytes, 1);
    return out;
  }
  if (bytes.length < 256) {
    const out = new Uint8Array(2 + bytes.length);
    out[0] = 0xd9;
    out[1] = bytes.length;
    out.set(bytes, 2);
    return out;
  }
  if (bytes.length > 0xffff) throw new Error(`string too long: ${value.slice(0, 32)}…`);
  const out = new Uint8Array(3 + bytes.length);
  out[0] = 0xda;
  out[1] = (bytes.length >> 8) & 0xff;
  out[2] = bytes.length & 0xff;
  out.set(bytes, 3);
  return out;
}

function packBool(value: boolean): Uint8Array {
  return new Uint8Array([value ? 0xc3 : 0xc2]);
}

/** Unsigned integer packing (msgpack). */
function packUint(value: number): Uint8Array {
  const n = Math.max(0, Math.floor(value));
  if (n <= 0x7f) return new Uint8Array([n]);
  if (n <= 0xff) return new Uint8Array([0xcc, n]);
  if (n <= 0xffff) return new Uint8Array([0xcd, (n >> 8) & 0xff, n & 0xff]);
  return new Uint8Array([
    0xce,
    (n >>> 24) & 0xff,
    (n >>> 16) & 0xff,
    (n >>> 8) & 0xff,
    n & 0xff
  ]);
}

function packRoomRecord(type: string, keys: string[], values: Uint8Array[]): string {
  if (keys.length !== values.length) throw new Error("packRoomRecord key/value length mismatch");
  if (keys.length > 15) throw new Error("packRoomRecord supports at most 15 keys");
  const parts = [
    new Uint8Array([0x0d]),
    packStr(type),
    new Uint8Array([0xd4, 0x72, 0x40, 0x90 | keys.length])
  ];
  for (const key of keys) parts.push(packStr(key));
  parts.push(...values);
  let size = 0;
  for (const part of parts) size += part.length;
  const raw = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    raw.set(part, offset);
    offset += part.length;
  }
  let binary = "";
  for (const byte of raw) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export const SELL_ALL_BASE64 = packRoomRecord("sellall", ["protected"], [packBool(false)]);

/**
 * Share an auction listing on the Market chat channel.
 * Native: chat room `aucshare { listingId }` (Compartilhar no Market).
 */
export function aucSharePacket(listingId: number): string {
  return packRoomRecord("aucshare", ["listingId"], [packUint(listingId)]);
}

export const OPEN_ALL_GLOOTH_BAGS_BASE64 = packRoomRecord(
  "useitem",
  ["name", "from", "all"],
  [packStr("glooth bag"), packStr("backpack"), packBool(true)]
);

export function supplyMoveToLootPacket(itemName: string): string {
  return packRoomRecord(
    "supplymove",
    ["name", "from", "to"],
    [packStr(itemName), packStr("supply"), packStr("pouch")]
  );
}

/** Move equip item between pouch and backpack (native bagmove). */
export function bagMovePacket(hash: string, to: "backpack" | "pouch"): string {
  return packRoomRecord("bagmove", ["hash", "to"], [packStr(hash), packStr(to)]);
}

/** Enter a hunt stage by stable huntId (e.g. corym-cave). */
export function stagePacket(huntId: string): string {
  return packRoomRecord("stage", ["huntId"], [packStr(huntId)]);
}

/** Return to city — server only accepts from party leader. */
export function toCityPacket(): string {
  return packRoomRecord("tocity", [], []);
}

/**
 * City presence flag. Client sends `{ away: true }` when entering city canvas
 * and `{ away: false }` when leaving city to another mode (treino/hunt/…).
 */
export function cityPresencePacket(away: boolean): string {
  return packRoomRecord("cityPresence", ["away"], [packBool(away)]);
}

/** Switch world mode (e.g. "exercise" = Treino online). */
export function modePacket(mode: string): string {
  return packRoomRecord("mode", ["mode"], [packStr(mode)]);
}

/** @internal exposed for tests */
export function packRoomRecordForTest(
  type: string,
  keys: string[],
  values: Uint8Array[]
): string {
  return packRoomRecord(type, keys, values);
}

export { packStr, packBool };
