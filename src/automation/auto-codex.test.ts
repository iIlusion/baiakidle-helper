import { describe, expect, test } from "vitest";
import { autoCodexPending, parseAutoCodexIds, runAutoCodex, type CodexAsk, type CodexReply } from "./auto-codex";

function fakeAsk(replies: Record<string, { preview: CodexReply; deliver?: CodexReply }>) {
  const calls: string[] = [];
  const ask: CodexAsk = async cmd => {
    calls.push(`${cmd.type}:${cmd.id}${cmd.type === "codex-deliver" ? `:${cmd.above}` : ""}`);
    const row = replies[cmd.id];
    return (cmd.type === "codex-preview" ? row?.preview : row?.deliver) ?? { id: cmd.id, reason: "empty", lines: [] };
  };
  return { calls, ask };
}

describe("auto codex", () => {
  test("lista: só textos, sem repetir, com teto", () => {
    expect(parseAutoCodexIds(["a", " a ", 3, "", "b"])).toEqual(["a", "b"]);
    expect(parseAutoCodexIds("x")).toEqual([]);
    expect(parseAutoCodexIds(Array.from({ length: 80 }, (_, i) => `e${i}`))).toHaveLength(30);
  });

  test("entrega na ordem de prioridade, pula concluídas e nunca usa raridade maior", async () => {
    const { calls, ask } = fakeAsk({
      b: { preview: { lines: [{}] }, deliver: { delivered: 5 } },
      c: { preview: { lines: [] } },
      d: { preview: { lines: [{}] }, deliver: { delivered: 2, done: true } }
    });
    const finished = new Set<string>();
    const logs: string[] = [];
    expect(await runAutoCodex(["a", "b", "c", "d"], new Set(["a"]), finished, ask, line => logs.push(line))).toBe(7);
    expect(calls).toEqual(["codex-preview:b", "codex-deliver:b:false", "codex-preview:c", "codex-preview:d", "codex-deliver:d:false"]);
    expect([...finished]).toEqual(["d"]);
    expect(logs).toHaveLength(2);
  });

  test("servidor diz que já concluiu: não pergunta de novo; party/fechado para a passada", async () => {
    const finished = new Set<string>();
    const first = fakeAsk({ a: { preview: { reason: "done" } }, b: { preview: { reason: "party" } }, c: { preview: { lines: [{}] }, deliver: { delivered: 1 } } });
    expect(await runAutoCodex(["a", "b", "c"], new Set(), finished, first.ask, () => undefined)).toBe(0);
    expect(first.calls).toEqual(["codex-preview:a", "codex-preview:b"]);
    expect(finished.has("a")).toBe(true);
    expect(autoCodexPending(["a"], new Set(), finished)).toBe(false);
    expect(autoCodexPending(["a", "b"], new Set(), finished)).toBe(true);
    expect(autoCodexPending([], new Set(), finished)).toBe(false);
  });
});
