# Leviticus Boss Tab Design

## Goal

Replace the current extension mount inside the game's native `Auto Boss` pane with an extension-owned `Leviticus` category and pane inside the real Bosses modal.

## Requirements

- The extension must not use the native `Auto Boss` category, pane, presets, state, or wire contracts.
- The extension's main menu keeps only the visibility switch for the custom tab.
- The custom tab is named `Leviticus` and is created alongside the game's Bosses categories.
- The custom pane contains exactly:
  - an available-boss list;
  - an ordered queued-boss list;
  - a start button;
  - an automatic-start-at-00:00 switch;
  - a current-state text.
- The current-state text is also mirrored into `#wave-hdr` without replacing the game's wave title.
- The existing custom runner, persistence, midnight scheduling, and normal boss packets remain the only automation path.
- Hiding the feature removes only the extension-owned tab/pane and leaves the native menu untouched.
- The Leviticus mark is rendered inline with the source SVG's group transform so its path is visible in a 512x512 viewport. Its color is always violet, including the active tab state.

## Architecture

`src/automation/boss-menu.ts` owns DOM integration only. It creates a dedicated tab and pane, attaches a small click handler for pane selection, removes stale extension nodes after native modal rerenders, and never queries or mutates the native Auto Boss pane. It also owns a dedicated state host in `#wave-hdr` for the current custom-runner summary.

`AutoBossPanel` remains the extension-owned React UI. Its embedded variant is reduced to the two lists and the two requested controls; queue changes and start actions continue to call the existing `Settings`/scheduler APIs.

The native modal remains the shell: its existing close behavior, Bosses list, and native category navigation are not replaced. The extension tab/pane uses the same visual class vocabulary where useful, but its event handling and content are extension-owned.

## Interaction model

```text
Boss modal
  [Bosses] [Leviticus] [Auto Boss native]
       |        |
       |        +--> custom pane: lists + start + 00:00 + state
       +-----------> native boss list

wave-hdr: ... | Leviticus: <current state>
```

Clicking `Leviticus` activates only the extension pane and its tab state. Clicking another category deactivates the extension pane. A native rerender causes the extension integration to recreate only its own tab/pane and restore its current active state.

## Visual direction

- The Leviticus pane follows the game's Bosses skin: native palette variables, typography, borders, controls, and spacing.
- The interaction remains Leviticus-style: a complete catalog on the left, an ordered queue on the right, compact one-boss-per-line cards, and drag-and-drop queue reordering.
- Every compact card shows the boss sprite when the game has rendered it in the native Bosses catalog; the extension copies that canvas into its own card and does not mount into the native Auto Boss pane.
- The two lists scroll independently within the existing modal, preserving the game's fixed Bosses window dimensions.
- The violet Leviticus mark remains the extension's identity in the category navigation; the pane itself stays visually native to the game.

## Tests

- DOM integration creates/removes the custom tab and pane, never mounts into `.boss-pane-auto`, and survives native rerenders.
- DOM integration mirrors the current state into `#wave-hdr` and removes it on disconnect.
- The embedded panel renders two lists and the requested controls without presets.
- The logo test verifies the inline SVG contains the source transform and 512x512 viewport.
- Existing native-boundary, runner, settings, typecheck, build, and full test checks remain green.
