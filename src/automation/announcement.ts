export const ANNOUNCEMENT_HIDDEN_KEY = "leviticus-extension-announcement-hidden";

/** Aparece em toda abertura do /jogar até o jogador pedir "não mostrar novamente". */
export function shouldShowAnnouncement(storage: Storage | null | undefined): boolean {
  if (!storage) return true;
  try {
    return storage.getItem(ANNOUNCEMENT_HIDDEN_KEY) !== "1";
  } catch {
    return true;
  }
}

export function hideAnnouncementForever(storage: Storage | null | undefined): void {
  try {
    storage?.setItem(ANNOUNCEMENT_HIDDEN_KEY, "1");
  } catch {
    // Private browsing or a restricted storage area should not block the menu.
  }
}
