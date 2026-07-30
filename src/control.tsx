import * as React from "react";
import { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";
import { Switch } from "./components/ui/switch";
import { gameplayConnected, sendRawPacket } from "./socket";
import styles from "./control.css?inline";

declare const unsafeWindow: Window & typeof globalThis;

const page = unsafeWindow;
const STORAGE_KEY = "baiakidle-helper-v1";
const SELL_ALL_BASE64 = "DadzZWxsYWxs1HJAkalwcm90ZWN0ZWTC";
const OPEN_ALL_GLOOTH_BAGS_BASE64 = "Dad1c2VpdGVt1HJAk6RuYW1lpGZyb22jYWxsqmdsb290aCBiYWeoYmFja3BhY2vD";
const MCP_REPOSITORY = "https://github.com/iIlusion/baiakidle-mcp";
const DISCORD_SUPPORT = "https://discord.gg/Hy7HqcAgQG";

type Settings = { autoSell: boolean; autoOpenAll: boolean };
type View = "automation" | "development";
type McpBridgeApi = { version: 1; gameplayConnected: () => boolean };
type BridgeWindow = typeof page & { __BAIAKIDLE_MCP_BRIDGE__?: McpBridgeApi };

const defaults: Settings = { autoSell: true, autoOpenAll: true };
let settings = loadSettings();

function loadSettings(): Settings {
  try {
    return { ...defaults, ...JSON.parse(page.localStorage.getItem(STORAGE_KEY) ?? "{}") };
  } catch {
    return defaults;
  }
}

function saveSettings(next: Settings): void {
  settings = next;
  page.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

function mcpBridge(): McpBridgeApi | undefined {
  return (page as BridgeWindow).__BAIAKIDLE_MCP_BRIDGE__;
}

function inventory(): {
  current: number;
  capacity: number;
  full: boolean;
  cooldown: boolean;
  hasGloothBag: boolean;
} | undefined {
  const match = /^\s*(\d+)\s*\/\s*(\d+)/.exec(
    page.document.getElementById("inv-count")?.textContent ?? ""
  );
  if (!match) return;

  const current = Number(match[1]);
  const capacity = Number(match[2]);
  const sellButton = page.document.getElementById("sell-all") as HTMLButtonElement | null;
  return {
    current,
    capacity,
    full: capacity > 0 && current >= capacity,
    cooldown: Boolean(sellButton?.disabled || sellButton?.classList.contains("cd")),
    hasGloothBag: Boolean(page.document.querySelector('#backpack-grid img[alt="glooth bag"]'))
  };
}

function startAutomation(): void {
  let sellLatched = false;
  let openLatched = false;

  page.setInterval(() => {
    const state = inventory();
    if (!state) return;

    if (!settings.autoSell || !state.full) sellLatched = false;
    if (settings.autoSell && state.full && !state.cooldown && !sellLatched) {
      sellLatched = sendRawPacket(SELL_ALL_BASE64);
    }

    if (!settings.autoOpenAll || !state.hasGloothBag || state.full || state.cooldown) {
      openLatched = false;
    } else if (!openLatched) {
      openLatched = sendRawPacket(OPEN_ALL_GLOOTH_BAGS_BASE64);
    }
  }, 250);
}

function BotIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
      <path d="M12 3v3M8 3h8M6 9h12a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2Z" />
      <path d="M8 14h.01M16 14h.01M9 17h6M2 13h2M20 13h2" />
    </svg>
  );
}

function RadioIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
      <circle cx="12" cy="12" r="2" />
      <path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M4.9 4.9a10 10 0 0 0 0 14.2M19.1 4.9a10 10 0 0 1 0 14.2" />
    </svg>
  );
}

function ChatIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
      <path d="M7 8.5h10M7 12h7M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-8l-5 3v-3H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" />
    </svg>
  );
}

type Position = { left: number; top: number };

