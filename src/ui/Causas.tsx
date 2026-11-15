"use client";
import { useEffect, useState } from "react";
import { projetarPorMes } from "@/core";
import { causasParaCorrecao, gerarPlanosCorrecao, type Contexto, type PlanoCorrecao } from "@/agente";
import { Badge, Cabecalho, Kpi } from "./componentes";
import { brl, num, num1, pct, plural, ROTULO_TIPO } from "./formato";

export function Causas({ ctx, planos }: { ctx: Contexto; planos: PlanoCorrecao[] | null }) {
  const [porRegras, setPorRegras] = useState<PlanoCorrecao[] | null>(null);
  useEffect(() => {
    if (!planos) gerarPlanosCorrecao(ctx, null).then(setPorRegras);
  }, [ctx, planos]);
  const lista = planos ?? porRegras ?? [];
  const planoDe = (id: string) => lista.find((p) => p.causa === id);
  const { auditoria, causas } = ctx;
  const maxBarra = Math.max(1, ...causas.map((c) => c.observado));
  const custoTotal = causas.reduce((s, c) => s + c.custoDoExcesso, 0);
  const pedidosAfetados = new Set(causas.flatMap((c) => c.pedidos)).size;
  const peloAgente = lista.filter((p) => p.fonte === "agente").length;
  const janela = ctx.analise.parametros.janelaDias;
  const mesTotal = causas.reduce(
    (s, c) => {
      const m = projetarPorMes(c, janela);
      return { excecoes: s.excecoes + m.excecoes, custo: s.custo + m.custo };
    },
    { excecoes: 0, custo: 0 },
  );
  const atrasosPorMes = (auditoria.atrasosDentroDoContrato * 30) / janela;

  return (
    <div className="pagina">
      <Cabecalho
        sobre="Causas de processo"
        titulo="A fila resolve o pedido. Isto impede que o próximo vire exceção."
        texto="Sem o volume total de pedidos por grupo, comparamos a participação de cada tipo de exceção dentro do grupo com o resto da base: os outros tipos servem de medida de volume. Só entra o que passa no teste estatístico."
      />

      <div className="grade-4">
        <div className="cartao">
          <Kpi rotulo="Causas confirmadas" valor={num(causasParaCorrecao(ctx).length)} detalhe={auditoria.regraObservada ? "Incluindo o cálculo da data prometida" : undefined} />
        </div>
        <div className="cartao">
          <Kpi rotulo="Pedidos ligados a uma causa" valor={num(pedidosAfetados)} detalhe={`${pct(pedidosAfetados / Math.max(1, ctx.analise.excecoes.length))} das exceções abertas`} />
        </div>
        <div className="cartao">
          <Kpi
            rotulo="Ganho por mês se tudo for corrigido"
            valor={brl(mesTotal.custo)}
            tom="ok"
            detalhe={`Cerca de ${num(mesTotal.excecoes)} exceções a menos por mês. Excesso observado em ${janela} dias: ${brl(custoTotal)}`}
          />
        </div>
        <div className="cartao">
          <Kpi rotulo="Planos escritos pelo agente" valor={`${num(peloAgente)} de ${num(lista.length)}`} tom="marca" detalhe="Cada um endereçado à área responsável" />
        </div>
      </div>

      {auditoria.regraObservada && (
        <article className="cartao" style={{ borderLeft: "4px solid var(--serie-2)" }}>
          <div className="causa__topo">
            <div>
              <Badge tom="atencao" icone="alerta">
                Cálculo do checkout
              </Badge>
              <h2 style={{ marginTop: 8 }}>Data prometida calculada em dias corridos</h2>
            </div>
          </div>
          <p className="suave">
            A regra explica {pct(auditoria.batemComCorridos / auditoria.pedidos)} das {num(auditoria.pedidos)} datas: {auditoria.regraObservada}.{" "}
            <strong>
              {num(auditoria.atrasosDentroDoContrato)} dos {num(auditoria.atrasosTotal)} atrasos
            </strong>{" "}
            estão dentro do prazo contratado. Corrigir o cálculo deixa de registrar cerca de <strong>{num(atrasosPorMes)} atrasos por mês</strong> que não existem
            para a transportadora, e reduz o atraso percebido de toda a fila.
          </p>
          <PlanoDeCorrecao plano={planoDe("auditoria-prazo")} />
        </article>
      )}

      {causas.map((c) => (
        <article className="cartao" key={c.id}>
          <div className="causa__topo">
            <div>
              <span className="mudo" style={{ fontSize: "0.8125rem" }}>
                {c.dimensao}
              </span>
              <h2>
                {c.grupo}: {ROTULO_TIPO[c.tipo].toLowerCase()}
              </h2>
              {c.tambemVisivelEm.length > 0 && <p className="mudo" style={{ fontSize: "0.8125rem" }}>Também aparece em {c.tambemVisivelEm.join("; ")}</p>}
            </div>
            <Badge tom="critico">{num1(c.lift)}× acima do normal</Badge>
          </div>
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
          <p className="suave">
            {pct(c.taxaGrupo)} das exceções do grupo são deste tipo, contra {pct(c.taxaResto)} no resto da operação (p-valor{" "}
            {c.pValor < 1e-12 ? "< 10⁻¹²" : c.pValor.toExponential(1)}). Custo direto do excesso em {janela} dias: <strong>{brl(c.custoDoExcesso)}</strong>, em{" "}
            {plural(c.pedidos.length, "pedido", "pedidos")}.
          </p>
          <p className="ganho">
            Corrigir evita cerca de <strong>{num(projetarPorMes(c, janela).excecoes)} exceções</strong> e <strong>{brl(projetarPorMes(c, janela).custo)} por mês</strong> em reenvios e contatos.
          </p>
          <PlanoDeCorrecao plano={planoDe(c.id)} />
        </article>
      ))}
      {!lista.length && <p className="suave">Preparando os planos…</p>}
    </div>
  );
}

function PlanoDeCorrecao({ plano }: { plano?: PlanoCorrecao }) {
  if (!plano) return null;
  return (
    <div className="correcao">
      <div className="correcao__cabeca">
        <h3>Plano de correção para {plano.responsavel}</h3>
        {plano.fonte === "agente" ? (
          <Badge tom="agente" icone="agente">
            Escrito pelo agente
          </Badge>
        ) : (
          <Badge tom="regras">Modelo padrão (agente indisponível)</Badge>
        )}
      </div>
      <p className="suave">{plano.diagnostico}</p>
      <div className="correcao__colunas">
        <div>
          <h4>Esta semana</h4>
          <ul>
            {plano.acoes_imediatas.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </div>
        <div>
          <h4>Para não repetir</h4>
          <ul>
            {plano.acoes_estruturais.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </div>
      </div>
      <p className="correcao__indicador">
        <strong>Como saber que funcionou:</strong> {plano.indicador_de_sucesso}
      </p>
    </div>
  );
}
