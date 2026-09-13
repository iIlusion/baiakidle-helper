# Leviticus Extension Custom Auto Boss Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebrand the existing userscript as Leviticus Extension and add a fully extension-owned Auto Boss with an ordered queue, manual start/stop, and a Brasília-midnight daily start.

**Architecture:** Decode the normal reflected Colyseus room schema already flowing through the intercepted gameplay WebSocket, project only boss-relevant fields, and feed them into an extension-owned state machine adapted from the Leviticus desktop controller. The controller sends only the normal manual `boss` and `cityPresence` room commands; UI, scheduling, persistence, queue progression, and result detection remain local to the extension.

**Tech Stack:** TypeScript 5.9, React 19, Vite 7, `@colyseus/schema` 3.0.76, Vitest 3.2.4, Tampermonkey userscript metadata.

**Spec:** `docs/superpowers/specs/2026-09-13-leviticus-extension-auto-boss-design.md`

## Global Constraints

- Never send or consume the native Auto Boss contracts `autoboss`, `autobosslist`, `autobosspreset`, or `autobossstate`.
- The only boss navigation command is the normal manual `boss` message with `{ bossId, fromCity }`; send `cityPresence { away: false }` first when leaving city.
- Preserve repository URLs, release asset names, `@namespace`, `baiakidle-helper-v1`, dev-loader URLs/port, and compatibility-sensitive DOM IDs.
- Rename all public identity and copy that is safe to rename to **Leviticus Extension**.
- Preserve the user's existing uncommitted `src/socket.ts` local-bridge change.
- Auto Boss owns queue, cursor, schedule, runtime recovery, result classification, and persistence.
- Midnight means civil midnight in `America/Sao_Paulo`; the daily run waits for at least 90 stamina minutes.
- No presets, boss preparation, AutoBuild, Helper loadouts, equipment sets, imbues, or automatic Boss Pass.
- UI must work down to 320 px, expose keyboard reordering, show visible focus, and respect `prefers-reduced-motion`.

---

## File Structure

### New production files

- `src/automation/room-state.ts` — reflected Colyseus decoder per socket and projection to a small immutable `BossRoomSnapshot`.
- `src/automation/auto-boss.ts` — pure helpers plus the extension-owned `AutoBossRunner` state machine.
- `src/data/boss-catalog.json` — boss IDs, names, minimum levels, keys, and rarity copied from the Leviticus desktop catalog.
- `src/data/bosses.ts` — typed catalog access, queue normalization, and Brasília date helpers.
- `src/components/AutoBossPanel.tsx` — catalog, queue editor, start/stop controls, daily toggle, and runtime status.
- `src/components/LeviticusMark.tsx` — inline SVG mark shared by the tab and panel heading.

### New test files

- `src/automation/room-state.test.ts` — projection and reflected state/patch decoding.
- `src/automation/auto-boss.test.ts` — controller, midnight, cooldown, stamina, charges, reload, and results.
- `src/data/bosses.test.ts` — catalog lookup, normalization, and Brasília date key.
- `src/forbidden-native-auto-boss.test.ts` — scans production TypeScript for forbidden native Auto Boss contracts without spelling them contiguously in the test source.
- `src/update-contract.test.ts` — locks repository/update asset/namespace/storage compatibility.

### Existing files to modify

- `package.json`, `package-lock.json` — add schema decoder and test runner; rename package metadata safely.
- `src/socket.ts` — pass socket identity to packet listeners while preserving the local-bridge bypass.
- `src/packets.ts` — add only the normal manual boss packet builder.
- `src/automation/settings.ts` — add validated Auto Boss settings/runtime fields without changing the storage key.
- `src/automation/scheduler.ts` — run Auto Boss first and block competing navigation only.
- `src/control.tsx` — mount the new panel/view, poll status, rename public identity, and use the Leviticus mark.
- `src/control.css` — replace the incumbent gold/medieval panel language with compact Leviticus dark-violet/cyan tokens and style the queue.
- `scripts/add-userscript-banner.mjs` — visible userscript name/description only; preserve updater contracts.
- `scripts/dev.mjs`, `vite.config.ts` — visible logs/global library name while preserving served and built filenames.
- `README.md` — Leviticus Extension identity, Auto Boss behavior, installation, compatibility explanation, and updated structure.

---

