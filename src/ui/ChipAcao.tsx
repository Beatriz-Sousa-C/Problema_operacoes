import { estadoAcao, ROTULO_ACAO, type AvaliacaoAcao, type RegistroTratativa } from "@/core";
import { brl2, CLASSE_ESTADO, ICONE_ESTADO, ROTULO_ESTADO } from "./formato";

export function ChipAcao({ avaliacao: a, registro }: { avaliacao: AvaliacaoAcao; registro?: RegistroTratativa }) {
  const estado = estadoAcao(a, registro);
  const rotuloEstado = ROTULO_ESTADO[estado];
  return (
    <span className={`chip chip--${CLASSE_ESTADO[estado]}`} title={`${rotuloEstado}. ${a.motivo}${a.custoEstimado ? `. Custo: ${brl2(a.custoEstimado)}` : ""}`}>
      <span aria-hidden="true" className="chip__icone">
        {ICONE_ESTADO[estado]}
      </span>
      {ROTULO_ACAO[a.acao]}
      <span className="sr-only">: {rotuloEstado}</span>
    </span>
  );
}
