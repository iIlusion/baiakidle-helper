/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import type { AutoBossView } from "../automation/auto-boss";
import { AutoBossWaveState } from "./AutoBossWaveState";

const status: AutoBossView = {
  phase: "fighting",
  currentId: "shadowpelt",
  index: 1,
  total: 2,
  chargesLeft: 8,
  chargesMax: 20,
  staminaMinutes: 180,
  results: {}
};

describe("AutoBossWaveState", () => {
  test("renders the custom current state for the wave header", () => {
    render(<AutoBossWaveState status={status} />);

    expect(screen.getByRole("status").textContent).toContain("Leviticus:");
    expect(screen.getByRole("status").textContent).toContain("Em combate");
    expect(screen.getByRole("status").textContent).toContain("Shadowpelt");
  });
});
