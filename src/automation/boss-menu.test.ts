/** @vitest-environment jsdom */
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  AUTO_BOSS_MENU_HOST_ID,
  AUTO_BOSS_TAB_HIDDEN_CLASS,
  NATIVE_AUTO_BOSS_HIDDEN_CLASS,
  startBossMenuObserver
} from "./boss-menu";

function renderBossModal(className = ""): void {
  document.body.innerHTML = `
    <div id="boss-modal" class="${className}">
      <div id="boss-modal-body">
        <div class="sp-body">
          <div class="sp-cats">
            <button class="sp-cat">Bosses</button>
            <button class="sp-cat">Auto Boss</button>
          </div>
          <div class="boss-panes">
            <div class="boss-pane boss-pane-list"></div>
            <div class="boss-pane boss-pane-auto">
              <div class="boss-autoboss">Native Auto Boss</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("startBossMenuObserver", () => {
  test("mounts our host only when the real boss modal is open and visible", () => {
    renderBossModal("hidden");
    const onHostChange = vi.fn();
    const observer = startBossMenuObserver(document, () => true, onHostChange);

    expect(document.getElementById(AUTO_BOSS_MENU_HOST_ID)).toBeNull();
    expect(onHostChange).not.toHaveBeenCalled();

    document.querySelector("#boss-modal")?.classList.remove("hidden");
    observer.sync();

    const host = document.getElementById(AUTO_BOSS_MENU_HOST_ID);
    expect(host).not.toBeNull();
    expect(host?.parentElement?.classList.contains("boss-pane-auto")).toBe(true);
    expect(onHostChange).toHaveBeenLastCalledWith(host);
  });

  test("hides native Auto Boss and removes our host when rendering is disabled", () => {
    renderBossModal();
    let enabled = true;
    const onHostChange = vi.fn();
    const observer = startBossMenuObserver(document, () => enabled, onHostChange);

    const tab = [...document.querySelectorAll(".sp-cat")]
      .find(element => element.textContent?.trim() === "Auto Boss");
    const native = document.querySelector(".boss-autoboss");
    expect(tab?.classList.contains(AUTO_BOSS_TAB_HIDDEN_CLASS)).toBe(false);
    expect(native?.classList.contains(NATIVE_AUTO_BOSS_HIDDEN_CLASS)).toBe(true);
    expect(document.getElementById(AUTO_BOSS_MENU_HOST_ID)).not.toBeNull();

    enabled = false;
    observer.sync();

    expect(document.getElementById(AUTO_BOSS_MENU_HOST_ID)).toBeNull();
    expect(tab?.classList.contains(AUTO_BOSS_TAB_HIDDEN_CLASS)).toBe(true);
    expect(native?.classList.contains(NATIVE_AUTO_BOSS_HIDDEN_CLASS)).toBe(true);
    expect(onHostChange).toHaveBeenLastCalledWith(null);
  });

  test("does not create duplicate hosts when the native menu rerenders", () => {
    renderBossModal();
    const onHostChange = vi.fn();
    const observer = startBossMenuObserver(document, () => true, onHostChange);
    const first = document.getElementById(AUTO_BOSS_MENU_HOST_ID);

    observer.sync();
    observer.sync();

    expect(document.querySelectorAll(`#${AUTO_BOSS_MENU_HOST_ID}`)).toHaveLength(1);
    expect(document.getElementById(AUTO_BOSS_MENU_HOST_ID)).toBe(first);
    expect(onHostChange).toHaveBeenCalledTimes(1);
  });

  test("ignores class churn from unrelated modal descendants", async () => {
    renderBossModal();
    let enabled = true;
    const onHostChange = vi.fn();
    const observer = startBossMenuObserver(document, () => enabled, onHostChange);
    await new Promise<void>(resolve => queueMicrotask(resolve));
    enabled = false;
    document.querySelector(".sp-body")?.classList.add("native-render-churn");
    await new Promise<void>(resolve => queueMicrotask(resolve));

    expect(onHostChange).toHaveBeenCalledTimes(1);
    observer.disconnect();
  });

  test("recreates the host after the native pane is replaced", () => {
    renderBossModal();
    const onHostChange = vi.fn();
    const observer = startBossMenuObserver(document, () => true, onHostChange);
    const pane = document.querySelector(".boss-pane-auto");
    pane?.replaceChildren(document.createElement("div"));

    observer.sync();

    expect(document.getElementById(AUTO_BOSS_MENU_HOST_ID)).not.toBeNull();
    expect(onHostChange).toHaveBeenCalledTimes(3);
    expect(onHostChange).toHaveBeenNthCalledWith(2, null);
    expect(onHostChange).toHaveBeenLastCalledWith(expect.any(HTMLElement));
  });
});
