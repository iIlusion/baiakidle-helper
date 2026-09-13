# Leviticus Boss Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans (recommended) to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Create an extension-owned Leviticus tab and pane inside the real Bosses modal, with a compact two-list Auto Boss workflow, a 00:00 toggle, a live state label in wave-hdr, and a visible violet logo.

**Architecture:** Keep AutoBossRunner, settings persistence, midnight scheduling, and normal boss packets unchanged. Replace the current DOM observer's native-pane mount with a dedicated tab/pane controller that owns only Leviticus-prefixed nodes, while AutoBossPanel remains the React owner of queue controls and portals into the extension pane.

**Tech Stack:** TypeScript, React 19, ReactDOM portals, Vitest + Testing Library, inline SVG, userscript bundle via Vite.

**Spec:** docs/superpowers/specs/2026-09-13-leviticus-boss-tab-design.md

## Global Constraints

- Never select, mount into, hide, or mutate the game's native Auto Boss pane or its controls.
- Never add native Auto Boss list, preset, state, or wire-contract strings to production automation code.
- Keep baiakidle-helper-v1 storage, updater URLs, repository identity, and artifact names unchanged.
- The main extension panel exposes only the custom-tab visibility setting for Auto Boss.
- Preserve the user's unrelated src/socket.ts changes and untracked files.

---

### Task 1: Define the extension-owned Bosses tab contract

**Files:**
- Modify: src/automation/boss-menu.ts
- Test: src/automation/boss-menu.test.ts

**Interfaces:**
- Consumes: Document, isEnabled(): boolean, and onHostChange(host: HTMLElement | null) from ControlMenu.
- Produces: startBossMenuObserver(doc, isEnabled, onHostChange): { sync(): void; disconnect(): void } that mounts a host in boss-pane-leviticus, not boss-pane-auto.

- [ ] Step 1: Write failing DOM tests

Add a fixture with boss-modal, sp-cats, boss-panes, the native Bosses list pane, and the native Auto Boss pane. Assert that sync creates exactly one button with text Leviticus, exactly one boss-pane-leviticus, and a React host inside that custom pane. Assert boss-pane-auto remains unchanged and no native Auto Boss node is hidden or used.

Add tests that disabling visibility removes only the extension button/pane, modal close removes the extension nodes, and replacing boss-panes recreates the extension nodes without duplicates.

Add a test fixture for wave-hdr; assert onStateChange receives the extension state host when the modal exists and the host is removed on disconnect.

- [ ] Step 2: Run the focused test and verify the expected RED failure

Run npm run test:unit -- src/automation/boss-menu.test.ts.

Expected: failure because the observer still exports/mounts the old native-pane host and has no custom tab/pane/state-host contract.

- [ ] Step 3: Implement the minimal custom DOM controller

Use constants such as LEVITICUS_BOSS_TAB_ID, LEVITICUS_BOSS_PANE_ID, and LEVITICUS_BOSS_STATE_ID. On each sync:

1. Find boss-modal, sp-cats, boss-panes, and wave-hdr.
2. Remove stale extension-owned nodes that are disconnected from their current container.
3. Create one button.sp-cat.leviticus-boss-tab with id, type button, aria-controls, and visible text Leviticus when enabled.
4. Create one div.boss-pane.leviticus-boss-pane with id, role tabpanel, and a child div.lev-auto-boss-host when enabled.
5. Add one span.leviticus-wave-state inside wave-hdr without replacing its existing children.
6. Attach a click handler only to the extension button. The handler toggles the extension tab/pane active classes and removes active classes from sibling category/pane nodes for visual parity; it never dispatches a native Auto Boss action.
7. Remove only extension nodes when disabled, closed, disconnected, or destroyed.

Use a body child-list observer plus modal-root attribute/child-list observers. Do not observe arbitrary descendant class attributes, preventing the combat-render loop already found in the previous implementation.

- [ ] Step 4: Run the focused test and verify GREEN

Run npm run test:unit -- src/automation/boss-menu.test.ts. Expected: all Bosses tab, isolation, rerender, visibility, and state-host tests pass.

- [ ] Step 5: Commit the isolated controller change

Run git add src/automation/boss-menu.ts src/automation/boss-menu.test.ts and git commit -m "feat: create extension-owned Leviticus boss tab".

### Task 2: Reduce the React panel to the requested two-list surface

**Files:**
- Modify: src/components/AutoBossPanel.tsx
- Test: src/components/AutoBossPanel.test.tsx

**Interfaces:**
- Consumes: Settings, AutoBossView, and the existing onChange(next: Settings) callback.
- Produces: an embedded panel with available bosses, ordered queued-boss list, manual start/stop, 00:00 toggle, and current state only.

- [ ] Step 1: Write failing component tests

Render the embedded panel with one queued boss and assert it has exactly two list regions, the Iniciar Auto Boss action, the Iniciar automaticamente às 00h switch, and a current-state text. Assert no preset/search-result configuration section or native Auto Boss controls are rendered. Assert clicking start persists autoBoss true and clicking the daily switch persists autoBossOnReset true.

- [ ] Step 2: Run the focused test and verify RED

Run npm run test:unit -- src/components/AutoBossPanel.test.tsx.

Expected: failure because the current embedded variant still renders the larger runtime/preset-style surface and uses the old labels.

- [ ] Step 3: Implement the compact panel

Keep the existing queue transformations addBoss, removeBoss, and moveBoss and the runner start payload. Render two explicit list containers: Bosses disponíveis and Fila de execução. Keep the start/stop button, daily switch, and one aria-live current-state line. Remove any controls not listed in the spec from the embedded presentation; leave the standalone component behavior compatible only where existing callers require it.

