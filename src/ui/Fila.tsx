"use client";
import { useMemo, useState } from "react";
import { estadoAcao, type EstadoAcao, type TipoExcecao } from "@/core";
import { filaDoDia, type Contexto, type PlanoDoDia } from "@/agente";
import { ChipAcao } from "./ChipAcao";
import { PainelPedido } from "./PainelPedido";
import { BadgeFonte, Cabecalho, Kpi } from "./componentes";
import { brl, brl2, num, pct, plural, ROTULO_ESTADO, ROTULO_TIPO, tituloGrupo } from "./formato";
import { usePedidoSelecionado } from "./estado";
import type { Lote } from "./lotes";
import type { AcaoRegistro, Registro } from "./registro";
import type { Dia } from "./tratativas";

interface Props {
  ctx: Contexto;
  plano: PlanoDoDia | null;
  dia: Dia;
  registro: Registro;
  lotes: Lote[];
  despachar: (a: AcaoRegistro) => void;
  /** IA ao vivo só existe para a lista original (o agente roda no servidor) */
  iaAoVivo: boolean;
  irPara: (aba: string) => void;
}

const FILTROS_ESTADO: EstadoAcao[] = ["aguarda_aprovacao", "aguarda_foto", "aprovada", "recusada", "liberada", "bloqueada"];

/** Visão de consulta: a fila do dia inteira em tabela, com filtros. O trabalho guiado fica em "Trabalho de hoje". */
export function Fila({ ctx, plano, dia, registro, lotes, despachar, iaAoVivo, irPara }: Props) {
  const [tipo, setTipo] = useState<TipoExcecao | "">("");
  const [estado, setEstado] = useState<EstadoAcao | "">("");
  const [selecionado, setSelecionado] = usePedidoSelecionado(ctx);

  const hoje = useMemo(() => filaDoDia(ctx), [ctx]);
  const { tratativas } = dia;

  const linhas = hoje.filter(
    (i) =>
      (!tipo || i.excecao.tipo_excecao === tipo) &&
      (!estado || tratativas.get(i.excecao.id)?.acoes.some((a) => estadoAcao(a, registro[i.excecao.id]) === estado)),
  );
  const tiposHoje = [...new Set(hoje.map((i) => i.excecao.tipo_excecao))].sort();
  const valorEmJogo = hoje.reduce((s, i) => s + i.excecao.valorEmJogo, 0);
  const custoEsperarHoje = hoje.reduce((s, i) => s + i.excecao.custoDeEsperar, 0);
  const vips = hoje.filter((i) => i.excecao.clienteVip).length;
  const item = selecionado ? ctx.porId.get(selecionado) : undefined;

  return (
    <div className="pagina">
      <Cabecalho
        sobre="Consulta"
        titulo={`Fila completa de hoje: ${num(hoje.length)} exceções`}
        texto={
          <>
            Ordenadas pelo quanto a perda cresce se cada pedido esperar até o fim da fila. Para trabalhar passo a passo, use{" "}
            <button className="botao-texto" onClick={() => irPara("hoje")}>
              Trabalho de hoje
            </button>
            .
          </>
        }
      />

      <div className="grade-3">
        <div className="cartao">
          <Kpi rotulo="Valor em jogo nos pedidos de hoje" valor={brl(valorEmJogo)} detalhe="Reembolso mais recompra ameaçada" />
        </div>
        <div className="cartao">
          <Kpi rotulo="Perda adicional evitada por tratá-los hoje" valor={brl(custoEsperarHoje)} tom="marca" detalhe="Em vez de deixá-los para o fim da fila" />
        </div>
        <div className="cartao">
          <Kpi rotulo="Clientes de alto valor na fila" valor={num(vips)} detalhe={`${pct(hoje.length ? vips / hoje.length : 0)} dos pedidos do dia`} />
        </div>
      </div>

      {plano && (
        <details className="cartao">
          <summary>
            Como cada grupo foi decidido <span className="mudo">({plural(plano.grupos.length, "grupo", "grupos")})</span>
          </summary>
          <ul className="lista" style={{ marginTop: 10 }}>
            {plano.grupos.map((g) => (
              <li key={g.chave} style={{ display: "grid", gap: 6 }}>
                <div className="pendencia__titulo">
                  <h3>{tituloGrupo(g)}</h3>
                  <span className="mudo">{plural(g.pedidos, "pedido", "pedidos")}</span>
                  <BadgeFonte fonte={g.fonte} aviso={g.aviso} />
                </div>
                <p className="suave">{g.plano.justificativa}</p>
                {g.plano.chamado_lote && (
                  <p className="chamado">
                    <strong>Chamado único para {g.plano.chamado_lote.destino}:</strong> {g.plano.chamado_lote.texto}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="filtros" role="group" aria-label="Filtros">
        <label>
          Exceção
          <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoExcecao | "")}>
            <option value="">Todas</option>
            {tiposHoje.map((t) => (
              <option key={t} value={t}>
                {ROTULO_TIPO[t]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Estado da ação
          <select value={estado} onChange={(e) => setEstado(e.target.value as EstadoAcao | "")}>
            <option value="">Todos</option>
            {FILTROS_ESTADO.map((s) => (
              <option key={s} value={s}>
                {ROTULO_ESTADO[s]}
              </option>
            ))}
          </select>
        </label>
        <span className="filtros__total">{num(linhas.length)} na lista</span>
      </div>

      <div className="tabela-rolagem">
        <table className="tabela">
          <thead>
            <tr>
              <th scope="col" className="num">#</th>
              <th scope="col">Pedido</th>
              <th scope="col">Exceção</th>
              <th scope="col" className="num">Atraso</th>
              <th scope="col" className="num">Chance de cancelar</th>
              <th scope="col" className="num">Valor em jogo</th>
              <th scope="col" className="num">Custo de esperar</th>
              <th scope="col">Tratativa</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map(({ posicao, excecao: e }) => {
              const t = tratativas.get(e.id);
              return (
                <tr key={e.id} className={selecionado === e.id ? "selecionada" : undefined}>
                  <td className="num mudo">{posicao}</td>
                  <td>
                    <button className="link-linha" onClick={() => setSelecionado(e.id)}>
                      {e.order_id}
                    </button>
                    <small>
                      {e.descricao_produto}
                      {e.clienteVip ? " · alto valor" : ""}
                    </small>
                  </td>
                  <td>
                    {ROTULO_TIPO[e.tipo_excecao]}
                    {ctx.causasPorPedido.has(e.id) && <small>causa de processo</small>}
                  </td>
                  <td className="num">{e.atrasoAtual} d.u.</td>
                  <td className="num">{pct(e.probabilidadeCancelamentoAtual)}</td>
                  <td className="num">{brl2(e.valorEmJogo)}</td>
                  <td className="num">{brl2(e.custoDeEsperar)}</td>
                  <td>
                    <div className="chips">{t?.acoes.map((a) => <ChipAcao key={a.acao} avaliacao={a} registro={registro[e.id]} />)}</div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {item && (
        <PainelPedido
          ctx={ctx}
          item={item}
          tratativa={tratativas.get(item.excecao.id)}
          registro={registro[item.excecao.id]}
          lotes={lotes}
          despachar={despachar}
          iaAoVivo={iaAoVivo}
          aoFechar={() => setSelecionado(null)}
        />
      )}
    </div>
  );
}