### Task 1: Add the test harness and reflected room-state mirror

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src/socket.ts`
- Create: `src/automation/room-state.ts`
- Create: `src/automation/room-state.test.ts`

**Interfaces:**
- Consumes: raw Colyseus packets already captured by `src/socket.ts`.
- Produces: `GamePacketListener`, `startRoomStateMirror()`, `readBossRoomSnapshot()`, `BossRoomSnapshot`, and `projectBossRoomSnapshot(raw)`.

- [ ] **Step 1: Install exact runtime/test dependencies and preserve the existing smoke check**

Run:

```powershell
npm install @colyseus/schema@3.0.76
npm install --save-dev vitest@3.2.4
```

Set the scripts to:

```json
{
  "test": "node scripts/check-rates.mjs && vitest run",
  "test:unit": "vitest run"
}
```

- [ ] **Step 2: Write failing projection and protocol tests**

Create `src/automation/room-state.test.ts` with focused assertions equivalent to:

```ts
import { describe, expect, test } from "vitest";
import { projectBossRoomSnapshot } from "./room-state";

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
```

Add a protocol test that constructs a reflected `Schema`, encodes `JOIN_ROOM`, `ROOM_STATE`, and `ROOM_STATE_PATCH`, and verifies that one decoder applies the patch:

```ts
import { Encoder, MapSchema, Reflection, Schema, defineTypes } from "@colyseus/schema";

