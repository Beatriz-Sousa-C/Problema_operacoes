"use client";
import { useMemo, useState } from "react";
import { estadoAcao, type EstadoAcao, type TipoExcecao } from "@/core";
import { filaDoDia, type Contexto, type PlanoDoDia } from "@/agente";
import { brl, brl2, num, pct, ROTULO_ESTADO, ROTULO_TIPO } from "./formato";
import { ChipAcao } from "./ChipAcao";
import { PainelPedido } from "./PainelPedido";
import type { AcaoRegistro, Registro } from "./registro";
import { useTratativas } from "./tratativas";

interface Props {
  ctx: Contexto;
  plano: PlanoDoDia | null;
  registro: Registro;
  despachar: (a: AcaoRegistro) => void;
  /** IA ao vivo só existe para a lista original (o agente roda no servidor) */
  iaAoVivo: boolean;
  irPara: (aba: string) => void;
}

const FILTROS_ESTADO: EstadoAcao[] = ["aguarda_aprovacao", "aguarda_foto", "aprovada", "recusada", "liberada", "bloqueada"];

/** Visão de consulta: a fila do dia inteira em tabela, com filtros. O trabalho guiado fica na aba "Hoje". */
export function Fila({ ctx, plano, registro, despachar, iaAoVivo, irPara }: Props) {
  const [tipo, setTipo] = useState<TipoExcecao | "">("");
  const [estado, setEstado] = useState<EstadoAcao | "">("");
  const [selecionado, setSelecionado] = useState<string | null>(null);

  const hoje = useMemo(() => filaDoDia(ctx), [ctx]);
  const tratativas = useTratativas(ctx, plano, registro);

  const linhas = hoje.filter(
    (i) =>
      (!tipo || i.excecao.tipo_excecao === tipo) &&
      (!estado || tratativas.get(i.excecao.id)?.acoes.some((a) => estadoAcao(a, registro[i.excecao.id]) === estado)),
  );
  const tiposHoje = [...new Set(hoje.map((i) => i.excecao.tipo_excecao))].sort();
  const valorEmJogo = hoje.reduce((s, i) => s + i.excecao.valorEmJogo, 0);
  const custoEsperarHoje = hoje.reduce((s, i) => s + i.excecao.custoDeEsperar, 0);
  const item = selecionado ? ctx.porId.get(selecionado) : undefined;

  return (
    <div className="fila">
      <header className="fila__topo">
        <div>
          <h1 className="titulo-largo titulo-largo--menor">Fila completa de hoje: {num(hoje.length)} exceções</h1>
          <p className="secao__intro">
            Ordenadas pelo quanto a perda cresce se cada pedido esperar até o fim da fila. Juntas, carregam {brl(valorEmJogo)} em jogo; tratá-las hoje
            evita {brl(custoEsperarHoje)} de perda adicional. Para trabalhar a fila passo a passo, use a aba{" "}
            <button className="botao-texto" onClick={() => irPara("hoje")}>Hoje</button>.
          </p>
        </div>
      </header>

      {plano && (
        <details className="grupos">
          <summary>Como o agente decidiu cada grupo ({plano.grupos.length})</summary>
          <ul>
            {plano.grupos.map((g) => (
              <li key={g.chave}>
                <h3>
                  {ROTULO_TIPO[g.tipo as TipoExcecao]}
                  {g.causa ? `, ligado a ${g.causa}` : ""} <span className="contagem">{g.pedidos} pedidos</span>
                </h3>
                <p>{g.plano.justificativa}</p>
                {g.plano.chamado_lote && (
                  <p className="grupos__chamado">
                    <strong>Chamado único para {g.plano.chamado_lote.destino}:</strong> {g.plano.chamado_lote.texto}
                  </p>
                )}
                <p className="grupos__fonte">{g.fonte === "agente" ? "Decidido pelo agente" : `Regras da política${g.aviso ? ` (${g.aviso})` : ""}`}</p>
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
          Ação
          <select value={estado} onChange={(e) => setEstado(e.target.value as EstadoAcao | "")}>
            <option value="">Todas</option>
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
              <th scope="col" className="num">Ordem</th>
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
                  <td className="num">{posicao}</td>
                  <td>
                    <button className="link-linha" onClick={() => setSelecionado(e.id)}>
                      {e.order_id}
                    </button>
                    <small>
                      {e.descricao_produto}
                      {e.clienteVip ? ", cliente de alto valor" : ""}
                    </small>
                  </td>
                  <td>
                    {ROTULO_TIPO[e.tipo_excecao]}
                    {ctx.causasPorPedido.has(e.id) && <small>causa sistêmica</small>}
                  </td>
                  <td className="num">{e.atrasoAtual} d.u.</td>
                  <td className="num">{pct(e.probabilidadeCancelamentoAtual)}</td>
                  <td className="num">{brl2(e.valorEmJogo)}</td>
                  <td className="num">{brl2(e.custoDeEsperar)}</td>
                  <td>
                    <div className="chips">
                      {t?.acoes.map((a) => <ChipAcao key={a.acao} avaliacao={a} registro={registro[e.id]} />)}
                    </div>
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
          despachar={despachar}
          iaAoVivo={iaAoVivo}
          aoFechar={() => setSelecionado(null)}
        />
      )}
    </div>
  );
}
