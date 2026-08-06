import assert from "node:assert/strict";
import { calculateSessionRate, parseFx, parseSoldGold } from "../src/rate.ts";
import {
  SELL_ALL_BASE64,
  OPEN_ALL_GLOOTH_BAGS_BASE64,
  bagMovePacket,
  stagePacket,
  bossPacket
} from "../src/packets.ts";

const xp = Uint8Array.from(Buffer.from("DaJmeN4ABKF0onhwoXgKoXkDpmFtb3VudM0J2A==", "base64"));
assert.deepEqual(parseFx(xp), { type: "xp", amount: 2520 });
assert.equal(calculateSessionRate(60_000, 1000), 60_000);
assert.equal(calculateSessionRate(0, 1000), 0);

const soldItems = Uint8Array.from(
  Buffer.from("DaZub3RpZnmCpHRleHS8VmVuZGlkb3Mge259IGl0ZW5zIHBvciB7Z31nLqZwYXJhbXOCoW4MoWfNhwc=", "base64")
);
assert.equal(parseSoldGold(soldItems), 34_567);

const soldBoth = Uint8Array.from(
  Buffer.from(
    "DaZub3RpZnmCpHRleHTZN1ZlbmRpZG9zIHtufSBpdGVucyBwb3Ige2d9ZyArIHttY30gbWF0ZXJpYWlzIHBvciB7bWd9Zy6mcGFyYW1zhKFuBaFnzQfQom1jCqJtZ80DIA==",
    "base64"
  )
);
assert.equal(parseSoldGold(soldBoth), 2_000 + 800);

const notSell = Uint8Array.from(Buffer.concat([
  Buffer.from([0x0d, 0xa6]),
  Buffer.from("notify"),
  Buffer.from([0x80])
]));
assert.equal(parseSoldGold(notSell), undefined);

// Known game packets (regression for packer).
assert.equal(SELL_ALL_BASE64, "DadzZWxsYWxs1HJAkalwcm90ZWN0ZWTC");
assert.equal(OPEN_ALL_GLOOTH_BAGS_BASE64, "Dad1c2VpdGVt1HJAk6RuYW1lpGZyb22jYWxsqmdsb290aCBiYWeoYmFja3BhY2vD");

const bag = Buffer.from(bagMovePacket("abc123hash", "backpack"), "base64");
assert.equal(bag[0], 0x0d);
assert.ok(Buffer.from(bag).includes(Buffer.from("bagmove")));
assert.ok(Buffer.from(bag).includes(Buffer.from("abc123hash")));
assert.ok(Buffer.from(bag).includes(Buffer.from("backpack")));

const stage = Buffer.from(stagePacket("corym-cave"), "base64");
assert.ok(Buffer.from(stage).includes(Buffer.from("stage")));
assert.ok(Buffer.from(stage).includes(Buffer.from("corym-cave")));

const boss = Buffer.from(bossPacket("shadowpelt", true), "base64");
assert.ok(Buffer.from(boss).includes(Buffer.from("boss")));
assert.ok(Buffer.from(boss).includes(Buffer.from("shadowpelt")));

// Hunt catalog must load for Auto Hunt select.
const { HUNTS, huntById } = await import("../src/data/hunts.ts");
assert.ok(HUNTS.length > 50);
assert.equal(huntById("corym-cave")?.name, "Corym Skirmisher");
assert.equal(huntById("bakragore"), undefined);
// Sorted by minLevel ascending.
for (let i = 1; i < HUNTS.length; i++) {
  assert.ok(HUNTS[i - 1].minLevel <= HUNTS[i].minLevel);
}

const { clampStaminaMinutes, formatStaminaMinutes, defaults } = await import("../src/automation/settings.ts");
assert.equal(clampStaminaMinutes(60), 60);
assert.equal(clampStaminaMinutes(0), 1);
assert.equal(clampStaminaMinutes(99999), 48 * 60);
assert.equal(formatStaminaMinutes(60), "1h");
assert.equal(formatStaminaMinutes(90), "1h30m");
assert.equal(formatStaminaMinutes(45), "45m");
assert.ok(defaults.autoHuntStaminaToTreinoMinutes > 0);
assert.ok(defaults.autoHuntStaminaToHuntMinutes > 0);

const { modePacket } = await import("../src/packets.ts");
const mode = Buffer.from(modePacket("exercise"), "base64");
assert.ok(Buffer.from(mode).includes(Buffer.from("mode")));
assert.ok(Buffer.from(mode).includes(Buffer.from("exercise")));

console.log("rate checks passed");