class MirrorFixture extends Schema {
  mode = "city";
  bossChargesLeft = 20;
  bossCooldowns = new MapSchema<number>();
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

test("decodes reflected state and subsequent patch", () => {
  const state = new MirrorFixture();
  const encoder = new Encoder(state);
  const mirror = new RoomStateDecoder();
  mirror.observe(joinPacket(encoder));
  mirror.observe(Uint8Array.from([0x0e, ...encoder.encodeAll()]));
  expect(mirror.snapshot()?.bossChargesLeft).toBe(20);

  state.bossChargesLeft = 7;
  mirror.observe(Uint8Array.from([0x0f, ...encoder.encode()]));
  expect(mirror.snapshot()?.bossChargesLeft).toBe(7);
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run:

```powershell
npm run test:unit -- src/automation/room-state.test.ts
```

Expected: FAIL because `room-state.ts` does not exist.

- [ ] **Step 4: Extend packet listeners without losing the user's local change**

Change the listener signature in `src/socket.ts` to:

```ts
export type GamePacketListener = (
  bytes: Uint8Array,
  receivedAt: number,
  socket: WebSocket
) => void;
```

Pass `socket` from `dispatchPacket()` and leave the existing `localBridge` branch intact. Existing one-argument/two-argument listeners remain valid TypeScript callbacks.

- [ ] **Step 5: Implement the reflected decoder and projection**

In `src/automation/room-state.ts`, use `decode`, `Reflection`, and `Decoder` from `@colyseus/schema`:

```ts
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

export class RoomStateDecoder {
  observe(bytes: Uint8Array): BossRoomSnapshot | undefined;
  snapshot(): BossRoomSnapshot | undefined;
}

export function projectBossRoomSnapshot(raw: unknown): BossRoomSnapshot | undefined;
export function startRoomStateMirror(): void;
export function readBossRoomSnapshot(): BossRoomSnapshot | undefined;
```

Implementation rules:

- Decode the two length-prefixed strings in `JOIN_ROOM` exactly as `colyseus.js` does, and accept only serializer ID `schema`.
- Call `Reflection.decode(bytes, iterator)` once per socket handshake.
- Apply `ROOM_STATE` and `ROOM_STATE_PATCH` with the same decoder and `{ offset: 1 }`.
- Keep decoders in a `WeakMap<WebSocket, RoomStateDecoder>`.
- Promote a decoded state to the current snapshot only when it contains valid `bossChargesLeft` and `bossCooldowns` fields, which excludes the chat room schema.
- Parse MapSchema/plain object cooldowns and JSON/MapSchema bestiary; exclude keys beginning with `h:` from boss kills.
- Prefer `accountLevel`, falling back to the highest player level.
- Clamp stamina ratio to `0..1` and convert it to `0..2520` minutes.
- Never inspect or dispatch room-message types used by the game's native Auto Boss.

- [ ] **Step 6: Run focused tests and typecheck**

Run:

```powershell
npm run test:unit -- src/automation/room-state.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit the isolated state mirror**

Stage the new files normally, then stage only the packet-listener hunks from `src/socket.ts`; leave the preexisting `localBridge` hunk unstaged:

```powershell
git add package.json package-lock.json src/automation/room-state.ts src/automation/room-state.test.ts
git add -p src/socket.ts
git diff --cached -- src/socket.ts
git commit -m "feat: mirror boss room state for extension automation"
```

Expected cached socket diff: listener type/signature/call changes only; no `localBridge` addition.

---

### Task 2: Add the boss catalog and backward-compatible settings

**Files:**
- Create: `src/data/boss-catalog.json`
- Create: `src/data/bosses.ts`
- Create: `src/data/bosses.test.ts`
- Modify: `src/automation/settings.ts`
- Create: `src/update-contract.test.ts`

**Interfaces:**
- Consumes: the approved catalog from `C:\Users\ak\Desktop\baiakidle-websocket\hub\src\data\boss-catalog.json` and current `Settings` persistence.
- Produces: `BossEntry`, `BOSSES`, `bossById()`, `normalizeBossQueue()`, `brasiliaDateKey()`, and validated Auto Boss fields on `Settings`.

- [ ] **Step 1: Write failing catalog, migration, and compatibility tests**

Create `src/data/bosses.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { bossById, brasiliaDateKey, normalizeBossQueue } from "./bosses";

describe("boss catalog", () => {
  test("resolves id and bossKey", () => {
    expect(bossById("shadowpelt")?.name).toBe("Shadowpelt");
    expect(bossById("grand_master_oberon")?.id).toBe("oberon");
  });

  test("normalizes invalid and duplicate queue entries", () => {
    expect(normalizeBossQueue(["shadowpelt", "bad", "shadowpelt", "bloodback"]))
      .toEqual(["shadowpelt", "bloodback"]);
  });

  test("uses the Brasília calendar", () => {
    expect(brasiliaDateKey(Date.parse("2026-09-14T02:59:59Z"))).toBe("2026-09-13");
    expect(brasiliaDateKey(Date.parse("2026-09-14T03:00:00Z"))).toBe("2026-09-14");
  });
});
```

Extend settings tests in the same file or a new `settings.test.ts` to load an old `{ autoSell: false }` payload and assert all new fields receive safe defaults while `autoSell` remains false.

Create `src/update-contract.test.ts` to read metadata sources and assert:

```ts
expect(source).toContain("@namespace baiakidle-helper");
expect(source).toContain("releases/latest/download/baiakidle-helper.user.js");
expect(settingsSource).toContain('STORAGE_KEY = "baiakidle-helper-v1"');
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```powershell
npm run test:unit -- src/data/bosses.test.ts src/update-contract.test.ts
```

Expected: FAIL because the boss catalog APIs and settings fields do not exist.

- [ ] **Step 3: Copy and wrap the catalog**

Copy the JSON catalog exactly, then expose:

```ts
export type BossEntry = {
  id: string;
  name: string;
  minLevel: number;
  bossKey: string;
  rarity: "bane" | "archfoe" | "nemesis" | string;
  summons: string[];
};

export const BOSSES: readonly BossEntry[];
export function bossById(id: string | null | undefined): BossEntry | undefined;
export function normalizeBossQueue(value: unknown): string[];
export function brasiliaDateKey(now?: number): string;
```

Use `Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" })` and format parts explicitly so the result is always `YYYY-MM-DD`.

- [ ] **Step 4: Add settings fields and validation**

Add:

```ts
export type AutoBossResult = "win" | "lose";

autoBoss: boolean;
autoBossOnReset: boolean;
autoBossIds: string[];
autoBossIndex: number;
autoBossDay: string;
autoBossStartedAt: number;
autoBossFighting: string;
autoBossKillsAtEnter: number;
autoBossLeftAt: number;
autoBossLastId: string;
autoBossLastResult: "" | AutoBossResult;
autoBossResults: Record<string, AutoBossResult>;
```

Defaults are off/empty/zero. `loadSettings()` must call `normalizeBossQueue`, clamp the cursor to a non-negative integer, accept only `win`/`lose` result values, and preserve the existing `STORAGE_KEY` unchanged.

- [ ] **Step 5: Run focused tests and typecheck**

Run:

```powershell
npm run test:unit -- src/data/bosses.test.ts src/update-contract.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit catalog and persistence**

```powershell
git add src/data/boss-catalog.json src/data/bosses.ts src/data/bosses.test.ts src/automation/settings.ts src/update-contract.test.ts
git commit -m "feat: persist custom auto boss queues"
```

---

### Task 3: Build the extension-owned Auto Boss controller with TDD

**Files:**
- Create: `src/automation/auto-boss.ts`
- Create: `src/automation/auto-boss.test.ts`

**Interfaces:**
- Consumes: `Settings`, `BossRoomSnapshot`, `bossById()`, `brasiliaDateKey()`.
- Produces: `AutoBossRunner`, `AutoBossPhase`, `AutoBossView`, `maybeStartAtMidnight()`, and `autoBossClaimsNavigation()`.

- [ ] **Step 1: Write failing pure-decision tests**

Use a complete settings fixture and snapshot fixture. Cover these exact cases:

```ts
test("midnight first tick records today without starting", () => {
  expect(maybeStartAtMidnight({ ...settings, autoBoss: false, autoBossDay: "" }, snapshot, now))
    .toEqual({ autoBossDay: brasiliaDateKey(now) });
});

test("midnight waits below 90 minutes without consuming the day", () => {
  expect(maybeStartAtMidnight(
    { ...settings, autoBoss: false, autoBossDay: "2026-09-12" },
    { ...snapshot, staminaMinutes: 89 },
    now
  )).toBeNull();
});

test("midnight starts at 90 minutes", () => {
  expect(maybeStartAtMidnight(
    { ...settings, autoBoss: false, autoBossDay: "2026-09-12" },
    { ...snapshot, staminaMinutes: 90 },
    now
  )).toMatchObject({ autoBoss: true, autoBossIndex: 0, autoBossDay: brasiliaDateKey(now) });
});
```

Add the two guard assertions:

```ts
expect(maybeStartAtMidnight(
  { ...settings, autoBossDay: "2026-09-12" },
  undefined,
  now
)).toBeNull();
expect(maybeStartAtMidnight(
  { ...settings, autoBossDay: "2026-09-12", autoBossIds: [] },
  snapshot,
  now
)).toBeNull();
```

- [ ] **Step 2: Run the pure tests to verify failure**

Run:

```powershell
npm run test:unit -- src/automation/auto-boss.test.ts
```

Expected: FAIL because `auto-boss.ts` does not exist.

- [ ] **Step 3: Implement date/start helpers minimally**

Expose:

```ts
export function maybeStartAtMidnight(
  settings: Settings,
  snapshot: BossRoomSnapshot | undefined,
  now?: number
): Partial<Settings> | null;
```

The start patch must reset cursor, start timestamp, fighting ID, kills-at-enter, left-at, last result, and result map.

- [ ] **Step 4: Write failing runner tests**

Create injected spies and one fresh runner per test:

```ts
let sent: Array<{ bossId: string; fromCity: boolean }>;
let persisted: Settings[];

beforeEach(() => {
  sent = [];
  persisted = [];
});

const persist = (next: Settings) => persisted.push(next);
const createRunner = () => new AutoBossRunner({
  sendBoss: (bossId, fromCity) => (sent.push({ bossId, fromCity }), true),
  sendCityPresence: () => true
});
```

Add the following table-driven wait/skip coverage:

```ts
test.each([
  ["low stamina", { staminaMinutes: 89, bossChargesLeft: 20 }, "waiting-stamina"],
  ["no charges", { staminaMinutes: 90, bossChargesLeft: 0 }, "waiting-charges"]
])("waits for %s without disabling", (_name, patch, phase) => {
  const runner = createRunner();
  const persisted: Settings[] = [];
  runner.tick(settings, { ...snapshot, ...patch }, next => persisted.push(next), now);
  expect(runner.view(settings, { ...snapshot, ...patch }).phase).toBe(phase);
  expect(sent).toEqual([]);
  expect(persisted.every(next => next.autoBoss)).toBe(true);
});

test("skips level and cooldown then sends one eligible boss", () => {
  const runner = createRunner();
  runner.tick(
    { ...settings, autoBossIds: ["bakragore", "shadowpelt", "bloodback"] },
    { ...snapshot, level: 80, bossCooldowns: { shadowpelt: now + 60_000 } },
    persist,
    now
  );
  expect(sent).toEqual([{ bossId: "bloodback", fromCity: true }]);
  runner.tick(settings, snapshot, persist, now + 5_999);
  expect(sent).toHaveLength(1);
});

test("records a delayed win and advances", () => {
  const runner = createRunner();
  const fighting = {
    ...settings,
    autoBossFighting: "shadowpelt",
    autoBossKillsAtEnter: 2,
    autoBossIndex: 0
  };
  runner.tick(fighting, { ...snapshot, mode: "city", activeBossId: "", bossKills: { shadowpelt: 3 } }, persist, now);
  expect(persisted.at(-1)).toMatchObject({
    autoBossIndex: 1,
    autoBossLastId: "shadowpelt",
    autoBossLastResult: "win"
  });
});

test("waits four seconds before classifying a non-kill as loss", () => {
  const runner = createRunner();
  const fighting = {
    ...settings,
    autoBossFighting: "shadowpelt",
    autoBossKillsAtEnter: 2,
    autoBossLeftAt: now
  };
  runner.tick(fighting, { ...snapshot, activeBossId: "", bossKills: { shadowpelt: 2 } }, persist, now + 3_999);
  expect(persisted.at(-1)?.autoBossLastResult).not.toBe("lose");
  runner.tick(fighting, { ...snapshot, activeBossId: "", bossKills: { shadowpelt: 2 } }, persist, now + 4_000);
  expect(persisted.at(-1)?.autoBossLastResult).toBe("lose");
});
```

Then add explicit state-transition tests for:

- waits with stamina `89` and remains enabled;
- waits with zero charges and remains enabled;
- skips a boss above level;
- skips a boss whose cooldown timestamp is greater than `now`;
- sends once for the first eligible boss and does not duplicate within six seconds;
- recognizes entry from `activeBossId` and records kills-at-enter;
- advances with `win` after the bestiary count increases;
- records immediate `lose` on death;
- waits four seconds before recording `lose` without a kill;
- restores a persisted fight and `autoBossLeftAt` after reload;
- when stopped during a fight, records the result but sends no next boss;
- stops and resets cursor when the final item finishes.

- [ ] **Step 5: Implement `AutoBossRunner`**

Use these stable interfaces:

```ts
export type AutoBossPhase =
  | "stopped"
  | "waiting-state"
  | "waiting-stamina"
  | "waiting-charges"
  | "selecting"
  | "entering"
  | "fighting"
  | "confirming-result"
  | "completed";

export type AutoBossView = {
  phase: AutoBossPhase;
  currentId: string;
  index: number;
  total: number;
  chargesLeft: number | null;
  chargesMax: number | null;
  staminaMinutes: number | null;
  results: Record<string, AutoBossResult>;
};

export class AutoBossRunner {
  constructor(deps: {
    sendBoss: (bossId: string, fromCity: boolean) => boolean;
    sendCityPresence: (away: boolean) => boolean;
  });
  tick(
    settings: Settings,
    snapshot: BossRoomSnapshot | undefined,
    persist: (next: Settings) => void,
    now?: number
  ): boolean;
  view(settings: Settings, snapshot: BossRoomSnapshot | undefined): AutoBossView;
  isNavigating(): boolean;
}

export function autoBossClaimsNavigation(
  settings: Settings,
  runner: AutoBossRunner
): boolean;
```

`tick()` returns whether it changed persisted state or sent a command. Keep only `enteringTarget`, `lastEnterAt`, and an in-flight guard as ephemeral fields. Everything required across reloads belongs to `Settings`.

When persisting a result, write both canonical `id` and `bossKey` keys, matching Leviticus desktop behavior.

- [ ] **Step 6: Run controller tests and typecheck**

Run:

```powershell
npm run test:unit -- src/automation/auto-boss.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit the custom controller**

```powershell
git add src/automation/auto-boss.ts src/automation/auto-boss.test.ts
git commit -m "feat: add extension-owned auto boss controller"
```

---

### Task 4: Integrate manual boss transport and scheduler priority

**Files:**
- Modify: `src/packets.ts`
- Modify: `src/automation/scheduler.ts`
- Modify: `src/control.tsx`
- Create: `src/forbidden-native-auto-boss.test.ts`

**Interfaces:**
- Consumes: `bossPacket()`, `cityPresencePacket()`, `sendRawPacket()`, `readBossRoomSnapshot()`, and `AutoBossRunner`.
- Produces: one singleton runner started with the scheduler and `readAutoBossView(settings)` for the React panel.

- [ ] **Step 1: Write failing packet and source-policy tests**

Add packet assertions to `auto-boss.test.ts` or a focused packet test:

```ts
expect(roomMessageType(bossPacket("shadowpelt", true))).toBe("boss");
expect(decodedRecord(bossPacket("shadowpelt", true))).toEqual({
  bossId: "shadowpelt",
  fromCity: true
});
```

Create `src/forbidden-native-auto-boss.test.ts`. Build forbidden values from fragments so the test file itself does not contain a banned contract contiguously:

```ts
const forbidden = ["auto" + "boss", "auto" + "bosslist", "auto" + "bosspreset", "auto" + "bossstate"];
const files = productionTsFiles().filter(path => !path.endsWith("forbidden-native-auto-boss.test.ts"));
for (const file of files) {
  const source = readFileSync(file, "utf8").toLowerCase();
  for (const contract of forbidden) expect(source).not.toContain(`\"${contract}\"`);
}
```

The scan permits camelCase local identifiers such as `autoBoss`; it forbids quoted wire-message contracts.

- [ ] **Step 2: Run tests to verify failure**

Run:

```powershell
npm run test:unit -- src/automation/auto-boss.test.ts src/forbidden-native-auto-boss.test.ts
```

Expected: FAIL because `bossPacket()` and integration do not exist.

- [ ] **Step 3: Add only the manual boss packet**

In `src/packets.ts`:

```ts
export function bossPacket(bossId: string, fromCity: boolean): string {
  return packRoomRecord(
    "boss",
    ["bossId", "fromCity"],
    [packStr(bossId), packBool(fromCity)]
  );
}
```

Do not add packet builders for any native Auto Boss command.

- [ ] **Step 4: Integrate scheduler ordering**

Change `SchedulerApi` to accept `persist: (next: Settings) => void`. Create one module-level `AutoBossRunner` whose send functions call `sendRawPacket()` with `cityPresencePacket(false)` and `bossPacket()`.

At each tick:

1. read settings and room snapshot;
2. apply `maybeStartAtMidnight()` through `persist`;
3. tick the custom runner;
4. compute `bossOwnsNavigation = autoBossClaimsNavigation(settings, runner)`;
5. run stamina routing and Auto Hunt only when false;
6. include `runner.isNavigating()` in the existing `navBusy` calculation.

Export:

```ts
export function readAutoBossView(settings: Settings): AutoBossView;
```

Call `startRoomStateMirror()` once before `startScheduler()` in `control.tsx`, and pass the existing `persist` function into the scheduler API.

- [ ] **Step 5: Run policy, controller, legacy checks, and typecheck**

Run:

```powershell
npm run test:unit -- src/automation/auto-boss.test.ts src/forbidden-native-auto-boss.test.ts
npm test
npm run typecheck
```

Expected: PASS, including the existing rate/catalog smoke script.

- [ ] **Step 6: Commit transport and scheduler integration**

```powershell
git add src/packets.ts src/automation/scheduler.ts src/control.tsx src/forbidden-native-auto-boss.test.ts
git commit -m "feat: integrate custom auto boss scheduling"
```

---

### Task 5: Build the Auto Boss queue interface

**Files:**
- Create: `src/components/AutoBossPanel.tsx`
- Create: `src/components/AutoBossPanel.test.tsx`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src/control.tsx`
- Modify: `src/control.css`

**Interfaces:**
- Consumes: `Settings`, `BOSSES`, `AutoBossView`, and the parent's `persist(next)` callback.
- Produces: `AutoBossPanel` and the production “Auto Boss” panel view.

- [ ] **Step 1: Add DOM test support and write failing interaction tests**

Run:

```powershell
npm install --save-dev @testing-library/react@16.3.0 @testing-library/user-event@14.6.1 jsdom@26.1.0
```

Create `src/components/AutoBossPanel.test.tsx` with `// @vitest-environment jsdom`. Use real user interactions:

```tsx
const onChange = vi.fn();
render(<AutoBossPanel settings={settings} status={status} onChange={onChange} />);
const user = userEvent.setup();

await user.type(screen.getByRole("searchbox", { name: /buscar boss/i }), "shadow");
expect(screen.getByText("Shadowpelt")).toBeVisible();
expect(screen.queryByText("Bloodback")).toBeNull();

await user.click(screen.getByRole("button", { name: /adicionar shadowpelt/i }));
expect(onChange).toHaveBeenLastCalledWith(
  expect.objectContaining({ autoBossIds: ["shadowpelt"] })
);
```

Reset the render for each scenario and add assertions that:

- searching “shadow” leaves Shadowpelt visible and unrelated bosses hidden;
- `Adicionar` appends an ID once;
- `Remover` deletes it;
- `Subir`/`Descer` reorder the persisted IDs;
- `Iniciar` writes a clean cycle patch;
- `Parar` turns only `autoBoss` off and preserves `autoBossFighting` until the runner classifies the current fight;
- the midnight toggle writes `autoBossOnReset` and today's Brasília key on first activation;
- queue controls are keyboard-addressable and have accessible names;
- no preset/preparation controls are rendered.

- [ ] **Step 2: Run the component test to verify failure**

Run:

```powershell
npm run test:unit -- src/components/AutoBossPanel.test.tsx
```

Expected: FAIL because `AutoBossPanel.tsx` does not exist.

- [ ] **Step 3: Implement the panel as a focused component**

Use:

```ts
export type AutoBossPanelProps = {
  settings: Settings;
  status: AutoBossView;
  onChange: (next: Settings) => void;
};

export function AutoBossPanel(props: AutoBossPanelProps): React.JSX.Element;
```

Maintain search and drag target as component-local UI state. Persist only queue/settings changes. Disable queue editing while a cycle is active, but keep `Parar` available. Provide explicit up/down controls even when drag-and-drop is supported.

Status copy mapping:

- `waiting-state` → “Aguardando estado do jogo”;
- `waiting-stamina` → “Aguardando stamina 1h30” plus current stamina;
- `waiting-charges` → “Aguardando cargas”;
- `entering` → “Entrando em {boss}”;
- `fighting` → “Enfrentando {boss}”;
- `confirming-result` → “Confirmando resultado”;
- `completed` → “Lista concluída”;
- `stopped` → next boss or “Monte sua lista”.

- [ ] **Step 4: Mount the new view in `control.tsx`**

Change `View` to `"automation" | "bosses" | "development"`. Always render Automação and Auto Boss navigation; append Desenvolvimento only in dev. Poll `readAutoBossView(value)` alongside connection state so status/progress update without coupling the runner to React.

- [ ] **Step 5: Add responsive queue styles**

Add scoped classes under `#baiakidle-control-panel` for:

- two-column pool/queue layout above 560 px;
- stacked columns below 560 px;
- 44 px minimum touch targets on reorder/remove controls;
- violet current-row state, green win state, muted red lose state, cyan live status;
- reduced-motion removal of entry/drag transitions;
- visible `:focus-visible` outlines.

- [ ] **Step 6: Run component tests, full tests, and typecheck**

Run:

```powershell
npm run test:unit -- src/components/AutoBossPanel.test.tsx
npm test
npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit the queue interface**

```powershell
git add package.json package-lock.json src/components/AutoBossPanel.tsx src/components/AutoBossPanel.test.tsx src/control.tsx src/control.css
git commit -m "feat: add custom auto boss queue interface"
```

---

### Task 6: Rebrand public identity without breaking updater contracts

**Files:**
- Create: `src/components/LeviticusMark.tsx`
- Modify: `src/control.tsx`
- Modify: `src/socket.ts`
- Modify: `scripts/add-userscript-banner.mjs`
- Modify: `scripts/dev.mjs`
- Modify: `vite.config.ts`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src/update-contract.test.ts`

**Interfaces:**
- Consumes: updater constraints from the spec.
- Produces: visible “Leviticus Extension” identity while legacy technical identifiers remain stable.

- [ ] **Step 1: Extend failing identity/compatibility tests**

Assert:

```ts
expect(bannerSource).toContain("@name Leviticus Extension");
expect(bannerSource).toContain("@name Leviticus Extension DEV");
expect(packageJson.name).toBe("leviticus-extension");
expect(packageJson.description).toContain("Leviticus Extension");
expect(viteSource).toContain('name: "LeviticusExtension"');
```

Keep the existing assertions for namespace, GitHub URL, release filename, storage key, served dev filename, and production output filename.

- [ ] **Step 2: Run the contract test to verify failure**

Run:

```powershell
npm run test:unit -- src/update-contract.test.ts
```

Expected: FAIL on public identity assertions only.

- [ ] **Step 3: Add the inline Leviticus mark**

Translate `C:\Users\ak\Desktop\leviticus-bot\public\leviticus-mark.svg` into a React component with `viewBox="0 0 512 512"`, `fill="currentColor"`, `aria-hidden="true"`, and the original single path. Do not fetch the SVG at runtime.

- [ ] **Step 4: Rename safe public identity**

Apply “Leviticus Extension” to:

- userscript production/dev `@name` and descriptions;
- package name/description and root lockfile package name;
- Vite global library name;
- panel heading, accessible labels, tab visible label, support copy, and console prefixes;
- dev server display log.

Retain the compatibility strings locked by `src/update-contract.test.ts`.

- [ ] **Step 5: Run identity tests and inspect the diff for accidental contract changes**

Run:

```powershell
npm run test:unit -- src/update-contract.test.ts src/forbidden-native-auto-boss.test.ts
git diff -- scripts/add-userscript-banner.mjs scripts/dev.mjs vite.config.ts package.json package-lock.json src/control.tsx src/socket.ts
```

Expected: tests PASS; updater URL, artifact names, namespace, storage key, local bridge branch, and dev URL remain unchanged.

- [ ] **Step 6: Commit the safe rename**

Stage all files except `src/socket.ts`, then interactively stage only the console-prefix rename from that file. Keep `localBridge` unstaged:

```powershell
git add src/components/LeviticusMark.tsx src/control.tsx scripts/add-userscript-banner.mjs scripts/dev.mjs vite.config.ts package.json package-lock.json src/update-contract.test.ts
git add -p src/socket.ts
git diff --cached -- src/socket.ts
git commit -m "refactor: rename public identity to Leviticus Extension"
```

Expected cached socket diff: public console-prefix changes only.

---

### Task 7: Replace the panel's visual system with the Leviticus identity

**Files:**
- Modify: `src/control.css`
- Modify: `src/control.tsx`
- Modify: `src/components/AutoBossPanel.tsx`

**Interfaces:**
- Consumes: the approved site tokens and `LeviticusMark`.
- Produces: a compact, responsive Operate-mode panel consistent with `C:\Users\ak\Desktop\leviticus-bot`.

- [ ] **Step 1: Capture the incumbent visual truth and establish tokens**

At the top of the panel scope define:

```css
#baiakidle-control-panel {
  --lev-void: #050609;
  --lev-surface: #0f1118;
  --lev-surface-2: #151823;
  --lev-surface-3: #1b1f2c;
  --lev-ink: #f5f6fa;
  --lev-soft: #c5cad5;
  --lev-muted: #8992a4;
  --lev-line: rgba(229, 235, 255, .12);
  --lev-line-strong: rgba(229, 235, 255, .2);
  --lev-violet: #8d78ff;
  --lev-violet-bright: #b4a7ff;
  --lev-violet-dim: rgba(141, 120, 255, .15);
  --lev-cyan: #5ed9ff;
  --lev-green: #63dfae;
  --lev-orange: #ffb865;
}
```

- [ ] **Step 2: Replace gold/medieval styling in one coherent pass**

Restyle header, navigation, rows, switches, inputs, slider, support footer, development view, and Auto Boss queue to use:

- near-black layered surfaces;
- translucent cool-white boundaries;
- violet for selection/action/focus;
- cyan for connected/live state;
- green for success;
- orange for waiting;
- Manrope/Segoe UI fallback stack;
- 8–12 px radii according to hierarchy, not one radius everywhere.

Remove Palatino/small-caps, diamond icon chrome, gold gradients, and decorative grain dependence from the extension panel. Keep the surrounding game untouched through ID scoping.

- [ ] **Step 3: Make the memorable element the mark/status header**

Use the Leviticus mark in a restrained violet badge, pair it with “Leviticus Extension”, and place the connection/runtime indicator on the opposite side. Keep setting rows quiet and information-dense so the header is the sole expressive accent.

- [ ] **Step 4: Verify keyboard, narrow layout, and reduced motion**

Check these cases in the dev userscript or a local mocked game shell:

- 420 px panel with no horizontal overflow;
- 320 px viewport with stacked Auto Boss pool/queue;
- Tab traversal reaches view tabs, search, add/reorder/remove, start/stop, midnight toggle, and support link;
- all focused controls show a violet outline;
- reduced motion disables panel entrance and drag transitions.

Record defects in one batch, apply one correction batch, and perform one confirmation pass.

- [ ] **Step 5: Run automated checks and build**

Run:

```powershell
npm test
npm run typecheck
npm run build
```

Expected: PASS and `dist/baiakidle-helper.user.js` is generated.

- [ ] **Step 6: Commit the visual redesign**

```powershell
git add src/control.css src/control.tsx src/components/AutoBossPanel.tsx
git commit -m "style: align extension panel with Leviticus"
```

---

### Task 8: Update documentation and perform release-level verification

**Files:**
- Modify: `README.md`
- Verify: `dist/baiakidle-helper.user.js` (generated, ignored)
- Verify: all files changed since `0f81918`

**Interfaces:**
- Consumes: completed implementation and generated userscript.
- Produces: user-facing documentation and verification evidence.

- [ ] **Step 1: Rewrite README public identity and behavior**

Update the title and prose to “Leviticus Extension”. Document:

- independent custom Auto Boss queue;
- manual start/stop;
- Brasília 00h start, 90-minute stamina wait, cooldown/level skip, and charge wait;
- explicit absence of presets/preparation;
- preserved `baiakidle-helper.user.js` download URL as a compatibility detail;
- unchanged installation/update steps;
- new source files in the structure tree.

Do not rename GitHub links or release assets.

- [ ] **Step 2: Run the complete verification suite**

Run:

```powershell
npm test
npm run typecheck
npm run build
```

Expected: all commands exit 0.

- [ ] **Step 3: Inspect generated userscript contracts**

Run:

```powershell
Get-Content dist\baiakidle-helper.user.js -TotalCount 20
rg -n 'Leviticus Extension|@namespace|@updateURL|@downloadURL' dist\baiakidle-helper.user.js
rg -n '"autoboss"|"autobosslist"|"autobosspreset"|"autobossstate"' dist\baiakidle-helper.user.js
```

Expected:

- visible name is Leviticus Extension;
- namespace is `baiakidle-helper`;
- update/download URLs still end in `baiakidle-helper.user.js`;
- the forbidden-contract search returns no matches.

- [ ] **Step 4: Verify rename coverage and preserve user work**

Run:

```powershell
rg -n -i "BaiakIdle Helper" README.md package.json scripts src vite.config.ts
git diff 0f81918 -- src/socket.ts
git status --short
```

Expected:

- no old public brand remains except deliberate compatibility identifiers and explanatory history;
- the preexisting `localBridge` bypass remains present;
- unrelated files `DISCORD_ANUNCIO_pos_1.1.0.md`, `_probe_401.py`, and `_probe_sess.py` remain untouched/untracked.

- [ ] **Step 5: Commit docs and final corrections**

```powershell
git add README.md
git commit -m "docs: document Leviticus Extension auto boss"
```

- [ ] **Step 6: Review the implementation range**

Run:

```powershell
git log --oneline 0f81918..HEAD
git diff --stat 0f81918..HEAD
git status --short
```

Expected: only planned implementation commits plus the user's preexisting working-tree files; no generated `dist/` files are staged.
