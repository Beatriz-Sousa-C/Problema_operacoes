"use client";
import { useEffect, useState } from "react";
import { causasParaCorrecao, gerarPlanosCorrecao, type Contexto, type PlanoCorrecao } from "@/agente";
import { brl, num, num1, pct, ROTULO_TIPO } from "./formato";

export function Causas({ ctx, planos }: { ctx: Contexto; planos: PlanoCorrecao[] | null }) {
  const [porRegras, setPorRegras] = useState<PlanoCorrecao[] | null>(null);
  useEffect(() => {
    if (!planos) gerarPlanosCorrecao(ctx, null).then(setPorRegras);
  }, [ctx, planos]);
  const lista = planos ?? porRegras ?? [];
  const planoDe = (id: string) => lista.find((p) => p.causa === id);
  const { auditoria } = ctx;
  const maxBarra = Math.max(1, ...ctx.causas.map((c) => c.observado));

  return (
    <div className="causas">
      <h1 className="titulo-largo titulo-largo--menor">Causas de processo</h1>
      <p className="secao__intro">
        A fila resolve o pedido; estas mudanças impedem que o próximo pedido vire exceção. Sem o volume total de pedidos por grupo, comparamos a
        participação de cada tipo de exceção dentro do grupo com o resto da base: os outros tipos servem de medida de volume.
      </p>

      {auditoria.regraObservada && (
        <article className="causa causa--destaque">
          <h2>Data prometida calculada em dias corridos</h2>
          <p>
            A regra explica {pct(1)} das {num(auditoria.pedidos)} datas: {auditoria.regraObservada}. {num(auditoria.atrasosDentroDoContrato)} dos{" "}
            {num(auditoria.atrasosTotal)} atrasos estão dentro do prazo contratado.
          </p>
          <PlanoDeCorrecao plano={planoDe("auditoria-prazo")} />
        </article>
      )}

      {ctx.causas.map((c) => (
        <article className="causa" key={c.id}>
          <h2>
            {c.grupo}: {ROTULO_TIPO[c.tipo].toLowerCase()}
          </h2>
          <p className="causa__dimensao">
            {c.dimensao}
            {c.tambemVisivelEm.length ? `. Também aparece em ${c.tambemVisivelEm.join("; ")}` : ""}
          </p>
          <div className="evidencia" role="img" aria-label={`${c.observado} ocorrências contra ${num1(c.esperado)} esperadas`}>
            <div className="evidencia__linha">
              <span>Ocorrências</span>
              <span className="evidencia__barra evidencia__barra--obs" style={{ width: `${(c.observado / maxBarra) * 100}%` }} />
              <strong>{num(c.observado)}</strong>
            </div>
            <div className="evidencia__linha">
              <span>Se fosse normal</span>
              <span className="evidencia__barra" style={{ width: `${Math.max(0.5, (c.esperado / maxBarra) * 100)}%` }} />
              <strong>{num1(c.esperado)}</strong>
            </div>
          </div>
          <p className="causa__numeros">
            {num1(c.lift)} vezes acima do resto da operação ({pct(c.taxaGrupo)} contra {pct(c.taxaResto)}), p-valor {c.pValor < 1e-12 ? "< 10⁻¹²" : c.pValor.toExponential(1)}.
            Custo direto do excesso em 60 dias: {brl(c.custoDoExcesso)}.
          </p>
          <PlanoDeCorrecao plano={planoDe(c.id)} />
        </article>
      ))}
      {!lista.length && <p className="secao__intro">Preparando os planos…</p>}
      <p className="secao__intro">Causas avaliadas: {causasParaCorrecao(ctx).length}.</p>
    </div>
  );
}

function PlanoDeCorrecao({ plano }: { plano?: PlanoCorrecao }) {
  if (!plano) return null;
  return (
    <div className="correcao">
      <h3>
        Plano de correção para {plano.responsavel}
        <span className="correcao__fonte">{plano.fonte === "agente" ? "escrito pelo agente" : "modelo padrão (agente indisponível)"}</span>
      </h3>
      <p>{plano.diagnostico}</p>
      <div className="correcao__colunas">
        <div>
          <h4>Esta semana</h4>
          <ul>{plano.acoes_imediatas.map((a) => <li key={a}>{a}</li>)}</ul>
        </div>
        <div>
          <h4>Para não repetir</h4>
          <ul>{plano.acoes_estruturais.map((a) => <li key={a}>{a}</li>)}</ul>
        </div>
      </div>
      <p className="correcao__indicador">Como saber que funcionou: {plano.indicador_de_sucesso}</p>
    </div>
  );
}
