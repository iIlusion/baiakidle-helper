import * as React from "react";
import { type AutoBossView } from "../automation/auto-boss";
import { bossById } from "../data/bosses";

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

export function AutoBossWaveState({ status }: { status: AutoBossView }): React.JSX.Element {
  return (
    <span className="leviticus-wave-state-content" role="status" aria-live="polite">
      <span>Leviticus:</span>
      <strong>{phaseLabels[status.phase]}</strong>
      <small>{bossById(status.currentId)?.name ?? "Nenhum alvo"}</small>
    </span>
  );
}
