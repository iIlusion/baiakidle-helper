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

type NativeBossSprite = (HTMLCanvasElement | HTMLImageElement) & { _load?: () => void };

function BossSprite({ boss }: { boss: BossEntry }): React.JSX.Element {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);

  React.useEffect(() => {
    let timer: number | undefined;
    let attempts = 0;

    const copySprite = (): boolean => {
      attempts += 1;
      const target = canvasRef.current;
      const sourceCell = Array.from(document.querySelectorAll<HTMLElement>("#boss-modal .boss-pane-list .boss-cell"))
        .find(cell => cell.querySelector(".boss-cell-name")?.textContent?.trim() === boss.name);
      const source = sourceCell?.querySelector<HTMLCanvasElement | HTMLImageElement>("canvas.boss-cell-mon, img.boss-cell-mon") as NativeBossSprite | null;

      source?._load?.();
      if (!target || !source) return false;

      if (source instanceof HTMLImageElement && (!source.complete || source.naturalWidth === 0)) return false;
      if (source instanceof HTMLCanvasElement) {
        try {
          const pixels = source.getContext("2d")?.getImageData(0, 0, source.width, source.height).data;
          if (!pixels || !Array.from(pixels).some((value, index) => index % 4 === 3 && value > 0)) return false;
        } catch {
          return false;
        }
      }

      try {
        const width = source instanceof HTMLImageElement ? source.naturalWidth : source.width;
        const height = source instanceof HTMLImageElement ? source.naturalHeight : source.height;
        target.width = width || 52;
        target.height = height || 52;
        target.getContext("2d")?.drawImage(source, 0, 0);
        return true;
      } catch {
        // A missing sprite should not stop the custom boss controls.
        return false;
      }
    };

    const retry = () => {
      if (!copySprite() && attempts < 8) timer = window.setTimeout(retry, 100);
    };

    retry();
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [boss.id, boss.name]);

  return <canvas ref={canvasRef} className="boss-cell-mon leviticus-boss-photo" width={52} height={52} aria-hidden="true" />;
}

