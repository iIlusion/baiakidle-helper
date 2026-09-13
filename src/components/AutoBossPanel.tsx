import * as React from "react";
import { Switch } from "./ui/switch";
import { type AutoBossView } from "../automation/auto-boss";
import { type Settings } from "../automation/settings";
import { BOSSES, bossById, type BossEntry } from "../data/bosses";

export type AutoBossPanelProps = {
  settings: Settings;
  status: AutoBossView;
  onChange: (next: Settings) => void;
  embedded?: boolean;
};

const phaseLabels: Record<AutoBossView["phase"], string> = {
  stopped: "Parado",
  "waiting-state": "Aguardando conexão",
  "waiting-stamina": "Aguardando stamina",
  "waiting-charges": "Aguardando cargas",
  selecting: "Selecionando próximo",
  entering: "Entrando no boss",
  fighting: "Em combate",
  "confirming-result": "Confirmando resultado",
  completed: "Lista concluída"
};

function statusTone(phase: AutoBossView["phase"]): string {
  if (phase === "fighting" || phase === "entering") return "live";
  if (phase === "waiting-stamina" || phase === "waiting-charges") return "waiting";
  if (phase === "completed") return "success";
  return "quiet";
}

function resultLabel(result: "win" | "lose" | undefined): string {
  return result === "win" ? "Venceu" : result === "lose" ? "Perdeu" : "Pendente";
}

function QueueResult({ result }: { result: "win" | "lose" | undefined }): React.JSX.Element {
  return <span className={"lev-boss-result" + (result ? " " + result : "")}>{resultLabel(result)}</span>;
}

export function AutoBossPanel({ settings, status, onChange, embedded = false }: AutoBossPanelProps): React.JSX.Element {
  const [query, setQuery] = React.useState("");
  const queued = settings.autoBossIds
    .map(id => bossById(id))
    .filter((boss): boss is BossEntry => Boolean(boss));
  const queuedIds = new Set(queued.map(boss => boss.id));
  const needle = query.trim().toLowerCase();
  const available = BOSSES
    .filter(boss => !queuedIds.has(boss.id))
    .filter(boss => !needle || (boss.name + " " + boss.id).toLowerCase().includes(needle))
    .slice(0, 8);

  const updateQueue = (nextQueue: string[]) => {
    onChange({ ...settings, autoBossIds: nextQueue });
  };

  const addBoss = (boss: BossEntry) => {
    updateQueue([...queued.map(entry => entry.id), boss.id]);
    setQuery("");
  };

  const removeBoss = (id: string) => {
    const next = queued.map(boss => boss.id).filter(entry => entry !== id);
    const nextIndex = Math.min(settings.autoBossIndex, next.length);
    onChange({ ...settings, autoBossIds: next, autoBossIndex: nextIndex });
  };

  const moveBoss = (id: string, direction: -1 | 1) => {
    const next = queued.map(boss => boss.id);
    const index = next.indexOf(id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target]!, next[index]!];
    onChange({ ...settings, autoBossIds: next });
  };

  const start = () => {
    if (queued.length === 0) return;
    onChange({
      ...settings,
      autoBoss: true,
      autoBossIndex: 0,
      autoBossStartedAt: Date.now(),
      autoBossFighting: "",
      autoBossKillsAtEnter: 0,
      autoBossLastId: "",
      autoBossLastResult: "",
      autoBossResults: {}
    });
  };

  const stop = () => onChange({ ...settings, autoBoss: false });
  const isRunning = settings.autoBoss;
  const panelClass = ["lev-auto-boss", embedded ? "lev-auto-boss-embedded" : ""].filter(Boolean).join(" ");

  return (
    <section className={panelClass} aria-labelledby="lev-auto-boss-title">
      <div className="lev-section-heading">
        <div>
          <h3 id="lev-auto-boss-title">Auto Boss</h3>
          <p>Fila própria e início manual ou automático às 00h.</p>
        </div>
      </div>

      <div className={"lev-boss-current-status " + statusTone(status.phase)} aria-live="polite">
        <span>Estado atual</span>
        <strong>{phaseLabels[status.phase]}</strong>
        <small>{bossById(status.currentId)?.name ?? "Nenhum alvo selecionado"}</small>
      </div>

      <div className="lev-boss-actions">
        {isRunning ? (
          <button type="button" className="lev-button secondary" onClick={stop} aria-label="Parar Auto Boss">
            Parar Auto Boss
          </button>
        ) : (
          <button
            type="button"
            className="lev-button primary"
            onClick={start}
            disabled={queued.length === 0}
            aria-label="Iniciar Auto Boss"
          >
            Iniciar Auto Boss
          </button>
        )}
        <label className="lev-daily-toggle">
          <Switch
            checked={settings.autoBossOnReset}
            onCheckedChange={checked => onChange({ ...settings, autoBossOnReset: checked })}
            aria-label="Iniciar automaticamente às 00h"
          />
          <span>Iniciar automaticamente às 00h</span>
        </label>
      </div>

      <div className="lev-boss-queue-grid">
        <div className="lev-boss-pool">
          <label htmlFor="lev-boss-search">Bosses disponíveis</label>
          <input
            id="lev-boss-search"
            type="search"
            role="searchbox"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Buscar por nome ou ID"
            aria-label="Buscar boss"
          />
          <ul className="lev-boss-results" aria-label="Bosses disponíveis">
            {available.length > 0 ? available.map(boss => (
              <li key={boss.id}>
                <button type="button" onClick={() => addBoss(boss)} aria-label={"Adicionar " + boss.name}>
                  <span>{boss.name}</span><small>lvl {boss.minLevel}</small>
                </button>
              </li>
            )) : <li className="lev-empty-line">Nenhum boss encontrado.</li>}
          </ul>
        </div>

        <div className="lev-boss-queue">
          <div className="lev-queue-heading">
            <span>Fila de execução</span>
            <small>{queued.length} selecionado{queued.length === 1 ? "" : "s"}</small>
          </div>
          <ol aria-label="Fila de execução">
            {queued.length > 0 ? queued.map((boss, index) => {
                const result = status.results[boss.id];
                const current = status.currentId === boss.id;
                return (
                  <li key={boss.id} className={(current ? "current" : "") + (result ? " " + result : "")}>
                    <span className="lev-queue-index">{String(index + 1).padStart(2, "0")}</span>
                    <div className="lev-queue-name">
                      <strong>{boss.name}</strong>
                      <small>lvl {boss.minLevel} · {boss.rarity} · <QueueResult result={result} /></small>
                    </div>
                    <div className="lev-queue-controls">
                      <button type="button" onClick={() => moveBoss(boss.id, -1)} disabled={index === 0} aria-label={"Subir " + boss.name}>Subir</button>
                      <button type="button" onClick={() => moveBoss(boss.id, 1)} disabled={index === queued.length - 1} aria-label={"Descer " + boss.name}>Descer</button>
                      <button type="button" onClick={() => removeBoss(boss.id)} aria-label={"Remover " + boss.name}>Remover</button>
                    </div>
                  </li>
                );
              }) : <li className="lev-empty-queue">Adicione bosses à fila para começar.</li>}
          </ol>
        </div>
      </div>
    </section>
  );
}
