import { AUTO_CODEX_MAX } from "./auto-codex";
import { autoCodexFinished, autoCodexLog } from "./auto-codex-runtime";
import type { Settings } from "./settings";

const TAB_ID = "lev-codex-tab";
const PANE_ID = "lev-codex-pane";
const ACTIVE = "lev-codex-active";

const esc = (text: string) => text.replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]!);

/** Aba "Leviticus Auto Codex" dentro do menu Codex nativo do /jogar + botão "Auto" em cada entrada. */
export function startCodexMenuObserver(doc: Document, getSettings: () => Settings, persist: (next: Settings) => void): { sync: () => void; disconnect: () => void } {
  let active = false;
  let dragId = "";
  let lastHtml = "";
  let nativeOn = new Map<Element, boolean>();
  const CACHE_KEY = "leviticus-codex-entry-cache";
  let cache: Record<string, string> = {};
  try {
    cache = JSON.parse(doc.defaultView?.localStorage.getItem(CACHE_KEY) ?? "{}") as Record<string, string>;
  } catch {
    /* sem cache: as entradas carregam quando aparecerem na lista */
  }

  const save = (ids: string[], names: Record<string, string>) => {
    const keep = Object.fromEntries(ids.filter(id => names[id]).map(id => [id, names[id]!]));
    persist({ ...getSettings(), autoCodexIds: ids, autoCodexNames: keep });
  };
  const toggle = (id: string, name: string) => {
    const s = getSettings();
    if (s.autoCodexIds.includes(id)) return save(s.autoCodexIds.filter(row => row !== id), s.autoCodexNames);
    if (s.autoCodexIds.length >= AUTO_CODEX_MAX) return;
    save([...s.autoCodexIds, id], { ...s.autoCodexNames, [id]: name });
  };

  const setActive = (on: boolean, modal: HTMLElement) => {
    const side = modal.querySelector(".codex-side");
    const tab = doc.getElementById(TAB_ID);
    if (on && !active && side) {
      nativeOn = new Map([...side.querySelectorAll(".codex-tab")].filter(el => el !== tab).map(el => [el, el.classList.contains("on")] as const));
      for (const el of nativeOn.keys()) el.classList.remove("on");
    }
    if (!on && active) {
      for (const [el, was] of nativeOn) if (el.isConnected) el.classList.toggle("on", was);
      nativeOn = new Map();
    }
    active = on;
    tab?.classList.toggle("on", on);
    modal.querySelector(".codex-main")?.classList.toggle(ACTIVE, on);
    render(modal);
  };

  const render = (modal: HTMLElement) => {
    const pane = modal.querySelector<HTMLElement>("#" + PANE_ID);
    const count = modal.querySelector<HTMLElement>("#" + TAB_ID + " .codex-tab-count");
    const s = getSettings();
    if (count) {
      // só escreve quando muda: mexer em texto dispara o MutationObserver e faria um loop
      const text = s.autoCodexIds.length ? `${s.autoCodexIds.length}/${AUTO_CODEX_MAX}` : "";
      if (count.textContent !== text) count.textContent = text;
      count.classList.toggle("hidden", s.autoCodexIds.length === 0);
    }
    if (!pane || !active || dragId) return;
    const done = autoCodexFinished();
    const rows = s.autoCodexIds.map((id, i) => `<div class="lev-cx-row" draggable="true" data-id="${esc(id)}" title="Arraste para mudar a prioridade">${entryHtml(id, i, s, done.has(id))}</div>`).join("");
    const log = autoCodexLog().slice(-5).map(line => `<div>${esc(line)}</div>`).join("");
    const html = `<div class="lev-cx-head"><button type="button" class="lev-cx-power${s.autoCodex ? " on" : ""}" data-power>${s.autoCodex ? "Ligado" : "Desligado"}</button></div>
<div class="muted cx-pane-note">A ordem é a prioridade: quando duas entradas disputam o mesmo item, a de cima leva. A cada 10 s o Leviticus entrega o que houver nas bags para as entradas ainda não concluídas. Não paga desbloqueio nem usa item de raridade maior que a pedida. Os itens entregues são destruídos.</div>
${rows ? `<div class="cx-listwrap"><div class="cx-list">${rows}</div></div>` : '<div class="cx-tot-empty">Nenhuma entrada no Auto Codex. Use o botão “Auto” de uma entrada na lista do Codex.</div>'}
<div class="lev-cx-log">${log}</div>`;
    if (html !== lastHtml) {
      lastHtml = html;
      pane.innerHTML = html;
    }
  };

  /** Desenha a entrada como a nativa: reaproveita o HTML da última vez que ela apareceu na lista do jogo. */
  const entryHtml = (id: string, index: number, s: Settings, finished: boolean): string => {
    const html = cache[id];
    if (!html) return `<div class="lev-cx-fallback"><b>${index + 1}</b><span class="lev-cx-name">${esc(s.autoCodexNames[id] ?? id)}</span><span class="muted">abra a entrada na lista do Codex para carregar</span><button type="button" class="lev-cx-auto on" data-rm="${esc(id)}">Auto</button></div>`;
    const tpl = doc.createElement("template");
    tpl.innerHTML = html;
    const entry = tpl.content.firstElementChild;
    if (!entry) return "";
    entry.querySelector(".cx-star")?.remove();
    entry.querySelector(".lev-cx-auto")?.remove();
    const lead = entry.querySelector(".cx-entry-lead");
    lead?.insertAdjacentHTML("afterbegin", `<b class="lev-cx-pos" title="Prioridade no Auto Codex">${index + 1}</b>`);
    lead?.insertAdjacentHTML("beforeend", `<button type="button" class="lev-cx-auto on" data-rm="${esc(id)}" title="Auto entregar ligado — clique para tirar">Auto</button>`);
    if (finished) entry.classList.add("done");
    entry.querySelector(".cx-give")?.remove();
    return entry.outerHTML;
  };

  const onPaneClick = (event: Event) => {
    const target = event.target as HTMLElement;
    const s = getSettings();
    if (target.closest("[data-power]")) return persist({ ...s, autoCodex: !s.autoCodex });
    const rm = target.closest<HTMLElement>("[data-rm]")?.dataset.rm;
    if (rm) save(s.autoCodexIds.filter(id => id !== rm), s.autoCodexNames);
  };
  const onDrag = (event: DragEvent) => {
    const row = (event.target as HTMLElement).closest<HTMLElement>(".lev-cx-row");
    if (event.type === "dragstart") dragId = row?.dataset.id ?? "";
    else if (event.type === "dragover" && dragId) event.preventDefault();
    else if (event.type === "dragend") dragId = "";
    else if (event.type === "drop" && dragId && row?.dataset.id) {
      event.preventDefault();
      const s = getSettings();
      const next = s.autoCodexIds.filter(id => id !== dragId);
      next.splice(s.autoCodexIds.indexOf(row.dataset.id), 0, dragId);
      dragId = "";
      save(next, s.autoCodexNames);
    }
  };

  const sync = () => {
    const modal = doc.querySelector<HTMLElement>("#codex-modal");
    const side = modal?.querySelector<HTMLElement>(".codex-side");
    const main = modal?.querySelector<HTMLElement>(".codex-main");
    if (!modal || !side || !main || modal.getClientRects().length === 0) {
      active = false; // menu fechado: reabre na aba nativa
      return;
    }
    if (!doc.getElementById(TAB_ID)) {
      const tab = doc.createElement("button");
      tab.id = TAB_ID;
      tab.type = "button";
      tab.className = "store-sidebtn codex-tab";
      tab.innerHTML = '<div class="codex-tab-label">Leviticus Auto Codex</div><div class="codex-tab-count hidden"></div>';
      tab.addEventListener("click", event => {
        event.stopPropagation();
        setActive(true, modal);
      });
      side.append(tab);
    }
    if (!doc.getElementById(PANE_ID)) {
      const pane = doc.createElement("div");
      pane.id = PANE_ID;
      pane.className = "codex-pane";
      pane.addEventListener("click", onPaneClick);
      for (const type of ["dragstart", "dragover", "dragend", "drop"]) pane.addEventListener(type, onDrag as EventListener);
      main.append(pane);
      lastHtml = "";
    }
    const flagged = modal as HTMLElement & { _levBound?: boolean };
    if (!flagged._levBound) {
      flagged._levBound = true;
      // qualquer aba nativa devolve o Codex ao normal
      side.addEventListener("click", event => {
        const native = (event.target as HTMLElement).closest(".codex-tab");
        if (native && native.id !== TAB_ID && active) setActive(false, modal);
      });
    }
    main.classList.toggle(ACTIVE, active);
    doc.getElementById(TAB_ID)?.classList.toggle("on", active);
    // botão "Auto" em cada entrada ainda não concluída da lista nativa
    const ids = new Set(getSettings().autoCodexIds);
    for (const entry of main.querySelectorAll<HTMLElement>("#codex-pane-list .cx-entry")) {
      const id = entry.querySelector<HTMLElement>(".cx-entry-num")?.title;
      const lead = entry.querySelector(".cx-entry-lead");
      if (!id || !lead) continue;
      if (ids.has(id) && cache[id] !== entry.outerHTML) {
        cache[id] = entry.outerHTML;
        try {
          doc.defaultView?.localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(Object.entries(cache).filter(([key]) => ids.has(key)))));
        } catch {
          /* cache só não persiste */
        }
      }
      let btn = lead.querySelector<HTMLButtonElement>(".lev-cx-auto");
      if (entry.classList.contains("done") && !ids.has(id)) {
        btn?.remove();
        continue;
      }
      if (!btn) {
        btn = doc.createElement("button");
        btn.type = "button";
        btn.className = "lev-cx-auto";
        btn.textContent = "Auto";
        btn.addEventListener("click", event => {
          event.stopPropagation();
          toggle(id, entry.querySelector(".cx-entry-name")?.textContent?.trim() || id);
        });
        lead.append(btn);
      }
      btn.classList.toggle("on", ids.has(id));
      btn.title = ids.has(id) ? "Leviticus Auto Codex ligado — clique para tirar" : "Leviticus Auto Codex: entregar sozinho nesta entrada";
    }
    render(modal);
  };

  // o jogo reescreve o DOM do Codex dezenas de vezes por segundo: um sync a cada 150 ms basta
  let pending: ReturnType<typeof setTimeout> | undefined;
  const observer = new MutationObserver(() => {
    pending ??= setTimeout(() => {
      pending = undefined;
      sync();
    }, 150);
  });
  observer.observe(doc.body ?? doc.documentElement, { subtree: true, childList: true });
  const timer = setInterval(sync, 1_000); // log/concluídas mudam sem mexer no DOM
  sync();
  return {
    sync,
    disconnect: () => {
      observer.disconnect();
      clearInterval(timer);
      doc.getElementById(TAB_ID)?.remove();
      doc.getElementById(PANE_ID)?.remove();
    }
  };
}
