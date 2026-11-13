import { ROTULO_ACAO, type AvaliacaoAcao } from "@/core";
import { brl2, ICONE_STATUS, ROTULO_STATUS } from "./formato";

export function ChipAcao({ avaliacao: a, decisao }: { avaliacao: AvaliacaoAcao; decisao?: "aprovada" | "recusada" }) {
  const estado = decisao ?? a.status;
  const rotuloEstado = decisao === "aprovada" ? "Aprovada" : decisao === "recusada" ? "Recusada" : ROTULO_STATUS[a.status];
  const icone = decisao === "aprovada" ? "✓" : decisao === "recusada" ? "×" : ICONE_STATUS[a.status];
  return (
    <span className={`chip chip--${estado}`} title={`${rotuloEstado}. ${a.motivo}${a.custoEstimado ? `. Custo: ${brl2(a.custoEstimado)}` : ""}`}>
      <span aria-hidden="true" className="chip__icone">
        {icone}
      </span>
      {ROTULO_ACAO[a.acao]}
      <span className="sr-only">: {rotuloEstado}</span>
    </span>
  );
}
