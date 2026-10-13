/** Auto Codex: entrega sozinho nas entradas escolhidas, na ordem de prioridade (a 1ª leva o item disputado). */

export const AUTO_CODEX_MAX = 30;
export const AUTO_CODEX_TICK_MS = 10_000;

export function parseAutoCodexIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  for (const row of value) {
    const id = typeof row === "string" ? row.trim() : "";
    if (id && id.length <= 120) seen.add(id);
    if (seen.size >= AUTO_CODEX_MAX) break;
  }
  return [...seen];
}

export type CodexReply = { id?: string; lines?: unknown[]; reason?: string; delivered?: number; done?: boolean };
export type CodexAsk = (cmd: { type: "codex-preview"; id: string } | { type: "codex-deliver"; id: string; above: boolean }) => Promise<CodexReply>;

/** Motivos que valem para a conta toda: não adianta tentar as outras entradas agora. */
const STOP = new Set(["party", "closed", "loading", "timeout"]);

/**
 * Uma passada: para cada entrada ainda não concluída, confere o que serviria e entrega.
 * Nunca usa item de raridade maior que a pedida (`above: false`) nem paga desbloqueio.
 * `finished` guarda o que o servidor já disse estar concluído, para não perguntar de novo.
 */
export async function runAutoCodex(ids: string[], done: ReadonlySet<string>, finished: Set<string>, ask: CodexAsk, log: (line: string) => void): Promise<number> {
  let delivered = 0;
  for (const id of ids) {
    if (done.has(id) || finished.has(id)) continue;
    const preview = await ask({ type: "codex-preview", id });
    if (preview.reason === "done") {
      finished.add(id);
      continue;
    }
    if (preview.reason && STOP.has(preview.reason)) break;
    if (!preview.lines?.length) continue;
    const result = await ask({ type: "codex-deliver", id, above: false });
    if (result.reason && STOP.has(result.reason)) break;
    const count = Math.max(0, Math.floor(Number(result.delivered) || 0));
    delivered += count;
    if (result.done) finished.add(id);
    if (count > 0 || result.done) log(`auto codex — ${id}: +${count}${result.done ? " (concluída)" : ""}`);
  }
  return delivered;
}

/** Há trabalho: alguma entrada da lista que ainda não foi concluída. */
export const autoCodexPending = (ids: string[], done: ReadonlySet<string>, finished: ReadonlySet<string>) => ids.some(id => !done.has(id) && !finished.has(id));
