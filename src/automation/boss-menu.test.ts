/** @vitest-environment jsdom */
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  LEVITICUS_BOSS_HOST_ID,
  LEVITICUS_BOSS_PANE_ID,
  LEVITICUS_BOSS_STATE_ID,
  LEVITICUS_BOSS_TAB_ID,
  startBossMenuObserver
} from "./boss-menu";

function renderBossModal(className = ""): void {
  document.body.innerHTML = [
    '<div id="wave-hdr">',
    '  <span id="wave-title">Infernal Demon</span>',
    '</div>',
    '<div id="boss-modal" class="' + className + '">',
    '  <div id="boss-modal-body">',
    '    <div class="sp-body">',
    '      <div class="sp-cats">',
    '        <button class="sp-cat" type="button">Bosses</button>',
    '        <button class="sp-cat" type="button">Auto Boss</button>',
    '      </div>',
    '      <div class="boss-panes">',
    '        <div class="boss-pane boss-pane-list">Native Boss List</div>',
    '        <div class="boss-pane boss-pane-auto">Native Auto Boss</div>',
    '      </div>',
    '    </div>',
    '  </div>',
    '</div>'
  ].join("");
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("startBossMenuObserver", () => {
  test("creates an extension-owned tab, pane, panel host, and wave state host", () => {
    renderBossModal();
    const onHostChange = vi.fn();
    const observer = startBossMenuObserver(document, () => true, onHostChange);

    const tab = document.getElementById(LEVITICUS_BOSS_TAB_ID);
    const pane = document.getElementById(LEVITICUS_BOSS_PANE_ID);
    const panelHost = document.getElementById(LEVITICUS_BOSS_HOST_ID);
    const stateHost = document.getElementById(LEVITICUS_BOSS_STATE_ID);

    expect(tab?.textContent).toBe("Leviticus");
    expect(tab?.classList.contains("sp-cat")).toBe(true);
    expect(tab?.getAttribute("aria-controls")).toBe(LEVITICUS_BOSS_PANE_ID);
    expect(pane?.classList.contains("boss-pane")).toBe(true);
    expect(pane?.classList.contains("boss-pane-leviticus")).toBe(true);
    expect(panelHost?.parentElement).toBe(pane);
    expect(stateHost?.parentElement?.id).toBe("wave-hdr");
    expect(onHostChange).toHaveBeenLastCalledWith({ panel: panelHost, state: stateHost });

    observer.disconnect();
  });

  test("does not mount into or alter the native Auto Boss pane", () => {
    renderBossModal();
    const nativePane = document.querySelector(".boss-pane-auto");
    const nativeMarkup = nativePane?.outerHTML;
    const nativeTab = [...document.querySelectorAll(".sp-cat")]
      .find(element => element.textContent?.trim() === "Auto Boss");
    const nativeTabMarkup = nativeTab?.outerHTML;

    const observer = startBossMenuObserver(document, () => true, vi.fn());

    expect(nativePane?.outerHTML).toBe(nativeMarkup);
    expect(nativeTab?.outerHTML).toBe(nativeTabMarkup);
    expect(nativePane?.querySelector("#" + LEVITICUS_BOSS_HOST_ID)).toBeNull();
    observer.disconnect();
  });

  test("activates only the Leviticus tab and pane when clicked", () => {
    renderBossModal();
    const observer = startBossMenuObserver(document, () => true, vi.fn());
    const tab = document.getElementById(LEVITICUS_BOSS_TAB_ID);
    const pane = document.getElementById(LEVITICUS_BOSS_PANE_ID);

    tab?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(tab?.classList.contains("active")).toBe(true);
    expect(pane?.classList.contains("active")).toBe(true);
    expect(pane?.getAttribute("aria-hidden")).toBe("false");
    observer.disconnect();
  });

  test("removes only extension nodes when rendering is disabled", () => {
    renderBossModal();
    let enabled = true;
    const onHostChange = vi.fn();
    const observer = startBossMenuObserver(document, () => enabled, onHostChange);

    enabled = false;
    observer.sync();

    expect(document.getElementById(LEVITICUS_BOSS_TAB_ID)).toBeNull();
    expect(document.getElementById(LEVITICUS_BOSS_PANE_ID)).toBeNull();
    expect(document.getElementById(LEVITICUS_BOSS_STATE_ID)).toBeNull();
    expect(document.querySelector(".boss-pane-auto")?.textContent).toBe("Native Auto Boss");
    expect(onHostChange).toHaveBeenLastCalledWith({ panel: null, state: null });
    observer.disconnect();
  });

  test("keeps the wave state host when the modal closes", () => {
    renderBossModal();
    const onHostChange = vi.fn();
    const observer = startBossMenuObserver(document, () => true, onHostChange);
    const modal = document.querySelector("#boss-modal");

    modal?.classList.add("hidden");
    observer.sync();

    expect(document.getElementById(LEVITICUS_BOSS_TAB_ID)).toBeNull();
    expect(document.getElementById(LEVITICUS_BOSS_PANE_ID)).toBeNull();
    expect(document.getElementById(LEVITICUS_BOSS_STATE_ID)).not.toBeNull();
    expect(onHostChange).toHaveBeenLastCalledWith({ panel: null, state: expect.any(HTMLElement) });
    observer.disconnect();
  });

  test("recreates extension nodes after the native modal rerenders", () => {
    renderBossModal();
    const onHostChange = vi.fn();
    const observer = startBossMenuObserver(document, () => true, onHostChange);
    const categories = document.querySelector(".sp-cats");
    const panes = document.querySelector(".boss-panes");

    categories?.replaceChildren(
      Object.assign(document.createElement("button"), { className: "sp-cat", textContent: "Bosses" }),
      Object.assign(document.createElement("button"), { className: "sp-cat", textContent: "Auto Boss" })
    );
    panes?.replaceChildren(
      Object.assign(document.createElement("div"), { className: "boss-pane boss-pane-list", textContent: "Native Boss List" }),
      Object.assign(document.createElement("div"), { className: "boss-pane boss-pane-auto", textContent: "Native Auto Boss" })
    );
    observer.sync();

    expect(document.querySelectorAll("#" + LEVITICUS_BOSS_TAB_ID)).toHaveLength(1);
    expect(document.querySelectorAll("#" + LEVITICUS_BOSS_PANE_ID)).toHaveLength(1);
    expect(document.querySelector("#" + LEVITICUS_BOSS_PANE_ID + " #" + LEVITICUS_BOSS_HOST_ID)).not.toBeNull();
    expect(document.querySelector(".boss-pane-auto")?.textContent).toBe("Native Auto Boss");
    observer.disconnect();
  });
});