export function AutoBossPanel({ settings, status, onChange, embedded = false }: AutoBossPanelProps): React.JSX.Element {
  const [query, setQuery] = React.useState("");
  const [draggingBossId, setDraggingBossId] = React.useState<string | null>(null);
  const [dragOverBossId, setDragOverBossId] = React.useState<string | null>(null);
  const queued = settings.autoBossIds
    .map(id => bossById(id))
    .filter((boss): boss is BossEntry => Boolean(boss));
  const queuedIds = new Set(queued.map(boss => boss.id));
  const needle = query.trim().toLowerCase();
  const available = BOSSES
    .filter(boss => !queuedIds.has(boss.id))
    .filter(boss => !needle || (boss.name + " " + boss.id).toLowerCase().includes(needle));

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

  const reorderBoss = (sourceId: string, targetId: string) => {
    const next = queued.map(boss => boss.id);
    const sourceIndex = next.indexOf(sourceId);
    const targetIndex = next.indexOf(targetId);
    if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return;
    const [moved] = next.splice(sourceIndex, 1);
    if (!moved) return;
    next.splice(targetIndex, 0, moved);
    onChange({ ...settings, autoBossIds: next });
  };

  const clearDragState = () => {
    setDraggingBossId(null);
    setDragOverBossId(null);
  };

  const handleDragStart = (event: React.DragEvent<HTMLLIElement>, bossId: string) => {
    setDraggingBossId(bossId);
    event.dataTransfer?.setData("text/plain", bossId);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (event: React.DragEvent<HTMLLIElement>, bossId: string) => {
    event.preventDefault();
    setDragOverBossId(bossId);
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (event: React.DragEvent<HTMLLIElement>, targetId: string) => {
    event.preventDefault();
    const sourceId = event.dataTransfer?.getData("text/plain") || draggingBossId;
    if (sourceId) reorderBoss(sourceId, targetId);
    clearDragState();
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
  const panelClass = ["lev-auto-boss", "lev-auto-boss-game", embedded ? "lev-auto-boss-embedded" : ""].filter(Boolean).join(" ");

  return (
    <section className={panelClass} aria-labelledby="lev-auto-boss-title">
      <div className="leviticus-boss-heading">
        <div>
          <h3 id="lev-auto-boss-title" className="boss-section-title">Auto Boss</h3>
          <p className="muted">Fila própria e início manual ou automático às 00h.</p>
        </div>
      </div>

      <div className={"boss-global leviticus-boss-current-status " + statusTone(status.phase)} aria-live="polite">
        <span>Estado atual</span>
        <b>{phaseLabels[status.phase]}</b>
        <small>{bossById(status.currentId)?.name ?? "Nenhum alvo selecionado"}</small>
      </div>

      <div className="leviticus-boss-actions">
        {isRunning ? (
          <button type="button" className="boss-fight" onClick={stop} aria-label="Parar Auto Boss">
            Parar Auto Boss
          </button>
        ) : (
          <button
            type="button"
            className="boss-fight"
            onClick={start}
            disabled={queued.length === 0}
            aria-label="Iniciar Auto Boss"
          >
            Iniciar Auto Boss
          </button>
        )}
        <label className="leviticus-boss-daily">
          <Switch
            checked={settings.autoBossOnReset}
            onCheckedChange={checked => onChange({ ...settings, autoBossOnReset: checked })}
            aria-label="Iniciar automaticamente às 00h"
          />
          <span>Iniciar automaticamente às 00h</span>
        </label>
      </div>

      <div className="leviticus-boss-queue-grid">
        <div className="leviticus-boss-pool">
          <div className="leviticus-boss-list-heading">Bosses disponíveis</div>
          <input
            id="lev-boss-search"
            className="pick-search"
            type="search"
            role="searchbox"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Buscar por nome ou ID"
            aria-label="Buscar boss"
          />
          <ul className="sp-list leviticus-boss-results" aria-label="Bosses disponíveis">
            {available.length > 0 ? available.map(boss => (
              <li key={boss.id} className={"leviticus-boss-card " + boss.rarity} title={boss.name}>
                <span className="leviticus-boss-rarity" />
                <BossSprite boss={boss} />
                <span className="leviticus-boss-card-info">
                  <strong>{boss.name}</strong>
                  <small>lvl {boss.minLevel}</small>
                </span>
                <button className="leviticus-boss-add" type="button" onClick={() => addBoss(boss)} aria-label={"Adicionar " + boss.name}>
                  +
                </button>
              </li>
            )) : <li className="lev-empty-line">Nenhum boss encontrado.</li>}
          </ul>
        </div>

        <div className="leviticus-boss-queue">
          <div className="leviticus-boss-list-heading">
            <span>Fila de execução</span>
            <small>{queued.length} selecionado{queued.length === 1 ? "" : "s"}</small>
          </div>
          <ol className={"leviticus-boss-queue-list" + (queued.length === 0 ? " empty" : "")} aria-label="Fila de execução">
            {queued.length > 0 ? queued.map((boss, index) => {
                const result = status.results[boss.id];
                const current = status.currentId === boss.id;
                return (
                  <li
                    key={boss.id}
                    className={"leviticus-boss-queue-card " + boss.rarity + (current ? " active" : "") + (result ? " " + result : "") + (draggingBossId === boss.id ? " dragging" : "") + (dragOverBossId === boss.id ? " drag-over" : "")}
                    title={boss.name}
                    draggable
                    onDragStart={event => handleDragStart(event, boss.id)}
                    onDragOver={event => handleDragOver(event, boss.id)}
                    onDrop={event => handleDrop(event, boss.id)}
                    onDragEnd={clearDragState}
                  >
                    <BossSprite boss={boss} />
                    <span className="leviticus-boss-order">{String(index + 1).padStart(2, "0")}</span>
                    <span className="leviticus-boss-card-info">
                      <strong>{boss.name}</strong>
                      <small>lvl {boss.minLevel} · <QueueResult result={result} /></small>
                    </span>
                    <button className="leviticus-queue-remove" type="button" onClick={() => removeBoss(boss.id)} aria-label={"Remover " + boss.name} title="Remover">×</button>
                  </li>
                );
              }) : <li className="boss-pl-empty">Adicione bosses à fila para começar.</li>}
          </ol>
        </div>
      </div>
    </section>
  );
}
