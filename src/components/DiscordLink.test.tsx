/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import { DiscordLink, LEVITICUS_DISCORD_URL } from "./DiscordLink";

describe("DiscordLink", () => {
  afterEach(cleanup);

  test("shows the Discord icon and label with the Leviticus destination", () => {
    render(<DiscordLink />);

    const link = screen.getByRole("link", { name: "Abrir Discord do Leviticus" });
    expect(link.textContent).toContain("Discord");
    expect(link.querySelector("svg")).toBeTruthy();
    expect(link.getAttribute("href")).toBe(LEVITICUS_DISCORD_URL);
  });
});
