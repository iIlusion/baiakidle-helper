import { describe, expect, test } from "vitest";
import { Encoder, MapSchema, Reflection, Schema, defineTypes } from "@colyseus/schema";
import { RoomStateDecoder, projectBossRoomSnapshot } from "./room-state";

describe("projectBossRoomSnapshot", () => {
  test("projects only custom Auto Boss state", () => {
    const snapshot = projectBossRoomSnapshot({
      mode: "boss",
      huntId: "shadowpelt",
      activeBossId: "shadowpelt",
      bossChargesLeft: 8,
      bossChargesMax: 20,
      bossCooldowns: new Map([["bloodback", 1234]]),
      bestiary: JSON.stringify({ shadowpelt: 4, "h:corym-cave": 9 }),
      accountLevel: 80,
      stamina: 90 / 2520,
      dead: false
    });

    expect(snapshot).toEqual({
      ready: true,
      mode: "boss",
      huntId: "shadowpelt",
      activeBossId: "shadowpelt",
      bossChargesLeft: 8,
      bossChargesMax: 20,
      bossCooldowns: { bloodback: 1234 },
      bossKills: { shadowpelt: 4 },
      level: 80,
      staminaMinutes: 90,
      dead: false
    });
  });

  test("rejects state before boss fields are available", () => {
    expect(projectBossRoomSnapshot({ mode: "city" })).toBeUndefined();
  });
});

class MirrorFixture extends Schema {
  declare mode: string;
  declare bossChargesLeft: number;
  declare bossCooldowns: MapSchema<number>;
}
defineTypes(MirrorFixture, {
  mode: "string",
  bossChargesLeft: "number",
  bossCooldowns: { map: "number" }
});

function joinPacket(encoder: Encoder<MirrorFixture>): Uint8Array {
  const token = new TextEncoder().encode("token");
  const serializer = new TextEncoder().encode("schema");
  const reflection = Reflection.encode(encoder);
  return Uint8Array.from([
    0x0a,
    token.length,
    ...token,
    serializer.length,
    ...serializer,
    ...reflection
  ]);
}

test("decodes reflected state and subsequent patch", async () => {
  const state = new MirrorFixture();
  const encoder = new Encoder(state);
  state.mode = "city";
  state.bossChargesLeft = 20;
  state.bossCooldowns = new MapSchema<number>();
  state.bossCooldowns.set("bloodback", 1234);
  const mirror = new RoomStateDecoder();
  mirror.observe(joinPacket(encoder));
  mirror.observe(Uint8Array.from([0x0e, ...encoder.encodeAll()]));
  expect(mirror.rawState()?.bossChargesLeft).toBe(20);

  state.bossChargesLeft = 7;
  mirror.observe(Uint8Array.from([0x0f, ...encoder.encode()]));
  expect(mirror.rawState()?.bossChargesLeft).toBe(7);
});
