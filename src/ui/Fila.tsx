"use client";
import { useMemo, useState } from "react";
import { type StatusAcao, type TipoExcecao } from "@/core";
import { filaDoDia, gerarPlanoDoDia, type Contexto, type PlanoDoDia } from "@/agente";
import { brl, brl2, num, pct, ROTULO_TIPO } from "./formato";
import { ChipAcao } from "./ChipAcao";
import { PainelPedido } from "./PainelPedido";
import { ClienteProxy } from "./llmProxy";

interface Props {
  ctx: Contexto;
  plano: PlanoDoDia | null;
  fonte: "agente" | "regras";
  aoTrocarPlano: (p: PlanoDoDia) => void;
}

export type Aprovacoes = Record<string, "aprovada" | "recusada">;

export function Fila({ ctx, plano, fonte, aoTrocarPlano }: Props) {
  const [tipo, setTipo] = useState<TipoExcecao | "">("");
  const [status, setStatus] = useState<StatusAcao | "">("");
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [aprovacoes, setAprovacoes] = useState<Aprovacoes>({});
  const [progresso, setProgresso] = useState<string | null>(null);

  const hoje = useMemo(() => filaDoDia(ctx), [ctx]);
  const tratativas = useMemo(() => new Map(plano?.tratativas.map((t) => [t.id, t]) ?? []), [plano]);
  const linhas = hoje.filter(
    (i) =>
      (!tipo || i.excecao.tipo_excecao === tipo) &&
      (!status || tratativas.get(i.excecao.id)?.acoes.some((a) => a.status === status)),
  );
  const tiposHoje = [...new Set(hoje.map((i) => i.excecao.tipo_excecao))].sort();
  const valorEmJogo = hoje.reduce((s, i) => s + i.excecao.valorEmJogo, 0);
  const custoEsperarHoje = hoje.reduce((s, i) => s + i.excecao.custoDeEsperar, 0);

  async function gerarAoVivo() {
    setProgresso("Iniciando o agente…");
    try {
      const novo = await gerarPlanoDoDia(ctx, new ClienteProxy(), { casosEspeciais: 2, aoProgredir: setProgresso });
      aoTrocarPlano(novo);
      setProgresso(novo.grupos.some((g) => g.fonte === "agente") ? null : "O agente não respondeu; o plano continua pelas regras da política.");
    } catch (e) {
      setProgresso(e instanceof Error ? e.message : "Falha ao gerar o plano");
    }
  }

  const item = selecionado ? ctx.porId.get(selecionado) : undefined;

  return (
    <div className="fila">
      <header className="fila__topo">
        <div>
          <h1 className="titulo-largo titulo-largo--menor">Fila de hoje: {num(hoje.length)} exceções</h1>
          <p className="secao__intro">
            Ordenadas pelo quanto a perda cresce se cada pedido esperar até o fim da fila. Juntas, carregam {brl(valorEmJogo)} em jogo; tratá-las hoje
            evita {brl(custoEsperarHoje)} de perda adicional.
          </p>
        </div>
        {plano && (
          <div className="plano">
            <p className="plano__fonte">
              {fonte === "agente" || plano.grupos.some((g) => g.fonte === "agente") ? (
                <>
                  Plano decidido pelo agente de IA{plano.modelo ? ` (${plano.modelo})` : ""}: {plano.grupos.length} grupos e{" "}
                  {plano.tratativas.filter((t) => t.investigacao?.fonte === "agente").length} investigações individuais.
                </>
              ) : (
                <>Plano pelas regras da política. O agente não estava disponível quando este plano foi gerado.</>
              )}
            </p>
            <dl className="plano__numeros">
              <div>
                <dt>Ações automáticas</dt>
                <dd>{num(plano.resumo.automaticas)}</dd>
              </div>
              <div>
                <dt>Esperam a foto do cliente</dt>
                <dd>{num(plano.resumo.aguardandoFoto)}</dd>
              </div>
              <div>
                <dt>Precisam de aprovação</dt>
                <dd>{num(plano.resumo.aguardandoAprovacao)}</dd>
              </div>
              <div>
                <dt>Mensagens que saem agora</dt>
                <dd>{num(plano.resumo.mensagensAgora)}</dd>
              </div>
              <div>
                <dt>Custo já liberado</dt>
                <dd>{brl(plano.resumo.custoAutomatico)}</dd>
              </div>
              <div>
                <dt>Custo em aprovação</dt>
                <dd>{brl(plano.resumo.custoEmAprovacao)}</dd>
              </div>
            </dl>
            <button className="botao" onClick={gerarAoVivo} disabled={progresso !== null && !progresso.includes("não")}>
              Gerar o plano de novo com o agente
            </button>
            {progresso && <p className="plano__progresso" role="status">{progresso}</p>}
          </div>
        )}
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
          <select value={status} onChange={(e) => setStatus(e.target.value as StatusAcao | "")}>
            <option value="">Todas</option>
            <option value="aguardando_aprovacao">Precisa de aprovação</option>
            <option value="automatica">Automática</option>
            <option value="aguarda_foto">Depois da foto</option>
            <option value="bloqueada">Bloqueada</option>
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
                      {t?.acoes.map((a) => <ChipAcao key={a.acao} avaliacao={a} decisao={aprovacoes[`${e.id}|${a.acao}`]} />)}
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
          aprovacoes={aprovacoes}
          aoDecidir={(chave, d) => setAprovacoes((a) => ({ ...a, [chave]: d }))}
          aoFechar={() => setSelecionado(null)}
        />
      )}
    </div>
  );
}