function ControlMenu(): React.JSX.Element {
  const [open, setOpen] = React.useState(false);
  const [view, setView] = React.useState<View>("automation");
  const [value, setValue] = React.useState(settings);
  const [gameConnected, setGameConnected] = React.useState(false);
  const [bridgeConnected, setBridgeConnected] = React.useState(false);
  const [position, setPosition] = React.useState<Position>({ left: 8, top: 78 });
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);

  const updatePosition = React.useCallback(() => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(420, page.innerWidth - 16);
    setPosition({
      left: Math.max(8, Math.min(page.innerWidth - width - 8, rect.left + rect.width / 2 - width / 2)),
      top: Math.max(8, Math.min(page.innerHeight - 260, rect.bottom + 8))
    });
  }, []);

  React.useEffect(() => {
    const refresh = () => {
      setGameConnected(gameplayConnected());
      setBridgeConnected(Boolean(mcpBridge()));
    };
    refresh();
    const timer = page.setInterval(refresh, 750);
    return () => page.clearInterval(timer);
  }, []);

  React.useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    const closeOutside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!buttonRef.current?.contains(target) && !panelRef.current?.contains(target)) setOpen(false);
    };
    const closeEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    page.addEventListener("resize", updatePosition);
    page.document.addEventListener("pointerdown", closeOutside);
    page.document.addEventListener("keydown", closeEscape);
    return () => {
      page.removeEventListener("resize", updatePosition);
      page.document.removeEventListener("pointerdown", closeOutside);
      page.document.removeEventListener("keydown", closeEscape);
    };
  }, [open, updatePosition]);

  const change = (key: keyof Settings, checked: boolean) => {
    const next = { ...value, [key]: checked };
    setValue(next);
    saveSettings(next);
  };

  return (
    <>
      <button
        ref={buttonRef}
        id="tab-baiak-control"
        className={`tab baiak-control-tab${open ? " on" : ""}`}
        type="button"
        aria-label="Abrir BaiakIdle Helper"
        aria-controls="baiakidle-control-panel"
        aria-expanded={open}
        onClick={() => setOpen(current => !current)}
      >
        <span className="baiak-control-icon" aria-hidden="true"><BotIcon /></span>
        <span>Helper</span>
      </button>
      {open && createPortal(
        <div
          ref={panelRef}
          id="baiakidle-control-panel"
          role="dialog"
          aria-label="BaiakIdle Helper"
          style={position}
        >
          <header className="baiak-control-head">
            <div>
              <h2>BaiakIdle Helper</h2>
              <p>Ferramentas para Glooth Bag &amp; Loot Pouch</p>
            </div>
            <span className={`baiak-bridge-state${gameConnected ? " connected" : ""}`}>
              <RadioIcon />{gameConnected ? "Jogo conectado" : "Aguardando hunt"}
            </span>
          </header>

          <nav className="baiak-control-nav" aria-label="Seções do Helper">
            <button type="button" className={view === "automation" ? "active" : ""} onClick={() => setView("automation")}>
              Automação
            </button>
            <button type="button" className={view === "development" ? "active" : ""} onClick={() => setView("development")}>
              Desenvolvimento
            </button>
          </nav>

          {view === "automation" ? (
            <div className="baiak-control-body">
              <SettingRow
                id="baiak-auto-sell"
                title="Auto Sell"
                description="Vende tudo quando o Loot Pouch atingir o limite."
                checked={value.autoSell}
                onCheckedChange={checked => change("autoSell", checked)}
              />
              <SettingRow
                id="baiak-auto-open-all"
                title="Open All Glooth Bag"
                description="Abre todas quando houver espaço e a venda estiver disponível."
                checked={value.autoOpenAll}
                onCheckedChange={checked => change("autoOpenAll", checked)}
              />
            </div>
          ) : (
            <Development bridgeConnected={bridgeConnected} />
          )}

          <footer className="baiak-support">
            <div className="baiak-support-intro">
              <span className="baiak-support-icon"><ChatIcon /></span>
              <span><strong>Suporte &amp; contato</strong><small>Dúvidas, bugs ou sugestões</small></span>
            </div>
            <a href={DISCORD_SUPPORT} target="_blank" rel="noreferrer">
              Entrar no Discord <span aria-hidden="true">↗</span>
            </a>
          </footer>
        </div>,
        page.document.body
      )}
    </>
  );
}

function Development({ bridgeConnected }: { bridgeConnected: boolean }): React.JSX.Element {
  return (
    <section className="baiak-dev">
      <div className="baiak-dev-status">
        <div>
          <strong>MCP Bridge / Server</strong>
          <span>Opcional — usado para inspeção e desenvolvimento.</span>
        </div>
        <span className={`baiak-bridge-state${bridgeConnected ? " connected" : ""}`}>
          <RadioIcon />{bridgeConnected ? "Bridge detectada" : "Bridge ausente"}
        </span>
      </div>

      <p>
        O projeto MCP captura DOM, fetch/XHR e pacotes WebSocket da página e disponibiliza essas
        informações ao Codex por uma conexão local.
      </p>
      <ol className="baiak-dev-steps">
        <li>Baixe ou clone o repositório <a href={MCP_REPOSITORY} target="_blank" rel="noreferrer">baiakidle-mcp</a>.</li>
        <li>Execute <code>npm install</code> e <code>npm run build</code>.</li>
        <li>Instale <code>dist/baiakidle-bridge.user.js</code> no Tampermonkey.</li>
        <li>Adicione o servidor ao <code>config.toml</code> do Codex:</li>
      </ol>
      <pre>{`[mcp_servers.baiakidle-page-bridge]\ncommand = "node"\nargs = ["C:/caminho/baiakidle-mcp/mcp-server/dist/index.js"]\nstartup_timeout_sec = 60`}</pre>
      <p className="baiak-dev-footnote">Reinicie o Codex e recarregue a página do jogo após instalar a bridge.</p>
    </section>
  );
}

function SettingRow({
  id,
  title,
  description,
  checked,
  onCheckedChange
}: {
  id: string;
  title: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}): React.JSX.Element {
  return (
    <div className="baiak-setting-row">
      <label htmlFor={id}>
        <span className="baiak-setting-title">{title}</span>
        <span className="baiak-setting-description">{description}</span>
      </label>
      <div className="baiak-setting-control">
        <span>{checked ? "ON" : "OFF"}</span>
        <Switch
          id={id}
          checked={checked}
          onCheckedChange={onCheckedChange}
          aria-label={`${title}: ${checked ? "ligado" : "desligado"}`}
        />
      </div>
    </div>
  );
}

function injectStyles(): void {
  if (page.document.getElementById("baiakidle-control-styles")) return;
  const style = page.document.createElement("style");
  style.id = "baiakidle-control-styles";
  style.textContent = styles;
  (page.document.head ?? page.document.documentElement).append(style);
}

function mount(): boolean {
  const tabs = page.document.querySelector("#hud .tabs:not(.bar-sys)");
  if (!tabs || page.document.getElementById("baiakidle-control-root")) return false;
  injectStyles();
  const host = page.document.createElement("span");
  host.id = "baiakidle-control-root";
  tabs.append(host);
  createRoot(host).render(<ControlMenu />);
  console.info("[BaiakIdle Helper] loaded");
  return true;
}

startAutomation();
if (!mount()) {
  const timer = page.setInterval(() => {
    if (mount()) page.clearInterval(timer);
  }, 250);
}