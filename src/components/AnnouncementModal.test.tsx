/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { hideAnnouncementForever, shouldShowAnnouncement } from "../automation/announcement";
import { AnnouncementModal } from "./AnnouncementModal";

describe("AnnouncementModal", () => {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  test("announces Leviticus Cloud with plans, trial and campaign site link", () => {
    render(<AnnouncementModal onClose={vi.fn()} onHide={vi.fn()} />);

    expect(screen.getByRole("dialog", { name: "Leviticus Cloud" })).toBeTruthy();
    expect(screen.getByTestId("lev-announcement-leviticus-mark")).toBeTruthy();
    expect(screen.getByText(/Multi-conta num desk só/)).toBeTruthy();
    expect(screen.getByText(/Desligue o computador/)).toBeTruthy();
    expect(screen.getByText(/Controle pelo celular/)).toBeTruthy();
    const plans = screen.getByTestId("lev-announcement-plans").textContent ?? "";
    expect(plans).toContain("R$ 75");
    expect(plans).toContain("até 10 contas");
    expect(plans).toContain("R$ 99");
    expect(plans).toContain("até 20 contas");
    expect(screen.getByText(/por conta extra/).textContent).toContain("R$ 5");
    const siteLink = screen.getByRole("link", { name: /conhecer o site/i });
    const discordLink = screen.getByRole("link", { name: /entrar no discord/i });
    expect(siteLink.getAttribute("href")).toBe("https://www.leviticusbot.com/?camp=p2CBR4cb");
    expect(discordLink.getAttribute("href")).toBe("https://discord.leviticusbot.com");
  });

  test("closes through the modal controls", () => {
    const onClose = vi.fn();
    render(<AnnouncementModal onClose={onClose} onHide={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /fechar/i }));
    fireEvent.click(screen.getByRole("link", { name: /entrar no discord/i }));

    expect(onClose).toHaveBeenCalledTimes(2);
  });

  test("shows every time until the player hides it", () => {
    const storage = window.localStorage;
    const onHide = vi.fn();
    expect(shouldShowAnnouncement(storage)).toBe(true);
    expect(shouldShowAnnouncement(storage)).toBe(true);
    render(<AnnouncementModal onClose={vi.fn()} onHide={onHide} />);
    fireEvent.click(screen.getByRole("button", { name: /não mostrar novamente/i }));
    expect(onHide).toHaveBeenCalledTimes(1);
    hideAnnouncementForever(storage);
    expect(shouldShowAnnouncement(storage)).toBe(false);
  });
});
