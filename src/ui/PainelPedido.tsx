"use client";
import { useEffect, useRef, useState } from "react";
import { estadoAcao, estadoMensagem, podeDecidir, REGISTRO_VAZIO, ROTULO_ACAO, type EstadoMensagem, type ItemFila } from "@/core";
import type { Contexto, TratativaPedido } from "@/agente";
import { ChipAcao } from "./ChipAcao";
import { brl2, dataBr, num1, pct, ROTULO_TIPO } from "./formato";
import { investigarNoServidor } from "./agenteApi";
import type { AcaoRegistro, RegistroExcecao } from "./registro";

const ROTULO_FERRAMENTA: Record<string, string> = {
  consultar_pedido: "Consultou o pedido",
  consultar_cliente: "Consultou o histórico do cliente",
  consultar_transportadora: "Consultou o desempenho da transportadora",
  verificar_causa_sistemica: "Verificou causas sistêmicas",
  consultar_politica: "Consultou a política",
  registrar_decisao: "Registrou a decisão",
};

const ROTULO_MENSAGEM: Record<EstadoMensagem, string> = {
  enviar_agora: "Pode sair agora.",
  espera_foto: "Sai depois da foto.",
  espera_aprovacao: "Espera a aprovação.",
  cancelada: "Não enviar: uma ação anunciada foi recusada.",
};

interface Props {
  ctx: Contexto;
  item: ItemFila;
  /** Tratativa em vigor: a do grupo ou, se houver, a da investigação individual */
  tratativa?: TratativaPedido;
  registro?: RegistroExcecao;
  despachar: (a: AcaoRegistro) => void;
  /** IA ao vivo só existe para a lista original (o agente roda no servidor) */
  iaAoVivo: boolean;
  aoFechar: () => void;
}

export function PainelPedido({ ctx, item, tratativa, registro = REGISTRO_VAZIO, despachar, iaAoVivo, aoFechar }: Props) {
  const e = item.excecao;
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [copiado, setCopiado] = useState<number | null>(null);
  const fecharRef = useRef<HTMLButtonElement>(null);
  const investigacao = tratativa?.investigacao;

  useEffect(() => {
    setCopiado(null);
    setErro(null);
    fecharRef.current?.focus();
  }, [e.id]);

  useEffect(() => {
    const esc = (ev: KeyboardEvent) => ev.key === "Escape" && aoFechar();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [aoFechar]);

  async function investigar() {
    setCarregando(true);
    setErro(null);
    try {
      despachar({ tipo: "investigacao", id: e.id, resultado: await investigarNoServidor(e.id) });
    } catch (x) {
      setErro(x instanceof Error ? x.message : "Falha ao falar com o servidor");
    } finally {
      setCarregando(false);
    }
  }

  const acoes = tratativa?.acoes ?? [];
  const mensagens = tratativa?.mensagens ?? [];
  const causas = ctx.causasPorPedido.get(e.id) ?? [];
  const esperaFoto = acoes.some((a) => estadoAcao(a, registro) === "aguarda_foto");

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
        <div><dt>Prazo do contrato</dt><dd>{dataBr(e.prazoContratado)}{e.slaEstimado ? " (SLA estimado)" : ""}</dd></div>
        <div><dt>Atraso</dt><dd>{e.atrasoAtual} dias úteis{e.perdaTravada ? " (já entregue)" : ""}</dd></div>
        <div><dt>Chance de cancelar</dt><dd>{pct(e.probabilidadeCancelamentoAtual)}</dd></div>
        <div><dt>Reembolso em risco</dt><dd>{brl2(e.componenteReembolso)}</dd></div>
        <div>
          <dt>Recompra em risco</dt>
          <dd>
            {brl2(e.componenteRecompra)}
            {e.excecoesDoCliente > 1 ? ` (dividida entre ${e.excecoesDoCliente} exceções do cliente)` : ""}
          </dd>
        </div>
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
          {acoes.map((a) => (
            <li key={a.acao}>
              <ChipAcao avaliacao={a} registro={registro} />
              <span className="painel__motivo">{a.motivo}{a.custoEstimado && !a.motivo.includes("R$") ? `. Custo ${brl2(a.custoEstimado)}` : ""}</span>
              {a.acao === "solicitar_foto" && esperaFoto && (
                <span className="painel__aprovar">
                  <button className="botao botao--pequeno" onClick={() => despachar({ tipo: "foto_recebida", id: e.id })}>
                    Foto recebida
                  </button>
                </span>
              )}
              {podeDecidir(a, registro) && (
                <span className="painel__aprovar">
                  <button className="botao botao--pequeno" onClick={() => despachar({ tipo: "decidir", id: e.id, acao: a.acao, decisao: "aprovada" })}>
                    Aprovar {ROTULO_ACAO[a.acao].toLowerCase()}
                  </button>
                  <button className="botao-texto" onClick={() => despachar({ tipo: "decidir", id: e.id, acao: a.acao, decisao: "recusada" })}>
                    Recusar
                  </button>
                </span>
              )}
            </li>
          ))}
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
            const estado = estadoMensagem(m, acoes, registro);
            const liberada = estado === "enviar_agora";
            const enviada = liberada && (registro.enviadas ?? []).includes(i);
            return (
              <li key={i}>
                <span className="mensagens__status">
                  {enviada ? "Enviada." : ROTULO_MENSAGEM[estado]} {m.motivo}.
                </span>
                <blockquote className={`mensagem${liberada ? "" : " mensagem--espera"}`}>{m.texto}</blockquote>
                {liberada && (
                  <span className="lista-simples__botoes">
                    <button className="botao-texto" onClick={() => navigator.clipboard.writeText(m.texto).then(() => setCopiado(i))}>
                      {copiado === i ? "Mensagem copiada" : "Copiar mensagem"}
                    </button>
                    {!enviada && (
                      <button className="botao botao--pequeno" onClick={() => despachar({ tipo: "mensagem_enviada", id: e.id, indice: i })}>
                        Marcar como enviada
                      </button>
                    )}
                  </span>
                )}
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
        {erro && <p className="aviso">{erro}</p>}
        {iaAoVivo ? (
          <button className="botao" onClick={investigar} disabled={carregando}>
            {carregando ? "O agente está investigando…" : investigacao ? "Investigar de novo com o agente" : "Investigar com o agente"}
          </button>
        ) : (
          <p className="secao__intro">A IA ao vivo só funciona com a lista original; esta lista usa as regras da política.</p>
        )}
      </section>
    </aside>
  );
}
