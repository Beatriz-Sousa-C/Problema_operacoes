"use client";
import { useEffect, useRef, useState } from "react";
import { estadoAcao, estadoMensagem, podeDecidir, REGISTRO_VAZIO, ROTULO_ACAO, type EstadoMensagem, type ItemFila } from "@/core";
import type { Contexto, PassoTrilha, TratativaPedido } from "@/agente";
import { ChipAcao } from "./ChipAcao";
import { Aviso, Badge, Icone } from "./componentes";
import { brl2, dataBr, num1, pct, ROTULO_TIPO } from "./formato";
import { investigarNoServidor } from "./agenteApi";
import { linkDoPedido } from "./estado";
import { chaveAcao, chaveMensagem, chaveRecusa, loteDoItem, type Lote } from "./lotes";
import type { AcaoRegistro, RegistroExcecao } from "./registro";

const ROTULO_FERRAMENTA: Record<string, string> = {
  consultar_pedido: "Consultou o pedido",
  consultar_cliente: "Consultou o histórico do cliente",
  consultar_transportadora: "Consultou o desempenho da transportadora",
  verificar_causa_sistemica: "Verificou causas de processo",
  consultar_politica: "Consultou a política",
  registrar_decisao: "Registrou a decisão",
};

const ROTULO_MENSAGEM: Record<EstadoMensagem, string> = {
  enviar_agora: "Pode sair agora",
  espera_foto: "Sai depois da foto",
  espera_aprovacao: "Espera a aprovação",
  cancelada: "Não enviar: uma ação anunciada foi recusada",
};

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : null);
const reais = (v: unknown) => (typeof v === "number" ? brl2(v) : "—");

/** Uma linha em linguagem simples com o que o agente viu em cada passo. */
export function resumirPasso(p: PassoTrilha): string {
  const r = obj(p.resultado);
  if (r?.erro) return `Erro: ${String(r.erro)}`;
  switch (p.ferramenta) {
    case "consultar_pedido": {
      const risco = obj(r?.risco);
      return r
        ? `${String(r.tipo_excecao)}, ${String(risco?.atraso_dias_uteis_vs_prometido ?? "?")} dias úteis de atraso, ${reais(risco?.valor_em_jogo)} em jogo, posição ${String(r.posicao_na_fila)} na fila.`
        : "";
    }
    case "consultar_cliente":
      return r
        ? `${String(r.pedidos_desde_o_primeiro)} pedidos, ${reais(r.receita_acumulada)} de receita, ${num1(Number(r.compras_por_ano_estimadas ?? 0))} compras por ano, ${
            r.alto_valor ? "alto valor" : "cliente comum"
          }, ${Array.isArray(r.excecoes_abertas) ? r.excecoes_abertas.length : 0} exceções abertas.`
        : "";
    case "consultar_transportadora":
      return r
        ? `SLA de ${String(r.sla_contratado_dias_uteis)} dias úteis; ${pct(Number(r.parcela_atraso_ou_rastreio_parado ?? 0))} de atraso ou rastreio parado na região, contra ${pct(
            Number(r.mesma_parcela_nas_outras_transportadoras_da_regiao ?? 0),
          )} nas outras transportadoras.`
        : "";
    case "verificar_causa_sistemica": {
      const causas = Array.isArray(r?.causas) ? (r!.causas as Obj[]) : [];
      const partes = causas.length
        ? [`Faz parte de ${causas.map((c) => `${String(c.causa)} (${num1(Number(c.vezes_acima_do_normal ?? 0))}× acima do normal)`).join("; ")}.`]
        : ["Não faz parte de nenhuma causa de processo."];
      if (r?.promessa_de_prazo_errada) partes.push("A data prometida estava errada: a transportadora está dentro do contrato.");
      return partes.join(" ");
    }
    case "consultar_politica":
      return r ? `Permitidas: ${(r.acoes_permitidas as string[] | undefined)?.join(", ") ?? ""}.${r.exige_foto_antes_da_solucao ? " Exige foto antes da solução." : ""}` : "";
    case "registrar_decisao": {
      const a = obj(p.argumentos);
      return a ? `Ações: ${(a.acoes as string[] | undefined)?.join(", ") ?? ""}. Confiança ${String(a.confianca ?? "")}.` : "";
    }
    default:
      return "";
  }
}

