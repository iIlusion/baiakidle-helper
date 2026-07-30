export type SocketRole = {
  score: number;
  messages: number;
  signals: Set<string>;
  chat: boolean;
};

const gameplaySignals = [
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
  "citypos"
];

export function createSocketRole(): SocketRole {
  return { score: 0, messages: 0, signals: new Set(), chat: false };
}

function messageType(bytes: Uint8Array): string {
  if (bytes[0] !== 0x0d) return "";
  const prefix = bytes[1];
  let offset = 2;
  let length = 0;
  if ((prefix & 0xe0) === 0xa0) length = prefix & 0x1f;
  else if (prefix === 0xd9) { length = bytes[2]; offset = 3; }
  else if (prefix === 0xda) { length = (bytes[2] << 8) | bytes[3]; offset = 4; }
  else return "";
  return new TextDecoder().decode(bytes.subarray(offset, offset + length)).toLowerCase();
}

export function observeSocket(role: SocketRole, bytes: Uint8Array): void {
  const sample = new TextDecoder().decode(bytes.subarray(0, 16_384)).toLowerCase();
  role.messages += 1;
  role.score += 1;

  if (messageType(bytes) === "chat") {
    role.chat = true;
    role.signals.add("chat");
    role.score = -1_000;
    return;
  }

  for (const signal of gameplaySignals) {
    if (sample.includes(signal) && !role.signals.has(signal)) {
      role.signals.add(signal);
      role.score += 25;
    }
  }
}
