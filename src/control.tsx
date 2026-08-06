import * as React from "react";
import { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";
import { Switch } from "./components/ui/switch";
import { gameplayConnected, setReduceVfx } from "./socket";
import { startAnalyserEnhancements } from "./analyzers";
import {
  clampAutoSellThresholdPct,
  clampMarketAnnounceIntervalMs,
  clampReconnectIntervalMs,
  clampStaminaMinutes,
  formatStaminaMinutes,
  STAMINA_MAX_MINUTES,
  loadSettings,
  saveSettings,
  type Settings,
  type TransferTiers
} from "./automation/settings";
import { startMarketAnnounce } from "./automation/market-announce";
import { startPerfProbe } from "./automation/perf-probe";
import { isJogarPath, startReconnectWatcher } from "./automation/reconnect";
import { startScheduler } from "./automation/scheduler";
import { startTeleportProbe } from "./automation/probe";
import { HUNTS, huntById } from "./data/hunts";
import styles from "./control.css?inline";

declare const unsafeWindow: Window & typeof globalThis;
declare const __BAIAKIDLE_DEV__: boolean;

const page = unsafeWindow;
const MCP_REPOSITORY = "https://github.com/iIlusion/baiakidle-mcp";
const DISCORD_SUPPORT = "https://discord.gg/Hy7HqcAgQG";
const SETTINGS_EVENT = "baiakidle-helper-settings";

type View = "automation" | "development";
type McpBridgeApi = { version: 1; gameplayConnected: () => boolean };
type BridgeWindow = typeof page & { __BAIAKIDLE_MCP_BRIDGE__?: McpBridgeApi };

let settings = loadSettings(
  page.localStorage,
  new Set(HUNTS.map(hunt => hunt.id))
);

function mcpBridge(): McpBridgeApi | undefined {
  return (page as BridgeWindow).__BAIAKIDLE_MCP_BRIDGE__;
}

function persist(next: Settings): void {
  settings = next;
  saveSettings(page.localStorage, next);
  setReduceVfx(next.reduceVfx);
  page.dispatchEvent(new CustomEvent(SETTINGS_EVENT, { detail: next }));
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
    const onSettings = (event: Event) => {
      const detail = (event as CustomEvent<Settings>).detail;
      if (detail) setValue(detail);
    };
    page.addEventListener(SETTINGS_EVENT, onSettings as EventListener);
    return () => page.removeEventListener(SETTINGS_EVENT, onSettings as EventListener);
  }, []);

  React.useEffect(() => {
    const refresh = () => {
      setGameConnected(gameplayConnected());
      if (__BAIAKIDLE_DEV__) setBridgeConnected(Boolean(mcpBridge()));
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
    persist(next);
  };

  const changeTier = (key: keyof TransferTiers, checked: boolean) => {
    const next: Settings = {
      ...value,
      transferTiers: { ...value.transferTiers, [key]: checked }
    };
    setValue(next);
    persist(next);
  };

  const changeHuntId = (huntId: string) => {
    const next: Settings = {
      ...value,
      selectedHuntId: huntId || null
    };
    setValue(next);
    persist(next);
  };

  const changeAutoSellThresholdPct = (raw: string) => {
    const next: Settings = {
      ...value,
      autoSellThresholdPct: clampAutoSellThresholdPct(raw)
    };
    setValue(next);
    persist(next);
  };

  const changeStaminaToTreino = (raw: string) => {
    const next: Settings = {
      ...value,
      autoHuntStaminaToTreinoMinutes: clampStaminaMinutes(raw)
    };
    setValue(next);
    persist(next);
  };

  const changeStaminaToHunt = (raw: string) => {
    const next: Settings = {
      ...value,
      autoHuntStaminaToHuntMinutes: clampStaminaMinutes(raw)
    };
    setValue(next);
    persist(next);
  };

  const changeReconnectIntervalSec = (raw: string) => {
    const sec = Number(raw);
    const ms = clampReconnectIntervalMs(
      Number.isFinite(sec) ? sec * 1_000 : value.reconnectIntervalMs
    );
    const next: Settings = { ...value, reconnectIntervalMs: ms };
    setValue(next);
    persist(next);
  };

  const changeMarketAnnounceIntervalMin = (raw: string) => {
    const min = Number(raw);
    const ms = clampMarketAnnounceIntervalMs(
      Number.isFinite(min) ? min * 60_000 : value.autoMarketAnnounceIntervalMs
    );
    const next: Settings = { ...value, autoMarketAnnounceIntervalMs: ms };
    setValue(next);
    persist(next);
  };

  const selectedHunt = huntById(value.selectedHuntId);

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

          {__BAIAKIDLE_DEV__ && (
            <nav className="baiak-control-nav" aria-label="Seções do Helper">
              <button type="button" className={view === "automation" ? "active" : ""} onClick={() => setView("automation")}>
                Automação
              </button>
              <button type="button" className={view === "development" ? "active" : ""} onClick={() => setView("development")}>
                Desenvolvimento
              </button>
            </nav>
          )}

          {!__BAIAKIDLE_DEV__ || view === "automation" ? (
            <div className="baiak-control-body">
              <div className="baiak-setting-group">
                <SettingRow
                  id="baiak-auto-sell"
                  title="Auto Sell"
                  description="Vende tudo quando o Loot Pouch atingir a % configurada."
                  checked={value.autoSell}
                  onCheckedChange={checked => change("autoSell", checked)}
                />
                <div
                  className={`baiak-setting-suboptions${value.autoSell ? "" : " disabled"}`}
                  aria-label="Opções do Auto Sell"
                >
                  <div
                    className={`baiak-setting-row compact baiak-slider-row${
                      value.autoSell ? "" : " is-disabled"
                    }`}
                  >
                    <label htmlFor="baiak-auto-sell-threshold">
                      <span className="baiak-setting-title">
                        Vender com {value.autoSellThresholdPct}% cheia
                      </span>
                      <span className="baiak-setting-description">
                        {value.autoSellThresholdPct >= 100
                          ? "Só vende com o Loot Pouch lotado."
                          : `Vende quando a pouch estiver com ≥ ${value.autoSellThresholdPct}% dos slots ocupados.`}
                      </span>
                    </label>
                    <div className="baiak-slider-wrap">
                      <input
                        id="baiak-auto-sell-threshold"
                        className="baiak-slider"
                        type="range"
                        min={1}
                        max={100}
                        step={1}
                        disabled={!value.autoSell}
                        value={value.autoSellThresholdPct}
                        onChange={event => changeAutoSellThresholdPct(event.target.value)}
                        aria-label="Porcentagem da Loot Pouch para auto sell"
                        aria-valuemin={1}
                        aria-valuemax={100}
                        aria-valuenow={value.autoSellThresholdPct}
                        style={
                          {
                            "--baiak-slider-pct": `${value.autoSellThresholdPct}%`
                          } as React.CSSProperties
                        }
                      />
                      <span className="baiak-slider-value" aria-hidden="true">
                        {value.autoSellThresholdPct}%
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              <SettingRow
                id="baiak-auto-open-all"
                title="Open All Glooth Bag"
                description="Abre todas quando houver espaço e a venda não estiver em cooldown."
                checked={value.autoOpenAll}
                onCheckedChange={checked => change("autoOpenAll", checked)}
              />
              <div className="baiak-setting-group">
                <SettingRow
                  id="baiak-auto-sell-supply-potions"
                  title="Auto Sell Supply Potions"
                  description="Move potions da Supply Pouch p/ a Loot Pouch e vende (sell all)."
                  checked={value.autoSellSupplyPotions}
                  onCheckedChange={checked => change("autoSellSupplyPotions", checked)}
                />
                <div
                  className={`baiak-setting-suboptions${value.autoSellSupplyPotions ? "" : " disabled"}`}
                  aria-label="Condições do Auto Sell Supply Potions"
                >
                  <SettingRow
                    id="baiak-supply-only-treino"
                    compact
                    disabled={!value.autoSellSupplyPotions}
                    title="Só no Treino online"
                    description="Ativa apenas no mundo Treino online."
                    checked={value.supplyPotionsOnlyTreino}
                    onCheckedChange={checked => change("supplyPotionsOnlyTreino", checked)}
                  />
                  <SettingRow
                    id="baiak-supply-only-no-glooth"
                    compact
                    disabled={!value.autoSellSupplyPotions}
                    title="Só sem Glooth Bag"
                    description="Só se não houver glooth bag no backpack para abrir."
                    checked={value.supplyPotionsOnlyNoGlooth}
                    onCheckedChange={checked => change("supplyPotionsOnlyNoGlooth", checked)}
                  />
                  <SettingRow
                    id="baiak-supply-only-empty-loot"
                    compact
                    disabled={!value.autoSellSupplyPotions}
                    title="Só com Loot Pouch vazia"
                    description="Só se a quantidade de itens na Loot Pouch for 0."
                    checked={value.supplyPotionsOnlyEmptyLoot}
                    onCheckedChange={checked => change("supplyPotionsOnlyEmptyLoot", checked)}
                  />
                </div>
              </div>

              <div className="baiak-setting-group">
                <SettingRow
                  id="baiak-auto-hunt"
                  title="Auto Hunt"
                  description="Na cidade, entra na hunt escolhida (WS stage + fallback DOM)."
                  checked={value.autoHunt}
                  onCheckedChange={checked => change("autoHunt", checked)}
                />
                <div
                  className={`baiak-setting-suboptions${value.autoHunt ? "" : " disabled"}`}
                  aria-label="Opções do Auto Hunt"
                >
                  <div className={`baiak-setting-row compact${value.autoHunt ? "" : " is-disabled"}`}>
                    <label htmlFor="baiak-hunt-select">
                      <span className="baiak-setting-title">Hunt alvo</span>
                      <span className="baiak-setting-description">
                        {selectedHunt
                          ? `id: ${selectedHunt.id} · min lvl ${selectedHunt.minLevel}`
                          : "Selecione a fase (huntId nativo)."}
                      </span>
                    </label>
                    <select
                      id="baiak-hunt-select"
                      className="baiak-select"
                      disabled={!value.autoHunt}
                      value={value.selectedHuntId ?? ""}
                      onChange={event => changeHuntId(event.target.value)}
                      aria-label="Selecionar hunt"
                    >
                      <option value="">— escolher —</option>
                      {HUNTS.map(hunt => (
                        <option key={hunt.id} value={hunt.id}>
                          {hunt.name} (lvl {hunt.minLevel})
                        </option>
                      ))}
                    </select>
                  </div>
                  <SettingRow
                    id="baiak-hunt-low-stamina-treino"
                    compact
                    disabled={!value.autoHunt}
                    title="Treino ↔ Hunt por stamina"
                    description="Auto Hunt fica ON. Use dois limiares (minutos totais da barra)."
                    checked={value.autoHuntTreinoOnLowStamina}
                    onCheckedChange={checked => change("autoHuntTreinoOnLowStamina", checked)}
                  />
                  <div
                    className={`baiak-setting-row compact${
                      value.autoHunt && value.autoHuntTreinoOnLowStamina ? "" : " is-disabled"
                    }`}
                  >
                    <label htmlFor="baiak-stamina-to-treino">
                      <span className="baiak-setting-title">
                        Ir ao Treino se ≤ {formatStaminaMinutes(value.autoHuntStaminaToTreinoMinutes)}
                      </span>
                      <span className="baiak-setting-description">
                        Cidade ou hunt: stamina ≤ este valor (min) → Treino online.
                      </span>
                    </label>
                    <input
                      id="baiak-stamina-to-treino"
                      className="baiak-number"
                      type="number"
                      min={1}
                      max={STAMINA_MAX_MINUTES}
                      step={1}
                      disabled={!value.autoHunt || !value.autoHuntTreinoOnLowStamina}
                      value={value.autoHuntStaminaToTreinoMinutes}
                      onChange={event => changeStaminaToTreino(event.target.value)}
                      title="Minutos totais. Ex.: 60 = 1h, 2520 = 42h (máx)"
                      aria-label="Stamina máxima em minutos para ir ao Treino"
                    />
                  </div>
                  <div
                    className={`baiak-setting-row compact${
                      value.autoHunt && value.autoHuntTreinoOnLowStamina ? "" : " is-disabled"
                    }`}
                  >
                    <label htmlFor="baiak-stamina-to-hunt">
                      <span className="baiak-setting-title">
                        Voltar à Hunt se ≥ {formatStaminaMinutes(value.autoHuntStaminaToHuntMinutes)}
                      </span>
                      <span className="baiak-setting-description">
                        No Treino: stamina ≥ este valor (min) → hunt alvo.
                      </span>
                    </label>
                    <input
                      id="baiak-stamina-to-hunt"
                      className="baiak-number"
                      type="number"
                      min={1}
                      max={STAMINA_MAX_MINUTES}
                      step={1}
                      disabled={!value.autoHunt || !value.autoHuntTreinoOnLowStamina}
                      value={value.autoHuntStaminaToHuntMinutes}
                      onChange={event => changeStaminaToHunt(event.target.value)}
                      title="Minutos totais. Ex.: 120 = 2h, 2520 = 42h (máx)"
                      aria-label="Stamina mínima em minutos para voltar à Hunt"
                    />
                  </div>
                </div>
              </div>

              <div className="baiak-setting-group">
                <SettingRow
                  id="baiak-auto-transfer"
                  title="Auto Transfer"
                  description="Move itens da Loot Pouch p/ o Backpack pelas raridades marcadas (bagmove / Shift+click)."
                  checked={value.autoTransfer}
                  onCheckedChange={checked => change("autoTransfer", checked)}
                />
                <div
                  className={`baiak-setting-suboptions${value.autoTransfer ? "" : " disabled"}`}
                  aria-label="Raridades do Auto Transfer"
                >
                  <SettingRow
                    id="baiak-transfer-rare"
                    compact
                    disabled={!value.autoTransfer}
                    title="Rare"
                    description="data-tier 2"
                    checked={value.transferTiers.rare}
                    onCheckedChange={checked => changeTier("rare", checked)}
                    accent="rare"
                  />
                  <SettingRow
                    id="baiak-transfer-epic"
                    compact
                    disabled={!value.autoTransfer}
                    title="Epic"
                    description="data-tier 3"
                    checked={value.transferTiers.epic}
                    onCheckedChange={checked => changeTier("epic", checked)}
                    accent="epic"
                  />
                  <SettingRow
                    id="baiak-transfer-legendary"
                    compact
                    disabled={!value.autoTransfer}
                    title="Legendary"
                    description="data-tier 4"
                    checked={value.transferTiers.legendary}
                    onCheckedChange={checked => changeTier("legendary", checked)}
                    accent="legendary"
                  />
                  <SettingRow
                    id="baiak-transfer-mythical"
                    compact
                    disabled={!value.autoTransfer}
                    title="Mythical"
                    description="data-tier 5"
                    checked={value.transferTiers.mythical}
                    onCheckedChange={checked => changeTier("mythical", checked)}
                    accent="mythical"
                  />
                </div>
              </div>

              <div className="baiak-setting-group">
                <SettingRow
                  id="baiak-reduce-vfx"
                  title="Modo leve (sem VFX)"
                  description="Bloqueia pacotes fx antes do Pixi (magias/projéteis/efeitos). Menos freeze em combate."
                  checked={value.reduceVfx}
                  onCheckedChange={checked => change("reduceVfx", checked)}
                />
              </div>

              <div className="baiak-setting-group">
                <SettingRow
                  id="baiak-auto-market-announce"
                  title="Auto Market Announce"
                  description="Envia aucshare (Compartilhar no Market) por anúncio ativo, sem abrir o modal."
                  checked={value.autoMarketAnnounce}
                  onCheckedChange={checked => change("autoMarketAnnounce", checked)}
                />
                <div
                  className={`baiak-setting-suboptions${value.autoMarketAnnounce ? "" : " disabled"}`}
                  aria-label="Opções do Auto Market Announce"
                >
                  <div
                    className={`baiak-setting-row compact${
                      value.autoMarketAnnounce ? "" : " is-disabled"
                    }`}
                  >
                    <label htmlFor="baiak-market-announce-interval">
                      <span className="baiak-setting-title">Intervalo por anúncio (min)</span>
                      <span className="baiak-setting-description">
                        Cada listing tem o próprio timer. Entre shares o jogo pede ~2 min no canal Market.
                      </span>
                    </label>
                    <input
                      id="baiak-market-announce-interval"
                      className="baiak-number"
                      type="number"
                      min={2}
                      max={360}
                      step={1}
                      disabled={!value.autoMarketAnnounce}
                      value={Math.round(value.autoMarketAnnounceIntervalMs / 60_000)}
                      onChange={event => changeMarketAnnounceIntervalMin(event.target.value)}
                      aria-label="Intervalo em minutos por anúncio"
                    />
                  </div>
                </div>
              </div>

              <div className="baiak-setting-group">
                <SettingRow
                  id="baiak-auto-reconnect"
                  title="Auto Reconnect"
                  description="Homepage → /jogar, overlay de queda, manutenção. Multi-conta opcional."
                  checked={value.autoReconnect}
                  onCheckedChange={checked => change("autoReconnect", checked)}
                />
                <div
                  className={`baiak-setting-suboptions${value.autoReconnect ? "" : " disabled"}`}
                  aria-label="Opções do Auto Reconnect"
                >
                  <div
                    className={`baiak-setting-row compact${value.autoReconnect ? "" : " is-disabled"}`}
                  >
                    <label htmlFor="baiak-reconnect-interval">
                      <span className="baiak-setting-title">Intervalo (s)</span>
                      <span className="baiak-setting-description">
                        Mínimo entre tentativas. Manutenção/multi usam espera maior.
                      </span>
                    </label>
                    <input
                      id="baiak-reconnect-interval"
                      className="baiak-number"
                      type="number"
                      min={5}
                      max={600}
                      step={1}
                      disabled={!value.autoReconnect}
                      value={Math.round(value.reconnectIntervalMs / 1_000)}
                      onChange={event => changeReconnectIntervalSec(event.target.value)}
                      aria-label="Intervalo de reconexão em segundos"
                    />
                  </div>
                  <SettingRow
                    id="baiak-reconnect-homepage"
                    compact
                    disabled={!value.autoReconnect}
                    title="Homepage"
                    description="Se cair na home (baiakidle.com/), abre /jogar/."
                    checked={value.reconnectHomepage}
                    onCheckedChange={checked => change("reconnectHomepage", checked)}
                  />
                  <SettingRow
                    id="baiak-reconnect-maintenance"
                    compact
                    disabled={!value.autoReconnect}
                    title="Manutenção"
                    description="Detecta texto de manutenção e tenta de novo (espera ≥ 60s)."
                    checked={value.reconnectMaintenance}
                    onCheckedChange={checked => change("reconnectMaintenance", checked)}
                  />
                  <SettingRow
                    id="baiak-reconnect-disconnected"
                    compact
                    disabled={!value.autoReconnect}
                    title="Desconectado"
                    description="#conn-retry / reload se o overlay de queda aparecer ou /jogar travar."
                    checked={value.reconnectDisconnected}
                    onCheckedChange={checked => change("reconnectDisconnected", checked)}
                  />
                  <SettingRow
                    id="baiak-reconnect-multi"
                    compact
                    disabled={!value.autoReconnect}
                    title="Multi-conta / takeover"
                    description="OFF por padrão — reload pode brigar com a outra sessão."
                    checked={value.reconnectMultiAccount}
                    onCheckedChange={checked => change("reconnectMultiAccount", checked)}
                  />
                </div>
              </div>
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
  onCheckedChange,
  compact = false,
  disabled = false,
  accent
}: {
  id: string;
  title: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  compact?: boolean;
  disabled?: boolean;
  accent?: "rare" | "epic" | "legendary" | "mythical";
}): React.JSX.Element {
  return (
    <div className={`baiak-setting-row${compact ? " compact" : ""}${disabled ? " is-disabled" : ""}`}>
      <label htmlFor={id}>
        <span className={`baiak-setting-title${accent ? ` rar-${accent}` : ""}`}>{title}</span>
        <span className="baiak-setting-description">{description}</span>
      </label>
      <div className="baiak-setting-control">
        <span>{checked ? "ON" : "OFF"}</span>
        <Switch
          id={id}
          checked={checked}
          disabled={disabled}
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

// Keep module settings in sync when mini-bar (or another tab) writes localStorage.
page.addEventListener("baiakidle-helper-settings", event => {
  const detail = (event as CustomEvent<Settings>).detail;
  if (detail) {
    settings = detail;
    setReduceVfx(detail.reduceVfx);
  }
});

setReduceVfx(settings.reduceVfx);

// Reconnect runs on all matched pages (homepage, maintenance, /jogar).
startReconnectWatcher(() => settings);

// Full automation + UI only on /jogar (HUD exists there).
if (isJogarPath()) {
  startPerfProbe();
  startScheduler({
    getSettings: () => settings
  });
  startMarketAnnounce(() => settings);
  startAnalyserEnhancements();
  // Full-document MutationObserver probe is dev-only (very expensive in combat).
  if (__BAIAKIDLE_DEV__) startTeleportProbe();
  if (!mount()) {
    const timer = page.setInterval(() => {
      if (mount()) page.clearInterval(timer);
    }, 250);
  }
} else {
  console.info(
    `[BaiakIdle Helper] reconnect-only mode (path=${page.location.pathname}) — ` +
      `use the bottom-right mini bar or enable Auto Reconnect on /jogar`
  );
}