interface Props {
  ctx: Contexto;
  item: ItemFila;
  /** Tratativa em vigor: a do grupo ou, se houver, a da investigação individual */
  tratativa?: TratativaPedido;
  registro?: RegistroExcecao;
  /** Lotes exportados: mostra em qual lote cada ação ou mensagem saiu */
  lotes?: Lote[];
  despachar: (a: AcaoRegistro) => void;
  /** IA ao vivo só existe para a lista original (o agente roda no servidor) */
  iaAoVivo: boolean;
  aoFechar: () => void;
}

export function PainelPedido({ ctx, item, tratativa, registro = REGISTRO_VAZIO, lotes = [], despachar, iaAoVivo, aoFechar }: Props) {
  const e = item.excecao;
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [copiado, setCopiado] = useState<number | null>(null);
  const [linkCopiado, setLinkCopiado] = useState(false);
  const fecharRef = useRef<HTMLButtonElement>(null);
  const investigacao = tratativa?.investigacao;

  useEffect(() => {
    setCopiado(null);
    setLinkCopiado(false);
    setErro(null);
    fecharRef.current?.focus();
  }, [e.id]);

  useEffect(() => {
    const esc = (ev: KeyboardEvent) => ev.key === "Escape" && aoFechar();
    window.addEventListener("keydown", esc);
    const anterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", esc);
      document.body.style.overflow = anterior;
    };
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
    <>
      <div className="gaveta__fundo" onClick={aoFechar} aria-hidden="true" />
      <aside className="gaveta" role="dialog" aria-modal="true" aria-label={`Pedido ${e.order_id}`}>
        <div className="gaveta__topo">
          <div>
            <div className="botoes" style={{ gap: 8, marginBottom: 6 }}>
              <Badge tom="neutro">{ROTULO_TIPO[e.tipo_excecao]}</Badge>
              {e.clienteVip && <Badge tom="agente">Cliente de alto valor</Badge>}
              {e.perdaTravada && <Badge tom="regras">Já entregue</Badge>}
            </div>
            <h2>{e.order_id}</h2>
            <p>
              {e.descricao_produto}, {brl2(e.valor)}. Posição {item.posicao} na fila.{" "}
              <button className="botao-texto" onClick={() => navigator.clipboard.writeText(linkDoPedido(e.order_id)).then(() => setLinkCopiado(true))}>
                {linkCopiado ? "Link copiado" : "Copiar link do pedido"}
              </button>
            </p>
          </div>
          <button ref={fecharRef} className="gaveta__fechar" onClick={aoFechar} aria-label="Fechar">
            <Icone nome="fechar" />
          </button>
        </div>

        <div className="gaveta__corpo">
          <section>
            <h3>Situação</h3>
            <dl className="ficha">
              <div>
                <dt>Prometido ao cliente</dt>
                <dd>{dataBr(e.data_prometida)}</dd>
              </div>
              <div>
                <dt>Prazo do contrato</dt>
                <dd>
                  {dataBr(e.prazoContratado)}
                  {e.slaEstimado ? " (SLA estimado)" : ""}
                </dd>
              </div>
              <div>
                <dt>Atraso</dt>
                <dd>{e.atrasoAtual} dias úteis</dd>
              </div>
              <div>
                <dt>Chance de cancelar</dt>
                <dd>{pct(e.probabilidadeCancelamentoAtual)}</dd>
              </div>
              <div>
                <dt>Reembolso em risco</dt>
                <dd>{brl2(e.componenteReembolso)}</dd>
              </div>
              <div>
                <dt>Recompra em risco</dt>
                <dd>
                  {brl2(e.componenteRecompra)}
                  {e.excecoesDoCliente > 1 ? ` (dividida entre ${e.excecoesDoCliente} exceções)` : ""}
                </dd>
              </div>
              <div>
                <dt>Compras por ano</dt>
                <dd>{num1(e.frequenciaAnual)}</dd>
              </div>
              <div>
                <dt>Custo de esperar</dt>
                <dd>{brl2(e.custoDeEsperar)}</dd>
              </div>
              <div>
                <dt>Transportadora</dt>
                <dd>
                  {e.transportadora}, {e.cidade}/{e.uf}
                </dd>
              </div>
              <div>
                <dt>Separação</dt>
                <dd>
                  {e.cd}, turno da {e.turno}
                  {e.maquina ? `, ${e.maquina}` : ""}
                </dd>
              </div>
            </dl>
            {causas.length > 0 && (
              <Aviso tom="atencao">
                Faz parte de uma causa de processo: {causas.map((c) => `${c.grupo} (${num1(c.lift)}× acima do normal)`).join("; ")}.
              </Aviso>
            )}
          </section>

          <section>
            <h3>Tratativa</h3>
            {investigacao?.aviso && <Aviso tom="atencao">{investigacao.aviso}</Aviso>}
            <ul className="acoes-pedido">
              {acoes.map((a) => {
                const estado = estadoAcao(a, registro);
                const lote = loteDoItem(lotes, estado === "recusada" ? chaveRecusa(e.id, a.acao) : chaveAcao(e.id, a.acao));
                return (
                <li key={a.acao}>
                  <div className="botoes" style={{ justifyContent: "space-between" }}>
                    <span className="botoes" style={{ gap: 6 }}>
                      <ChipAcao avaliacao={a} registro={registro} />
                      {lote !== null && <Badge tom="ok">Exportada no lote {lote}</Badge>}
                    </span>
                    {a.acao === "solicitar_foto" && esperaFoto && (
                      <button className="botao botao--secundario botao--pequeno" onClick={() => despachar({ tipo: "foto_recebida", id: e.id })}>
                        Foto recebida
                      </button>
                    )}
                    {podeDecidir(a, registro) && (
                      <span className="botoes">
                        <button className="botao botao--pequeno" onClick={() => despachar({ tipo: "decidir", id: e.id, acao: a.acao, decisao: "aprovada" })}>
                          Aprovar {ROTULO_ACAO[a.acao].toLowerCase()}
                        </button>
                        <button className="botao-texto botao-texto--perigo" onClick={() => despachar({ tipo: "decidir", id: e.id, acao: a.acao, decisao: "recusada" })}>
                          Recusar
                        </button>
                      </span>
                    )}
                  </div>
                  <span className="acoes-pedido__motivo">
                    {a.motivo}
                    {a.custoEstimado && !a.motivo.includes("R$") ? `. Custo ${brl2(a.custoEstimado)}` : ""}
                  </span>
                </li>
                );
              })}
            </ul>
            {investigacao && <p className="justificativa">{investigacao.decisao.justificativa}</p>}
            {investigacao?.decisao.chamado && (
              <p className="chamado">
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
                const lote = loteDoItem(lotes, chaveMensagem(e.id, i));
                return (
                  <li key={i}>
                    <span className="mensagens__status">
                      <Badge tom={enviada ? "ok" : liberada ? "ok" : estado === "cancelada" ? "critico" : "neutro"}>{enviada ? "Enviada" : ROTULO_MENSAGEM[estado]}</Badge>
                      {lote !== null && <Badge tom="ok">Lote {lote}</Badge>}
                      <span>{m.motivo}.</span>
                    </span>
                    <blockquote className={`mensagem${liberada ? "" : " mensagem--espera"}`}>{m.texto}</blockquote>
                    {liberada && (
                      <span className="botoes">
                        <button className="botao-texto" onClick={() => navigator.clipboard.writeText(m.texto).then(() => setCopiado(i))}>
                          {copiado === i ? "Copiada" : "Copiar"}
                        </button>
                        {!enviada && (
                          <button className="botao botao--secundario botao--pequeno" onClick={() => despachar({ tipo: "mensagem_enviada", id: e.id, indice: i })}>
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
                  <li key={i} className={p.ferramenta === "registrar_decisao" ? "trilha--fim" : undefined}>
                    <div className="trilha__ferramenta">{ROTULO_FERRAMENTA[p.ferramenta] ?? p.ferramenta}</div>
                    <div className="trilha__resumo">{resumirPasso(p)}</div>
                    <details>
                      <summary>Ver o que a ferramenta devolveu</summary>
                      <pre>{JSON.stringify(p.ferramenta === "registrar_decisao" ? p.argumentos : p.resultado, null, 2)}</pre>
                    </details>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="suave">
                Este pedido segue a decisão do grupo. Peça uma investigação individual para ver o agente consultando o pedido, o cliente, a transportadora e a política
                antes de decidir.
              </p>
            )}
            {investigacao && investigacao.fonte === "agente" && (
              <p className="meta">
                {investigacao.modelo}, {investigacao.tokens} tokens
              </p>
            )}
            {erro && <Aviso tom="critico">{erro}</Aviso>}
            {iaAoVivo ? (
              <button className="botao" onClick={investigar} disabled={carregando} style={{ justifySelf: "start" }}>
                <Icone nome="agente" className="icone-botao" />
                {carregando ? "O agente está investigando…" : investigacao ? "Investigar de novo com o agente" : "Investigar com o agente"}
              </button>
            ) : (
              <p className="suave">A IA ao vivo só funciona com a lista original; esta lista usa as regras da política.</p>
            )}
          </section>
        </div>
      </aside>
    </>
  );
}
