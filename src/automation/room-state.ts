import { Decoder, MapSchema, Reflection, type Schema } from "@colyseus/schema";
import { onGamePacket } from "../socket";

const ROOM_JOIN = 0x0a;
const ROOM_STATE = 0x0e;
const ROOM_STATE_PATCH = 0x0f;
const STAMINA_MINUTES = 2520;

export type BossRoomSnapshot = {
  ready: true;
  mode: string;
  huntId: string;
  activeBossId: string;
  bossChargesLeft: number | null;
  bossChargesMax: number;
  bossCooldowns: Record<string, number>;
  bossKills: Record<string, number>;
  level: number;
  staminaMinutes: number;
  dead: boolean;
};

type RoomRawState = Record<string, unknown> & {
  mode?: unknown;
  huntId?: unknown;
  activeBossId?: unknown;
  bossChargesLeft?: unknown;
  bossChargesMax?: unknown;
  bossCooldowns?: unknown;
  bestiary?: unknown;
  accountLevel?: unknown;
  players?: unknown;
  stamina?: unknown;
  dead?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function entriesOf(value: unknown): Array<[string, unknown]> {
  if (value instanceof MapSchema || value instanceof Map) {
    return [...value.entries()].map(([key, entry]) => [String(key), entry]);
  }
  if (isRecord(value)) return Object.entries(value);
  return [];
}

function numericEntries(value: unknown): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [key, entry] of entriesOf(value)) {
    const direct = numberValue(entry);
    const nested = isRecord(entry)
      ? numberValue(entry.kills) ?? numberValue(entry.count) ?? numberValue(entry.value)
      : undefined;
    const number = direct ?? nested;
    if (number !== undefined) result[key] = number;
  }
  return result;
}

function parseBestiary(value: unknown): Record<string, number> {
  if (typeof value === "string") {
    try {
      return numericEntries(JSON.parse(value) as unknown);
    } catch {
      return {};
    }
  }
  return numericEntries(value);
}

function bossKills(value: unknown): Record<string, number> {
  return Object.fromEntries(
    Object.entries(parseBestiary(value)).filter(([key]) => !key.startsWith("h:"))
  );
}

function playerLevel(value: unknown): number {
  let highest = 0;
  for (const [, player] of entriesOf(value)) {
    const level = isRecord(player)
      ? numberValue(player.level) ?? numberValue(player.accountLevel)
      : numberValue(player);
    if (level !== undefined) highest = Math.max(highest, level);
  }
  return highest;
}

function staminaMinutes(value: unknown): number {
  const ratio = numberValue(value) ?? 0;
  return Math.round(Math.min(1, Math.max(0, ratio)) * STAMINA_MINUTES);
}

export function projectBossRoomSnapshot(raw: unknown): BossRoomSnapshot | undefined {
  if (!isRecord(raw)) return undefined;
  const state = raw as RoomRawState;
  const chargesLeft = numberValue(state.bossChargesLeft);
  if (chargesLeft === undefined || state.bossCooldowns === undefined) return undefined;

  const level = numberValue(state.accountLevel) ?? playerLevel(state.players);
  return {
    ready: true,
    mode: stringValue(state.mode),
    huntId: stringValue(state.huntId),
    activeBossId: stringValue(state.activeBossId),
    bossChargesLeft: chargesLeft,
    bossChargesMax: numberValue(state.bossChargesMax) ?? 20,
    bossCooldowns: numericEntries(state.bossCooldowns),
    bossKills: bossKills(state.bestiary),
    level: level ?? 0,
    staminaMinutes: staminaMinutes(state.stamina),
    dead: state.dead === true
  };
}

function readByteString(bytes: Uint8Array, offset: { offset: number }): string | undefined {
  const length = bytes[offset.offset++];
  if (length === undefined || offset.offset + length > bytes.length) return undefined;
  const value = new TextDecoder().decode(bytes.subarray(offset.offset, offset.offset + length));
  offset.offset += length;
  return value;
}

function schemaBytes(bytes: Uint8Array): Uint8Array {
  return bytes;
}

export class RoomStateDecoder {
  private decoder: Decoder<Schema> | undefined;

  observe(bytes: Uint8Array): BossRoomSnapshot | undefined {
    const code = bytes[0];
    if (code === ROOM_JOIN) {
      const iterator = { offset: 1 };
      if (readByteString(bytes, iterator) === undefined) return undefined;
      const serializer = readByteString(bytes, iterator);
      if (serializer !== "schema") {
        this.decoder = undefined;
        return undefined;
      }
      try {
        this.decoder = Reflection.decode(
          schemaBytes(bytes) as Parameters<typeof Reflection.decode>[0],
          iterator
        ) as Decoder<Schema>;
      } catch {
        this.decoder = undefined;
      }
      return this.snapshot();
    }

    if (!this.decoder || (code !== ROOM_STATE && code !== ROOM_STATE_PATCH)) {
      return this.snapshot();
    }

    try {
      this.decoder.decode(
        schemaBytes(bytes) as unknown as Parameters<Decoder<Schema>["decode"]>[0],
        { offset: 1 }
      );
    } catch {
      return this.snapshot();
    }
    return this.snapshot();
  }

  rawState(): (Schema & Record<string, unknown>) | undefined {
    return this.decoder?.state as (Schema & Record<string, unknown>) | undefined;
  }

  snapshot(): BossRoomSnapshot | undefined {
    return projectBossRoomSnapshot(this.rawState());
  }
}

const decoders = new WeakMap<WebSocket, RoomStateDecoder>();
let currentSnapshot: BossRoomSnapshot | undefined;
let mirrorStarted = false;

export function startRoomStateMirror(): void {
  if (mirrorStarted) return;
  mirrorStarted = true;
  onGamePacket((bytes, _receivedAt, socket) => {
    // A decoder is scoped per room socket because each handshake has its own schema context.
    // Only ordinary state/state-patch packets are observed; no feature-specific game command
    // or event message is parsed here.
    const decoder = decoders.get(socket) ?? new RoomStateDecoder();
    decoders.set(socket, decoder);
    const next = decoder.observe(bytes);
    if (next) currentSnapshot = next;
  });
}

export function readBossRoomSnapshot(): BossRoomSnapshot | undefined {
  return currentSnapshot;
}
