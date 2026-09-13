/** @vitest-environment jsdom */
import { render } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { LeviticusTabIcon } from "./LeviticusTabIcon";

describe("LeviticusTabIcon", () => {
  test("uses the inline Leviticus SVG mark", () => {
    const { container } = render(<LeviticusTabIcon />);
    const svg = container.querySelector(".baiak-control-icon svg");

    expect(svg).not.toBeNull();
    expect(svg?.getAttribute("viewBox")).toBe("0 0 512 512");
    expect(svg?.querySelector("path")?.getAttribute("d")).toBeTruthy();
  });
});
