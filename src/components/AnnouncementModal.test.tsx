/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { consumeAnnouncement, shouldShowAnnouncement, markAnnouncementSeen } from "../automation/announcement";
import { AnnouncementModal } from "./AnnouncementModal";

describe("AnnouncementModal", () => {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  test("presents the Leviticus rebrand with site and Discord actions", () => {
    const onClose = vi.fn();
    render(<AnnouncementModal onClose={onClose} />);

    expect(screen.getByRole("dialog", { name: "Leviticus Extension" })).toBeTruthy();
    expect(screen.getByTestId("lev-announcement-brand-strip")).toBeTruthy();
    expect(screen.getByRole("img", { name: "BaiakIdle" }).getAttribute("src"))
      .toBe("./brand/icon-gold.svg");
    expect(screen.getByTestId("lev-announcement-leviticus-mark")).toBeTruthy();
    expect(screen.getByText(/O Baiakidle Helper agora se chama Leviticus Extension/)).toBeTruthy();
    expect(screen.getByText(/conhecer os bots do BaiakIdle e do Huntera/)).toBeTruthy();
    const siteLink = screen.getByRole("link", { name: /conhecer o site/i });
    const discordLink = screen.getByRole("link", { name: /entrar no discord/i });
    expect(siteLink.getAttribute("href")).toBe("https://leviticusbot.com");
    expect(discordLink.getAttribute("href")).toBe("https://discord.leviticusbot.com");
    expect(siteLink.querySelector("svg")).toBeTruthy();
    expect(discordLink.querySelector("svg")).toBeTruthy();
  });

  test("closes through the modal controls", () => {
    const onClose = vi.fn();
    render(<AnnouncementModal onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: /fechar/i }));
    fireEvent.click(screen.getByRole("link", { name: /entrar no discord/i }));

    expect(onClose).toHaveBeenCalledTimes(2);
  });

  test("shows once per extension version", () => {
    const storage = window.localStorage;

    expect(shouldShowAnnouncement(storage, "1.2.0")).toBe(true);
    expect(consumeAnnouncement(storage, "1.2.0")).toBe(true);
    expect(consumeAnnouncement(storage, "1.2.0")).toBe(false);
    markAnnouncementSeen(storage, "1.2.0");
    expect(shouldShowAnnouncement(storage, "1.2.0")).toBe(false);
    expect(shouldShowAnnouncement(storage, "1.2.1")).toBe(true);
  });
});
