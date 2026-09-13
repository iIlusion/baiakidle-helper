/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { defaults, type Settings } from "../automation/settings";
import type { AutoBossView } from "../automation/auto-boss";
import { AutoBossPanel } from "./AutoBossPanel";

const status: AutoBossView = {
  phase: "stopped",
  currentId: "",
  index: 0,
  total: 1,
  chargesLeft: 12,
  chargesMax: 20,
  staminaMinutes: 180,
  results: {}
};

function renderPanel(overrides: Partial<Settings> = {}) {
  const settings: Settings = {
    ...defaults,
    autoBossIds: ["shadowpelt"],
    ...overrides
  };
  const onChange = vi.fn<(next: Settings) => void>();
  render(<AutoBossPanel settings={settings} status={status} onChange={onChange} />);
  return { settings, onChange };
}

describe("AutoBossPanel", () => {
  afterEach(cleanup);

  test("adds a boss to the queue and exposes keyboard reorder/remove controls", () => {
    const { onChange } = renderPanel();
    fireEvent.change(screen.getByRole("searchbox", { name: /buscar boss/i }), {
      target: { value: "Bloodback" }
    });
    fireEvent.click(screen.getByRole("button", { name: /adicionar bloodback/i }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      autoBossIds: ["shadowpelt", "bloodback"]
    }));

    expect(screen.getByRole("button", { name: /subir shadowpelt/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /remover shadowpelt/i })).toBeTruthy();
  });

  test("starts, stops, and enables the daily Brasilia reset", () => {
    const { onChange } = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /iniciar auto boss/i }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ autoBoss: true, autoBossIndex: 0 }));
    fireEvent.click(screen.getByRole("switch", { name: /iniciar automaticamente às 00h/i }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ autoBossOnReset: true }));
    cleanup();
    const stopped = renderPanel({ autoBoss: true });
    fireEvent.click(screen.getByRole("button", { name: /parar auto boss/i }));
    expect(stopped.onChange).toHaveBeenLastCalledWith(expect.objectContaining({ autoBoss: false }));
  });
});