- [ ] Step 4: Run focused component tests and verify GREEN

Run npm run test:unit -- src/components/AutoBossPanel.test.tsx.

- [ ] Step 5: Commit the component change

Run git add src/components/AutoBossPanel.tsx src/components/AutoBossPanel.test.tsx and git commit -m "feat: simplify Leviticus boss controls".

### Task 3: Wire state into wave-hdr and keep the main menu as a visibility setting

**Files:**
- Modify: src/control.tsx
- Modify: src/automation/boss-menu.ts
- Test: src/automation/boss-menu.test.ts

**Interfaces:**
- Consumes: the tab/pane/state hosts from Task 1 and readAutoBossView(settings) from the scheduler.
- Produces: React portals into the extension pane and state host, plus a main-panel switch labeled Mostrar Auto Boss no menu de Boss.

- [ ] Step 1: Write failing integration assertions

Add assertions that the main extension panel contains the visibility switch but not the full Auto Boss list, and that the rendered React panel appears only inside leviticus-boss-pane. Add an assertion that the wave-hdr state host contains the current phaseLabels text.

- [ ] Step 2: Run the focused tests and verify RED

Run npm run test:unit -- src/automation/boss-menu.test.ts src/components/AutoBossPanel.test.tsx.

Expected: failure because the controller currently portals into the old host and the state is not mounted in wave-hdr.

- [ ] Step 3: Implement the wiring

Pass both the custom pane host and state host through the observer callback, or expose a single host-change object with nullable panel and state fields. Portal AutoBossPanel into the custom pane and a concise Leviticus: phase label into the wave state host. Keep the existing 750ms status refresh. The visibility switch must call only settings.autoBossVisible; it must not change autoBoss, queue order, or runner state.

- [ ] Step 4: Run focused tests and verify GREEN

Run the focused command from Step 2 and verify the new portal and state assertions pass.

- [ ] Step 5: Commit the integration change

Run git add src/control.tsx src/automation/boss-menu.ts src/automation/boss-menu.test.ts and git commit -m "feat: show custom boss state in wave header".

### Task 4: Fix the inline SVG and style the dedicated tab/pane

**Files:**
- Modify: src/components/LeviticusMark.tsx
- Modify: src/components/LeviticusTabIcon.tsx
- Modify: src/control.css
- Test: src/components/LeviticusTabIcon.test.tsx

**Interfaces:**
- Consumes: the source path and transform from src/assets/leviticus-mark.svg.
- Produces: a visible inline 512x512 mark with violet color in both inactive and active tab states.

- [ ] Step 1: Write failing SVG/style tests

Assert the rendered SVG contains viewBox 0 0 512 512, a g transform equivalent to translate(0 512) scale(.1 -.1), and the source path. Assert CSS gives baiak-control-tab.on .baiak-control-icon the same violet token as the inactive state.

- [ ] Step 2: Run the focused test and verify RED

Run npm run test:unit -- src/components/LeviticusTabIcon.test.tsx.

Expected: failure because LeviticusMark currently strips the source g transform, placing the path outside the viewport.

- [ ] Step 3: Implement the minimum SVG/style fix

Render the path inside a g transform translate(0 512) scale(.1 -.1). Use the existing inline SVG so the userscript remains self-contained. Style the new tab/pane with Leviticus violet tokens, compact two-column list layout, visible keyboard focus, mobile one-column fallback, and reduced-motion coverage.

- [ ] Step 4: Run the focused test and the Impeccable detector

Run npm run test:unit -- src/components/LeviticusTabIcon.test.tsx and node C:/Users/ak/.agents/skills/impeccable/scripts/detect.mjs --json src/components/LeviticusMark.tsx src/components/LeviticusTabIcon.tsx src/control.css.

Expected: focused tests pass and the detector reports no actionable findings.

- [ ] Step 5: Commit the visual change

Run git add src/components/LeviticusMark.tsx src/components/LeviticusTabIcon.tsx src/components/LeviticusTabIcon.test.tsx src/control.css and git commit -m "fix: render visible violet Leviticus mark".

### Task 5: Full verification and live MCP validation

**Files:**
- Verify: all changed source/tests and generated dist/baiakidle-helper.user.js

- [ ] Step 1: Run the complete verification suite

Run npm test, npm run typecheck, npm run build, and git diff --check.

Expected: all tests pass, TypeScript exits 0, Vite produces the userscript, and the diff has no whitespace errors.

- [ ] Step 2: Verify the production bundle contracts

Check that the bundle contains leviticus-boss-tab, leviticus-wave-state, the 512x512 SVG transform, and the requested Portuguese labels. Check that no native Auto Boss list/preset/state wire strings were introduced.

- [ ] Step 3: Validate through the BaiakIdle MCP server

Use only the mcp__baiakidle_page_bridge__* tools. On https://baiakidle.com/jogar/, confirm:

1. The tab icon is an inline 512x512 SVG and is violet when inactive and active.
2. The extension menu contains only the visibility setting for this feature.
3. Opening the real Bosses modal adds Leviticus as a separate tab and boss-pane-leviticus as a separate pane.
4. boss-pane-auto remains native and untouched.
5. The Leviticus pane shows exactly the two lists, start action, 00:00 switch, and current state.
6. wave-hdr shows the same state summary.

- [ ] Step 4: Report changed files, verification evidence, and preserved user files

Do not stage src/socket.ts, DISCORD_ANUNCIO_pos_1.1.0.md, _probe_401.py, or _probe_sess.py; they are pre-existing user changes.
