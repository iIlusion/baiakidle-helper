import { unpack } from "msgpackr";
import { codexDeliverPacket, codexPreviewPacket } from "../packets";
import { gameplayConnected, onGamePacket, sendRawPacket } from "../socket";
import { AUTO_CODEX_TICK_MS, autoCodexPending, runAutoCodex, type CodexAsk, type CodexReply } from "./auto-codex";
import type { Settings } from "./settings";

const REPLY_TIMEOUT_MS = 5_000;
const REPLY = { "codex-preview": "codexpreviewres", "codex-deliver": "codexres" } as const;
const waiters = new Map<string, (payload: CodexReply) => void>();
const decoder = new TextDecoder();

/** Quadro Colyseus ROOM_DATA: 0x0d, nome (string msgpack), payload msgpack. */
function readFrame(bytes: Uint8Array): { type: string; payload: unknown } | null {
  if (bytes[0] !== 0x0d) return null;
  const head = bytes[1] ?? 0;
  let start = 2;
  let length = 0;
  if ((head & 0xe0) === 0xa0) length = head & 0x1f;
  else if (head === 0xd9) {
    length = bytes[2] ?? 0;
    start = 3;
  } else return null;
  const type = decoder.decode(bytes.subarray(start, start + length));
  if (!type.startsWith("codex")) return null;
  try {
    return { type, payload: unpack(bytes.subarray(start + length)) };
  } catch {
    return null;
  }
}

let queue: Promise<unknown> = Promise.resolve();

/** Manda e espera a resposta por até 5 s, uma consulta por vez (a resposta só tem o nome da mensagem). */
const ask: CodexAsk = cmd => {
  const run = (): Promise<CodexReply> => {
    const reply = REPLY[cmd.type];
    const answer = new Promise<CodexReply>(resolve => {
      const timer = setTimeout(() => {
        waiters.delete(reply);
        resolve({ id: cmd.id, reason: "timeout" });
      }, REPLY_TIMEOUT_MS);
      waiters.set(reply, payload => {
        clearTimeout(timer);
        waiters.delete(reply);
        resolve(payload);
      });
    });
    const sent = sendRawPacket(cmd.type === "codex-preview" ? codexPreviewPacket(cmd.id) : codexDeliverPacket(cmd.id, cmd.above));
    if (!sent) waiters.get(reply)?.({ id: cmd.id, reason: "timeout" });
    return answer;
  };
  const next = queue.then(run, run);
  queue = next.catch(() => undefined);
  return next;
};

const finished = new Set<string>();
const logLines: string[] = [];

/** Entradas que o servidor já deu como concluídas nesta sessão. */
export const autoCodexFinished = (): ReadonlySet<string> => finished;
export const autoCodexLog = (): readonly string[] => logLines;

export function startAutoCodex(getSettings: () => Settings): void {
  onGamePacket(bytes => {
    const frame = readFrame(bytes);
    if (!frame) return;
    const payload = frame.payload && typeof frame.payload === "object" ? (frame.payload as CodexReply) : {};
    waiters.get(frame.type)?.(payload);
  });
  let running = false;
  setInterval(() => {
    const settings = getSettings();
    if (!settings.autoCodex || running || settings.autoCodexIds.length === 0 || !gameplayConnected()) return;
    if (!autoCodexPending(settings.autoCodexIds, new Set(), finished)) return;
    running = true;
    void runAutoCodex(settings.autoCodexIds, new Set(), finished, ask, line => {
      logLines.push(`${new Date().toLocaleTimeString()} ${line}`);
      if (logLines.length > 20) logLines.shift();
    })
      .catch(error => console.warn("[Leviticus Extension] auto codex falhou", error))
      .finally(() => {
        running = false;
      });
  }, AUTO_CODEX_TICK_MS);
}
