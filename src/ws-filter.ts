/**
 * Visual/noise packet filters for Colyseus binary frames.
 * Used by the helper (drop before game/Pixi) and documented for the bridge.
 */

/** Colyseus ROOM_DATA */
const ROOM_DATA = 0x0d;
/** Colyseus ROOM_STATE full */
const ROOM_STATE = 0x0e;
/** Colyseus ROOM_STATE_PATCH — high frequency, useless for MCP debugging */
const ROOM_STATE_PATCH = 0x0f;

const decoder = new TextDecoder();

/** Room message types that only drive particles / floating text (Pixi). */
const VISUAL_ROOM_TYPES = new Set(["fx"]);

/** Room types noisy for bridge capture but sometimes useful for game UI. */
const BRIDGE_NOISE_ROOM_TYPES = new Set(["fx", "combatlog"]);

export function roomMessageType(bytes: Uint8Array): string {
  if (bytes[0] !== ROOM_DATA || bytes.length < 2) return "";
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
  if (length <= 0 || offset + length > bytes.length) return "";
  try {
    return decoder.decode(bytes.subarray(offset, offset + length)).toLowerCase();
  } catch {
    return "";
  }
}

/**
 * Drop before the game client sees it → no Q5/Pixi particle work.
 * Safe-ish: game already skips fx when document.hidden.
 */
export function shouldDropVisualForGame(bytes: Uint8Array): boolean {
  if (bytes[0] !== ROOM_DATA) return false;
  return VISUAL_ROOM_TYPES.has(roomMessageType(bytes));
}

/**
 * Skip emitting to MCP bridge (still delivered to the game).
 * State patches are the main flood (~hundreds/s in combat).
 */
export function shouldSkipBridgeCapture(bytes: Uint8Array): boolean {
  const b0 = bytes[0];
  if (b0 === ROOM_STATE || b0 === ROOM_STATE_PATCH) return true;
  if (b0 === ROOM_DATA) {
    return BRIDGE_NOISE_ROOM_TYPES.has(roomMessageType(bytes));
  }
  // Keep join/leave/handshake and anything else small
  return false;
}
