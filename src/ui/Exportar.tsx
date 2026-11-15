"use client";
/**
 * Exportar para quem executa: planilhas por destino, em lotes numerados.
 * Proteções contra clique errado: prévia antes de baixar, desfazer o último
 * lote, baixar de novo qualquer lote e exportar o dia inteiro a qualquer hora.
 */
import { useMemo, useState } from "react";
import type { BaseDados } from "@/core";
import type { Contexto, PlanoDoDia } from "@/agente";
import { baixarCsv, baixarXlsx } from "./baixar";
import { Aviso, Badge, Icone } from "./componentes";
import { contagensPlanas, descreverContagens, montarExportacao, type Escopo, type Exportacao } from "./exportacao";
import { dataHora, num, plural } from "./formato";
import { jaExportados, proximoNumero, type AcaoLotes, type Lote } from "./lotes";
import type { Registro } from "./registro";
import type { Dia } from "./tratativas";

interface Props {
  ctx: Contexto;
  base: BaseDados;
  dia: Dia;
  registro: Registro;
  plano: PlanoDoDia | null;
  modelo?: string;
  lotes: Lote[];
  despacharLotes: (a: AcaoLotes) => void;
}

export function Exportar({ ctx, base, dia, registro, plano, modelo, lotes, despacharLotes }: Props) {
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<{ tom: "ok" | "critico"; texto: string } | null>(null);
  const exportados = useMemo(() => jaExportados(lotes), [lotes]);
  const proximo = proximoNumero(lotes);
  const previa = useMemo(
    () => montarExportacao(ctx, dia, registro, plano, base, { escopo: "novos", exportados, proximoLote: proximo, modelo }),
    [ctx, dia, registro, plano, base, exportados, proximo, modelo],
  );
  const nadaNovo = previa.contagens.total === 0;
  const abasComConteudo = (e: Exportacao) => e.abas.filter((a) => a.id === "resumo" || a.linhas.length || a.preambulo.length);

  const montar = (escopo: Escopo) => (escopo === "novos" ? previa : montarExportacao(ctx, dia, registro, plano, base, { escopo, exportados, proximoLote: proximo, modelo }));

  async function exportar(escopo: Escopo, fecharLote: boolean) {
    setOcupado(true);
    setAviso(null);
    try {
      const exp = montar(escopo);
      const nome = await baixarXlsx(exp);
      if (fecharLote && escopo === "novos") {
        despacharLotes({ tipo: "fechar", itens: exp.itens, contagens: contagensPlanas(exp.contagens) });
        setAviso({ tom: "ok", texto: `Lote ${proximo} exportado (${nome}). O próximo lote traz só o que for aprovado ou liberado a partir de agora.` });
      } else {
        setAviso({ tom: "ok", texto: `Arquivo ${nome} gerado. Nenhum lote foi alterado.` });
      }
    } catch (e) {
      setAviso({ tom: "critico", texto: `Não foi possível gerar o arquivo: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setOcupado(false);
    }
  }

  function fecharSemBaixar() {
    despacharLotes({ tipo: "fechar", itens: previa.itens, contagens: contagensPlanas(previa.contagens) });
    setAviso({ tom: "ok", texto: `Lote ${proximo} marcado como exportado.` });
  }

  function desfazer() {
    const ultimo = lotes.at(-1);
    if (!ultimo) return;
    if (!window.confirm(`Desfazer o lote ${ultimo.numero}? Os ${num(ultimo.itens.length)} itens voltam para o próximo lote. Nenhuma aprovação é alterada.`)) return;
    despacharLotes({ tipo: "desfazer_ultimo" });
    setAviso({ tom: "ok", texto: `Lote ${ultimo.numero} desfeito. Os itens voltaram para a prévia.` });
  }

  return (
    <section className="cartao" aria-label="Exportar para quem executa">
      <div className="cartao__cabeca">
        <div>
          <h2>Exportar para quem executa</h2>
          <p>
            Aprovar coloca o pedido na próxima planilha. Cada exportação vira um lote numerado, com uma aba por transportadora (com o chamado do agente), reenvios e
            produção, reembolsos, mensagens, chamados internos e recusas. Nada é apagado: dá para desfazer o último lote, baixar qualquer lote de novo ou exportar o dia
            inteiro.
          </p>
        </div>
        <div className="botoes">
          <button className="botao" onClick={() => exportar("novos", true)} disabled={ocupado || nadaNovo} title={nadaNovo ? "Nada novo desde o último lote" : undefined}>
            <Icone nome="upload" className="icone-botao" />
            {ocupado ? "Gerando…" : `Exportar lote ${proximo} (XLSX)`}
          </button>
          <button className="botao botao--secundario" onClick={() => exportar("dia", false)} disabled={ocupado}>
            Exportar o dia inteiro
          </button>
        </div>
      </div>

      <div className="previa">
        <span className="previa__rotulo">{nadaNovo ? "Nada novo desde o último lote." : `Vai no lote ${proximo}:`}</span>
        {!nadaNovo && <span className="previa__contagens">{descreverContagens(contagensPlanas(previa.contagens))}</span>}
      </div>

      {!nadaNovo && (
        <details>
          <summary>
            Ver o que entra <span className="mudo">({plural(previa.contagens.total, "item", "itens")})</span>
          </summary>
          <ul className="lista" style={{ marginTop: 8 }}>
            {abasComConteudo(previa)
              .filter((a) => a.id !== "resumo")
              .map((a) => (
                <li key={a.id}>
                  <strong>{a.titulo}</strong>
                  <span className="lista__texto">
                    {a.preambulo.length > 0 && `${plural(a.preambulo.length, "chamado do agente", "chamados do agente")}; `}
                    {a.linhas.length > 0 && `${plural(a.linhas.length, "linha", "linhas")}: ${a.linhas.slice(0, 12).map((l) => String(l.celulas[0])).join(", ")}${a.linhas.length > 12 ? "…" : ""}`}
                  </span>
                </li>
              ))}
          </ul>
        </details>
      )}

      <details>
        <summary>
          Baixar em CSV <span className="mudo">(uma aba por arquivo; não fecha o lote)</span>
        </summary>
        <ul className="lista" style={{ marginTop: 8 }}>
          {abasComConteudo(previa).map((a) => (
            <li key={a.id}>
              <span className="lista__texto">
                {a.titulo} <span className="mudo">({num(a.linhas.length)} linhas)</span>
              </span>
              <span className="lista__botoes">
                <button className="botao-texto" onClick={() => baixarCsv(previa, a)}>
                  CSV deste lote
                </button>
                <button className="botao-texto botao-texto--mudo" onClick={() => baixarCsv(montar("dia"), a)}>
                  CSV do dia inteiro
                </button>
              </span>
            </li>
          ))}
        </ul>
        {!nadaNovo && (
          <p className="suave" style={{ marginTop: 10 }}>
            Depois de baixar os CSVs que precisa,{" "}
            <button className="botao-texto" onClick={fecharSemBaixar}>
              marque o lote {proximo} como exportado
            </button>
            .
          </p>
        )}
      </details>

      {aviso && <Aviso tom={aviso.tom}>{aviso.texto}</Aviso>}

      {lotes.length > 0 && (
        <div>
          <h3 style={{ marginBottom: 8 }}>Lotes exportados hoje</h3>
          <ul className="lista">
            {[...lotes].reverse().map((l, i) => (
              <li key={l.numero}>
                <Badge tom="ok" icone="check">
                  Lote {l.numero}
                </Badge>
                <span className="lista__texto">
                  {dataHora(l.em)} · {descreverContagens(l.contagens)}
                </span>
                <span className="lista__botoes">
                  <button className="botao-texto" onClick={() => exportar({ lote: l }, false)} disabled={ocupado}>
                    Baixar de novo
                  </button>
                  {i === 0 && (
                    <button className="botao-texto botao-texto--perigo" onClick={desfazer}>
                      Desfazer
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
