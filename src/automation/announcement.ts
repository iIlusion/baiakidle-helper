export const ANNOUNCEMENT_SEEN_KEY = "leviticus-extension-announcement-seen";

export function shouldShowAnnouncement(storage: Storage | null | undefined, version: string): boolean {
  if (!storage) return true;
  try {
    return storage.getItem(ANNOUNCEMENT_SEEN_KEY) !== version;
  } catch {
    return true;
  }
}

export function markAnnouncementSeen(storage: Storage | null | undefined, version: string): void {
  try {
    storage?.setItem(ANNOUNCEMENT_SEEN_KEY, version);
  } catch {
    // Private browsing or a restricted storage area should not block the menu.
  }
}

export function consumeAnnouncement(storage: Storage | null | undefined, version: string): boolean {
  if (!shouldShowAnnouncement(storage, version)) return false;
  markAnnouncementSeen(storage, version);
  return true;
}
