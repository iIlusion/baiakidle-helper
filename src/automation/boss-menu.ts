export const AUTO_BOSS_MENU_HOST_ID = "leviticus-auto-boss-menu";
export const AUTO_BOSS_TAB_HIDDEN_CLASS = "leviticus-auto-boss-tab-hidden";
export const NATIVE_AUTO_BOSS_HIDDEN_CLASS = "leviticus-native-auto-boss-hidden";

type HostChange = (host: HTMLElement | null) => void;

function isModalOpen(modal: HTMLElement): boolean {
  return !modal.hidden && !modal.classList.contains("hidden");
}

function findAutoBossTab(modal: HTMLElement): HTMLButtonElement | undefined {
  return [...modal.querySelectorAll<HTMLButtonElement>(".sp-cats .sp-cat")]
    .find(button => button.textContent?.trim() === "Auto Boss");
}

export type BossMenuObserver = {
  sync: () => void;
  disconnect: () => void;
};

/** Keeps the extension-owned panel mounted in the game's real boss modal. */
export function startBossMenuObserver(
  doc: Document,
  isEnabled: () => boolean,
  onHostChange: HostChange
): BossMenuObserver {
  let host: HTMLDivElement | null = null;
  let pane: HTMLElement | null = null;
  let observedModal: HTMLElement | null = null;
  let modalChildObserver: MutationObserver | null = null;
  let modalAttributeObserver: MutationObserver | null = null;

  const removeHost = () => {
    if (!host) return;
    host.remove();
    host = null;
    pane = null;
    onHostChange(null);
  };

  const observeModal = (modal: HTMLElement | null) => {
    if (observedModal === modal) return;
    modalChildObserver?.disconnect();
    modalAttributeObserver?.disconnect();
    modalChildObserver = null;
    modalAttributeObserver = null;
    observedModal = modal;
    if (!modal) return;

    // Descendants rerender, but their combat class churn is unrelated to this mount point.
    modalChildObserver = new MutationObserver(sync);
    modalChildObserver.observe(modal, { childList: true, subtree: true });
    modalAttributeObserver = new MutationObserver(sync);
    modalAttributeObserver.observe(modal, {
      attributes: true,
      attributeFilter: ["class", "hidden"]
    });
  };

  const sync = () => {
    const modal = doc.querySelector<HTMLElement>("#boss-modal");
    const autoPane = modal?.querySelector<HTMLElement>(".boss-pane-auto") ?? null;
    const nativePanel = autoPane?.querySelector<HTMLElement>(".boss-autoboss");
    const autoTab = modal ? findAutoBossTab(modal) : undefined;
    const enabled = isEnabled();

    observeModal(modal);

    nativePanel?.classList.add(NATIVE_AUTO_BOSS_HIDDEN_CLASS);
    autoTab?.classList.toggle(AUTO_BOSS_TAB_HIDDEN_CLASS, !enabled);

    if (!enabled || !modal || !autoPane || !isModalOpen(modal)) {
      removeHost();
      return;
    }

    if (host && (!host.isConnected || pane !== autoPane || host.parentElement !== autoPane)) {
      removeHost();
    }
    if (host) return;

    host = doc.createElement("div");
    host.id = AUTO_BOSS_MENU_HOST_ID;
    host.className = "lev-auto-boss-host";
    pane = autoPane;
    autoPane.append(host);
    onHostChange(host);
  };

  const mutationObserver = new MutationObserver(sync);
  const observationRoot = doc.body ?? doc.documentElement;
  mutationObserver.observe(observationRoot, {
    subtree: true,
    childList: true
  });
  sync();

  return {
    sync,
    disconnect: () => {
      mutationObserver.disconnect();
      modalChildObserver?.disconnect();
      modalAttributeObserver?.disconnect();
      modalChildObserver = null;
      modalAttributeObserver = null;
      observedModal = null;
      doc.querySelector<HTMLElement>(".boss-autoboss")?.classList.remove(NATIVE_AUTO_BOSS_HIDDEN_CLASS);
      doc.querySelector<HTMLElement>(`.${AUTO_BOSS_TAB_HIDDEN_CLASS}`)?.classList.remove(AUTO_BOSS_TAB_HIDDEN_CLASS);
      removeHost();
    }
  };
}
