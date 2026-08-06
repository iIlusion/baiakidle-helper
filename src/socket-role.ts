export type SocketRole = {
  score: number;
  messages: number;
  signals: Set<string>;
  chat: boolean;
  /** After room is identified, skip heavy body sampling. */
  settled: boolean;
};

/**
 * Inbound markers that identify the Colyseus *room* socket (not chat).
 * Sampling the full body is expensive — only used briefly until the role settles.
 */
const roomSignals = [
  "combatlog",
  "sellcd",
  "gear",
  "supply",
  "effect",
  "attack",
  "hit",
  "heal",
  "death",
  "gold",
  "citypos",
  "citypresence",
  "offlineinfo",
  "features",
  "reconnectok",
  "huntgate",
  "benchequip",
  "dailystatus",
  "testdmgstate"
];

const decoder = new TextDecoder();

export function createSocketRole(): SocketRole {
  return { score: 0, messages: 0, signals: new Set(), chat: false, settled: false };
}

/** Cheap room-message type (first msgpack string after 0x0d). */
export function messageType(bytes: Uint8Array): string {
  if (bytes[0] !== 0x0d || bytes.length < 2) return "";
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

export function observeSocket(role: SocketRole, bytes: Uint8Array): void {
  role.messages += 1;
  role.score += 1;

  // Hot path: once the room is identified, do not decode anything further.
  if (role.settled) return;

  const type = messageType(bytes);
  if (type === "chat") {
    role.chat = true;
    role.signals.add("chat");
    role.score = -1_000;
    role.settled = true;
    return;
  }

  if (type && !role.signals.has(`type:${type}`)) {
    role.signals.add(`type:${type}`);
    role.score += 5;
  }

  if (role.signals.size >= 5 || role.messages >= 80) {
    role.settled = true;
    return;
  }

  // Tiny head only — enough for signal substrings in small control messages.
  const headLen = Math.min(bytes.length, 192);
  const sample = decoder.decode(bytes.subarray(0, headLen)).toLowerCase();
  for (const signal of roomSignals) {
    if (sample.includes(signal) && !role.signals.has(signal)) {
      role.signals.add(signal);
      role.score += 25;
    }
  }

  if (role.signals.size >= 5) role.settled = true;
}
