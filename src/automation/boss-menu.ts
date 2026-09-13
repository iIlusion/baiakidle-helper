export const LEVITICUS_BOSS_TAB_ID = "leviticus-boss-tab";
export const LEVITICUS_BOSS_PANE_ID = "leviticus-boss-pane";
export const LEVITICUS_BOSS_HOST_ID = "leviticus-auto-boss-menu";
export const LEVITICUS_BOSS_STATE_ID = "leviticus-wave-state";

const TAB_ACTIVE_CLASS = "leviticus-boss-tab-active";
const PANE_ACTIVE_CLASS = "leviticus-boss-pane-active";
const SECTION_ACTIVE_CLASS = "leviticus-section-active";

export type BossMenuHosts = {
  panel: HTMLElement | null;
  state: HTMLElement | null;
};

type HostChange = (hosts: BossMenuHosts) => void;

function isModalOpen(modal: HTMLElement): boolean {
  return !modal.hidden && !modal.classList.contains("hidden");
}

function removeNode(node: HTMLElement | null): void {
  node?.remove();
}

function createTab(doc: Document): HTMLButtonElement {
  const tab = doc.createElement("button");
  tab.id = LEVITICUS_BOSS_TAB_ID;
  tab.type = "button";
  tab.className = "sp-cat leviticus-boss-tab";
  tab.textContent = "Leviticus";
  tab.setAttribute("aria-controls", LEVITICUS_BOSS_PANE_ID);
  tab.setAttribute("aria-selected", "false");
  return tab;
}

function createPane(doc: Document): HTMLDivElement {
  const pane = doc.createElement("div");
  pane.id = LEVITICUS_BOSS_PANE_ID;
  pane.className = "boss-pane boss-pane-leviticus";
  pane.setAttribute("role", "tabpanel");
  pane.setAttribute("aria-labelledby", LEVITICUS_BOSS_TAB_ID);
  pane.setAttribute("aria-hidden", "true");
  return pane;
}

function createPanelHost(doc: Document): HTMLDivElement {
  const host = doc.createElement("div");
  host.id = LEVITICUS_BOSS_HOST_ID;
  host.className = "lev-auto-boss-host";
  return host;
}

function createStateHost(doc: Document): HTMLSpanElement {
  const host = doc.createElement("span");
  host.id = LEVITICUS_BOSS_STATE_ID;
  host.className = "leviticus-wave-state";
  host.setAttribute("role", "status");
  host.setAttribute("aria-live", "polite");
  return host;
}

export type BossMenuObserver = {
  sync: () => void;
  disconnect: () => void;
};

