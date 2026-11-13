"use client";
import { useEffect, useRef, useState } from "react";
import { ROTULO_ACAO, type ItemFila } from "@/core";
import { investigarExcecao, type Contexto, type ResultadoInvestigacao, type TratativaPedido } from "@/agente";
import { ChipAcao } from "./ChipAcao";
import { brl2, dataBr, num1, pct, ROTULO_TIPO } from "./formato";
import { ClienteProxy } from "./llmProxy";
import type { Aprovacoes } from "./Fila";

const ROTULO_FERRAMENTA: Record<string, string> = {
  consultar_pedido: "Consultou o pedido",
  consultar_cliente: "Consultou o histórico do cliente",
  consultar_transportadora: "Consultou o desempenho da transportadora",
  verificar_causa_sistemica: "Verificou causas sistêmicas",
  consultar_politica: "Consultou a política",
  registrar_decisao: "Registrou a decisão",
};

interface Props {
  ctx: Contexto;
  item: ItemFila;
  tratativa?: TratativaPedido;
  aprovacoes: Aprovacoes;
  aoDecidir: (chave: string, d: "aprovada" | "recusada") => void;
  aoFechar: () => void;
}

export function PainelPedido({ ctx, item, tratativa, aprovacoes, aoDecidir, aoFechar }: Props) {
  const e = item.excecao;
  const [investigacao, setInvestigacao] = useState<ResultadoInvestigacao | undefined>(tratativa?.investigacao);
  const [carregando, setCarregando] = useState(false);
  const [copiado, setCopiado] = useState<number | null>(null);
  const fecharRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setInvestigacao(tratativa?.investigacao);
    setCopiado(null);
    fecharRef.current?.focus();
  }, [e.id, tratativa]);

  useEffect(() => {
    const esc = (ev: KeyboardEvent) => ev.key === "Escape" && aoFechar();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [aoFechar]);

  async function investigar() {
    setCarregando(true);
    try {
      setInvestigacao(await investigarExcecao(ctx, new ClienteProxy(), e.id));
    } finally {
      setCarregando(false);
    }
  }

  const acoes = investigacao?.avaliacoes ?? tratativa?.acoes ?? [];
  const mensagens = investigacao?.mensagens ?? tratativa?.mensagens ?? [];
  const causas = ctx.causasPorPedido.get(e.id) ?? [];

  return (
    <aside className="painel" aria-label={`Pedido ${e.order_id}`}>
      <div className="painel__topo">
        <div>
          <h2>{e.order_id}</h2>
          <p>
            {ROTULO_TIPO[e.tipo_excecao]}. {e.descricao_produto}, {brl2(e.valor)}. Posição {item.posicao} na fila.
          </p>
        </div>
        <button ref={fecharRef} className="botao-texto" onClick={aoFechar}>
          Fechar
        </button>
      </div>

      <dl className="painel__dados">
        <div><dt>Prometido ao cliente</dt><dd>{dataBr(e.data_prometida)}</dd></div>
        <div><dt>Prazo do contrato</dt><dd>{dataBr(e.prazoContratado)}</dd></div>
        <div><dt>Atraso</dt><dd>{e.atrasoAtual} dias úteis{e.perdaTravada ? " (já entregue)" : ""}</dd></div>
        <div><dt>Chance de cancelar</dt><dd>{pct(e.probabilidadeCancelamentoAtual)}</dd></div>
        <div><dt>Reembolso em risco</dt><dd>{brl2(e.componenteReembolso)}</dd></div>
        <div><dt>Recompra em risco</dt><dd>{brl2(e.componenteRecompra)}</dd></div>
        <div><dt>Compras por ano</dt><dd>{num1(e.frequenciaAnual)}{e.clienteVip ? ", alto valor" : ""}</dd></div>
        <div><dt>Custo de esperar</dt><dd>{brl2(e.custoDeEsperar)}</dd></div>
        <div><dt>Transportadora</dt><dd>{e.transportadora}, {e.cidade}/{e.uf}</dd></div>
        <div><dt>Separação</dt><dd>{e.cd}, turno da {e.turno}{e.maquina ? `, ${e.maquina}` : ""}</dd></div>
      </dl>

      {causas.length > 0 && (
        <p className="painel__causa">
          Faz parte de uma causa sistêmica: {causas.map((c) => `${c.grupo} (${num1(c.lift)}× acima do normal)`).join("; ")}.
        </p>
      )}

      <section>
        <h3>Tratativa</h3>
        {investigacao?.aviso && <p className="aviso">{investigacao.aviso}</p>}
        <ul className="painel__acoes">
          {acoes.map((a) => {
            const chave = `${e.id}|${a.acao}`;
            return (
              <li key={a.acao}>
                <ChipAcao avaliacao={a} decisao={aprovacoes[chave]} />
                <span className="painel__motivo">{a.motivo}{a.custoEstimado && !a.motivo.includes("R$") ? `. Custo ${brl2(a.custoEstimado)}` : ""}</span>
                {a.status === "aguardando_aprovacao" && !aprovacoes[chave] && (
                  <span className="painel__aprovar">
                    <button className="botao botao--pequeno" onClick={() => aoDecidir(chave, "aprovada")}>
                      Aprovar {ROTULO_ACAO[a.acao].toLowerCase()}
                    </button>
                    <button className="botao-texto" onClick={() => aoDecidir(chave, "recusada")}>
                      Recusar
                    </button>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
        {investigacao && <p className="painel__justificativa">{investigacao.decisao.justificativa}</p>}
        {investigacao?.decisao.chamado && (
          <p className="painel__chamado">
            <strong>Chamado para {investigacao.decisao.chamado.destino}:</strong> {investigacao.decisao.chamado.texto}
          </p>
        )}
      </section>

      <section>
        <h3>{mensagens.length > 1 ? "Mensagens para o cliente" : "Mensagem para o cliente"}</h3>
        <ol className="mensagens">
          {mensagens.map((m, i) => {
            const aprovada = acoes.some((a) => a.status === "aguardando_aprovacao" && aprovacoes[`${e.id}|${a.acao}`] === "aprovada");
            const liberada = m.status === "automatica" || (m.status === "aguardando_aprovacao" && aprovada);
            return (
              <li key={i}>
                <span className="mensagens__status">
                  {m.status === "automatica" ? "Sai agora. " : m.status === "aguarda_foto" ? "Sai depois da foto. " : liberada ? "Liberada pela aprovação. " : "Espera a aprovação. "}
                  {m.motivo}.
                </span>
                <blockquote className={`mensagem${liberada ? "" : " mensagem--espera"}`}>{m.texto}</blockquote>
                <button className="botao-texto" onClick={() => navigator.clipboard.writeText(m.texto).then(() => setCopiado(i))}>
                  {copiado === i ? "Mensagem copiada" : "Copiar mensagem"}
                </button>
              </li>
            );
          })}
        </ol>
      </section>

      <section>
        <h3>Investigação do agente</h3>
        {investigacao?.trilha.length ? (
          <ol className="trilha">
            {investigacao.trilha.map((p, i) => (
              <li key={i}>
                <details>
                  <summary>{ROTULO_FERRAMENTA[p.ferramenta] ?? p.ferramenta}</summary>
                  <pre>{JSON.stringify(p.ferramenta === "registrar_decisao" ? p.argumentos : p.resultado, null, 2)}</pre>
                </details>
              </li>
            ))}
          </ol>
        ) : (
          <p className="secao__intro">Este pedido foi tratado pela decisão do grupo. Peça uma investigação individual para ver o agente consultando o sistema.</p>
        )}
        {investigacao && investigacao.fonte === "agente" && (
          <p className="painel__meta">
            {investigacao.modelo}, {investigacao.tokens} tokens
          </p>
        )}
        <button className="botao" onClick={investigar} disabled={carregando}>
          {carregando ? "O agente está investigando…" : investigacao ? "Investigar de novo com o agente" : "Investigar com o agente"}
        </button>
      </section>
    </aside>
  );
}