/** Owns only the Leviticus category, pane, panel host, and wave state label. */
export function startBossMenuObserver(
  doc: Document,
  isEnabled: () => boolean,
  onHostChange: HostChange
): BossMenuObserver {
  let tab: HTMLButtonElement | null = null;
  let pane: HTMLDivElement | null = null;
  let paneContainer: HTMLElement | null = null;
  let panelHost: HTMLDivElement | null = null;
  let stateHost: HTMLSpanElement | null = null;
  let observedModal: HTMLElement | null = null;
  let modalChildObserver: MutationObserver | null = null;
  let modalAttributeObserver: MutationObserver | null = null;
  let customActive = false;
  let nativeTabOnState = new Map<HTMLButtonElement, boolean>();
  let lastPanel: HTMLElement | null = null;
  let lastState: HTMLElement | null = null;
  let sync: () => void;

  const notify = (nextPanel: HTMLElement | null, nextState: HTMLElement | null) => {
    if (lastPanel === nextPanel && lastState === nextState) return;
    lastPanel = nextPanel;
    lastState = nextState;
    onHostChange({ panel: nextPanel, state: nextState });
  };

  const applyActiveState = () => {
    if (!tab || !pane) return;
    tab.classList.toggle(TAB_ACTIVE_CLASS, customActive);
    tab.classList.toggle("active", customActive);
    tab.classList.toggle("on", customActive);
    tab.setAttribute("aria-selected", String(customActive));
    pane.classList.toggle(PANE_ACTIVE_CLASS, customActive);
    pane.classList.toggle("active", customActive);
    pane.setAttribute("aria-hidden", String(!customActive));
    paneContainer?.classList.toggle(SECTION_ACTIVE_CLASS, customActive);
  };

  const restoreNativeTabs = () => {
    for (const [nativeTab, wasOn] of nativeTabOnState) {
      if (nativeTab.isConnected) nativeTab.classList.toggle("on", wasOn);
    }
    nativeTabOnState = new Map();
  };

  const deactivate = () => {
    restoreNativeTabs();
    customActive = false;
    applyActiveState();
  };

  const activate = (event: Event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!customActive && tab?.parentElement) {
      nativeTabOnState = new Map(
        Array.from(tab.parentElement.querySelectorAll<HTMLButtonElement>(".sp-cat:not(#" + LEVITICUS_BOSS_TAB_ID + ")"))
          .map(nativeTab => [nativeTab, nativeTab.classList.contains("on")] as const)
      );
      for (const nativeTab of nativeTabOnState.keys()) nativeTab.classList.remove("on");
    }
    customActive = true;
    applyActiveState();
  };

  const modalClick = (event: Event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest("#" + LEVITICUS_BOSS_TAB_ID)) return;
    if (target.closest(".sp-cat")) deactivate();
  };

  const removePanelNodes = () => {
    restoreNativeTabs();
    paneContainer?.classList.remove(SECTION_ACTIVE_CLASS);
    removeNode(tab);
    removeNode(pane);
    tab = null;
    pane = null;
    paneContainer = null;
    panelHost = null;
    customActive = false;
  };

  const removeStateNode = () => {
    removeNode(stateHost);
    stateHost = null;
  };

  const observeModal = (modal: HTMLElement | null) => {
    if (observedModal === modal) return;
    modalChildObserver?.disconnect();
    modalAttributeObserver?.disconnect();
    observedModal = modal;
    modalChildObserver = null;
    modalAttributeObserver = null;
    if (!modal) return;

    modal.addEventListener("click", modalClick);
    modalChildObserver = new MutationObserver(() => sync());
    modalChildObserver.observe(modal, { childList: true, subtree: true });
    modalAttributeObserver = new MutationObserver(() => sync());
    modalAttributeObserver.observe(modal, {
      attributes: true,
      attributeFilter: ["class", "hidden"]
    });
  };

  const ensureStateHost = () => {
    const waveHeader = doc.querySelector<HTMLElement>("#wave-hdr, .wave-hdr");
    if (!waveHeader || !isEnabled()) {
      removeStateNode();
      return;
    }
    const existing = waveHeader.querySelector<HTMLSpanElement>("#" + LEVITICUS_BOSS_STATE_ID);
    if (existing) {
      stateHost = existing;
      return;
    }
    stateHost = createStateHost(doc);
    waveHeader.append(stateHost);
  };

  const ensurePanelNodes = (modal: HTMLElement) => {
    const categories = modal.querySelector<HTMLElement>(".sp-cats");
    const panes = modal.querySelector<HTMLElement>(".boss-panes");
    if (!categories || !panes || !isModalOpen(modal) || !isEnabled()) {
      removePanelNodes();
      return;
    }

    const existingTab = categories.querySelector<HTMLButtonElement>("#" + LEVITICUS_BOSS_TAB_ID);
    const existingPane = panes.querySelector<HTMLDivElement>("#" + LEVITICUS_BOSS_PANE_ID);
    tab = existingTab ?? createTab(doc);
    pane = existingPane ?? createPane(doc);
    paneContainer = panes;
    if (!existingTab) categories.append(tab);
    if (!existingPane) panes.append(pane);

    const existingHost = pane.querySelector<HTMLDivElement>("#" + LEVITICUS_BOSS_HOST_ID);
    panelHost = existingHost ?? createPanelHost(doc);
    if (!existingHost) pane.append(panelHost);

    if (!tab.dataset.leviticusBound) {
      tab.addEventListener("click", activate);
      tab.dataset.leviticusBound = "true";
    }
    applyActiveState();
  };

  sync = () => {
    const modal = doc.querySelector<HTMLElement>("#boss-modal");
    observeModal(modal);
    ensureStateHost();
    if (modal) ensurePanelNodes(modal);
    else removePanelNodes();
    notify(panelHost, stateHost);
  };

  const bodyObserver = new MutationObserver(() => sync());
  const observationRoot = doc.body ?? doc.documentElement;
  bodyObserver.observe(observationRoot, { subtree: true, childList: true });
  sync();

  return {
    sync,
    disconnect: () => {
      bodyObserver.disconnect();
      modalChildObserver?.disconnect();
      modalAttributeObserver?.disconnect();
      if (observedModal) observedModal.removeEventListener("click", modalClick);
      modalChildObserver = null;
      modalAttributeObserver = null;
      observedModal = null;
      removePanelNodes();
      removeStateNode();
      notify(null, null);
    }
  };
}
