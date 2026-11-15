"use client";
/**
 * Central do dia: o que o agente já fez e o que falta a pessoa fazer, em 3 passos.
 *  1. Decidir o que envolve dinheiro (por grupo, com a recomendação do agente)
 *  2. Registrar as fotos que os clientes mandarem
 *  3. Enviar as mensagens prontas
 */
import { useState } from "react";
import { ROTULO_ACAO, type BaseDados } from "@/core";
import type { Contexto, PlanoDoDia } from "@/agente";
import { Exportar } from "./Exportar";
import { PainelPedido } from "./PainelPedido";
import { gerarPlanoNoServidor } from "./agenteApi";
import { Aviso, Badge, BadgeFonte, Cabecalho, Icone, Vazio } from "./componentes";
import { brl, brl2, dataHora, num, pct, plural, ROTULO_TIPO, tituloGrupo } from "./formato";
import { usePedidoSelecionado } from "./estado";
import type { AcaoLotes, Lote } from "./lotes";
import type { AcaoRegistro, Registro } from "./registro";
import type { AtividadeAgente, BlocoMensagens, Dia, Pendencia, Placar } from "./tratativas";

interface Props {
  ctx: Contexto;
  base: BaseDados;
  plano: PlanoDoDia | null;
  dia: Dia;
  atividade: AtividadeAgente;
  placar: Placar;
  aoTrocarPlano: (p: PlanoDoDia) => void;
  registro: Registro;
  despachar: (a: AcaoRegistro) => void;
  lotes: Lote[];
  despacharLotes: (a: AcaoLotes) => void;
  /** IA ao vivo só existe para a lista original (o agente roda no servidor) */
  iaAoVivo: boolean;
  irPara: (aba: string) => void;
}

export function Hoje({ ctx, base, plano, dia, atividade: at, placar, aoTrocarPlano, registro, despachar, lotes, despacharLotes, iaAoVivo, irPara }: Props) {
  const [selecionado, setSelecionado] = usePedidoSelecionado(ctx);
  const [gerando, setGerando] = useState(false);
  const [progresso, setProgresso] = useState<string | null>(null);
  const item = selecionado ? ctx.porId.get(selecionado) : undefined;

  if (!plano) return <Aviso tom="info">Preparando o plano do dia…</Aviso>;

  const quem = at.ligado ? "agente" : "sistema";
  const pronto = dia.total > 0 && dia.concluidos === dia.total;

  async function gerarAoVivo() {
    setGerando(true);
    setProgresso("Iniciando o agente…");
    try {
      const novo = await gerarPlanoNoServidor(ctx, setProgresso);
      aoTrocarPlano(novo);
      setProgresso(novo.grupos.some((g) => g.fonte === "agente") ? null : "O agente não respondeu; o plano continua pelas regras da política.");
    } catch (e) {
      setProgresso(e instanceof Error ? e.message : "Falha ao gerar o plano");
    } finally {
      setGerando(false);
    }
  }

  return (
    <div className="pagina">
      <Cabecalho
        sobre={`Fila de hoje · ${num(dia.total)} pedidos`}
        titulo="Trabalho de hoje"
        texto={
          at.ligado
            ? "O agente analisou a fila, escolheu as ações e escreveu as mensagens. Você decide o que envolve dinheiro, registra as fotos e envia."
            : "O agente de IA está desligado: valem as regras padrão da política. Você decide o que envolve dinheiro, registra as fotos e envia."
        }
        acoes={
          <div className="progresso" style={{ minWidth: 260 }}>
            <div className="progresso__texto">
              <span>Pedidos concluídos hoje</span>
              <strong>
                {num(dia.concluidos)} de {num(dia.total)}
              </strong>
            </div>
            <div className={`progresso__barra${pronto ? " progresso__barra--ok" : ""}`} aria-hidden="true">
              <span style={{ width: `${dia.total ? (dia.concluidos / dia.total) * 100 : 0}%` }} />
            </div>
          </div>
        }
      />

      {!at.ligado && (
        <Aviso tom="atencao">
          <strong>Agente desligado.</strong> Falta configurar a chave da Groq (GROQ_API_KEY) no servidor. O que aparece abaixo é a tratativa padrão da política, sem
          a análise do agente.{" "}
          <button className="botao-texto" onClick={() => irPara("metodo")}>
            O que o agente faz quando está ligado
          </button>
        </Aviso>
      )}

      <section className="cartao" aria-label="O que o agente já fez">
        <div className="cartao__cabeca">
          <div>
            <h2>
              {at.ligado ? (
                <Badge tom="agente" icone="agente">
                  Feito pelo agente
                </Badge>
              ) : (
                <Badge tom="regras">Feito pela política padrão</Badge>
              )}
            </h2>
            <p>
              {at.ligado && at.modelo ? `Modelo ${at.modelo}` : "Sem modelo de IA"}
              {at.geradoEm ? ` · plano gerado em ${dataHora(at.geradoEm)}` : ""}
              {at.tokens ? ` · ${num(at.tokens)} tokens` : ""}
            </p>
          </div>
          <div className="botoes">
            {iaAoVivo ? (
              <button className="botao botao--secundario" onClick={gerarAoVivo} disabled={gerando}>
                <Icone nome="agente" className="icone-botao" />
                {gerando ? "O agente está trabalhando…" : "Pedir ao agente um plano novo"}
              </button>
            ) : (
              <span className="mudo">A IA ao vivo só funciona com a lista original.</span>
            )}
            {Object.keys(registro).length > 0 && (
              <button
                className="botao-texto botao-texto--mudo"
                onClick={() => {
                  if (!window.confirm("Apagar fotos, aprovações, recusas, envios e lotes exportados registrados nesta lista?")) return;
                  despachar({ tipo: "limpar" });
                  despacharLotes({ tipo: "limpar" });
                }}
              >
                Recomeçar o dia
              </button>
            )}
          </div>
        </div>
        <dl className="atividade">
          <div>
            <dt>Grupos decididos</dt>
            <dd>{num(at.grupos)}</dd>
          </div>
          <div>
            <dt>Chamados em lote</dt>
            <dd>{num(at.chamados.length)}</dd>
          </div>
          <div>
            <dt>Transportadoras acionadas</dt>
            <dd>{num(at.transportadoras)}</dd>
          </div>
          <div>
            <dt>Casos investigados um a um</dt>
            <dd>{num(at.investigados)}</dd>
          </div>
          <div>
            <dt>Mensagens escritas</dt>
            <dd>{num(at.mensagens)}</dd>
          </div>
          <div>
            <dt>Planos de correção</dt>
            <dd>
              <button className="botao-texto" onClick={() => irPara("causas")}>
                {num(at.planosCorrecao)}
              </button>
            </dd>
          </div>
        </dl>
        <p className="placar">
          {placar.decididas > 0 ? (
            <>
              <strong>Confiança no {quem} hoje:</strong> você aprovou {num(placar.aprovadas)} de {num(placar.decididas)} recomendações ({pct(placar.taxa ?? 0)}).
              {placar.recusasPorTipo.length > 0 && (
                <>
                  {" "}
                  Recusas: {placar.recusasPorTipo.map((r) => `${ROTULO_ACAO[r.acao]} em ${ROTULO_TIPO[r.tipo].toLowerCase()} (${num(r.recusadas)})`).join(", ")}.
                </>
              )}
            </>
          ) : (
            <>
              <strong>Confiança no {quem}:</strong> ainda sem decisões hoje. Conforme você aprova ou recusa, o placar aparece aqui e mostra onde o {quem} acerta e onde erra.
            </>
          )}
        </p>
        {at.chamados.length > 0 && (
          <details>
            <summary>
              Ver os {num(at.chamados.length)} chamados em lote <span className="mudo">(uma mensagem por área, cobrindo o lote inteiro)</span>
            </summary>
            <ul className="chamados">
              {at.chamados.map((c, i) => (
                <li key={i}>
                  <strong>Para {c.destino}</strong> ({plural(c.pedidos, "pedido", "pedidos")}): {c.texto}
                </li>
              ))}
            </ul>
          </details>
        )}
        {progresso && (
          <Aviso tom="info">
            <span role="status">{progresso}</span>
          </Aviso>
        )}
      </section>

      <Exportar ctx={ctx} base={base} dia={dia} registro={registro} plano={plano} modelo={at.ligado ? at.modelo : undefined} lotes={lotes} despacharLotes={despacharLotes} />

      <section className="passo" aria-labelledby="passo-1">
        <div className="passo__cabeca">
          <span className={`passo__numero${dia.pendencias.length === 0 ? " passo__numero--feito" : ""}`}>1</span>
          <h2 id="passo-1">Para você decidir</h2>
          <span className="passo__contagem">{plural(dia.nDecidir, "ação com dinheiro", "ações com dinheiro")} em {plural(dia.nCartoes, "grupo", "grupos")}</span>
        </div>
        <p className="passo__texto">
          Tudo o que envolve dinheiro passa por você. O {quem} agrupou os casos parecidos e explica por que recomenda cada ação. Aprove o grupo de uma vez ou abra a
          lista para decidir caso a caso. O que você aprovar entra na próxima planilha.
        </p>
        {dia.pendencias.length === 0 && <Vazio>Nada esperando a sua decisão.</Vazio>}
        {dia.pendencias.map((p) => (
          <CartaoPendencia key={p.chave} p={p} despachar={despachar} abrir={setSelecionado} />
        ))}
      </section>

      <section className="passo" aria-labelledby="passo-2">
        <div className="passo__cabeca">
          <span className={`passo__numero${dia.esperandoCliente.length === 0 ? " passo__numero--feito" : ""}`}>2</span>
          <h2 id="passo-2">Esperando o cliente</h2>
          <span className="passo__contagem">{plural(dia.esperandoCliente.length, "pedido", "pedidos")}</span>
        </div>
        <p className="passo__texto">
          Em avaria, vazamento e erro de personalização, o pedido de foto já saiu. Quando a foto chegar, registre aqui: o caso vai para o passo 1.
        </p>
        {dia.esperandoCliente.length === 0 ? (
          <Vazio>Nenhum pedido esperando foto.</Vazio>
        ) : (
          <div className="cartao">
            <ul className="lista">
              {dia.esperandoCliente.map((e) => (
                <li key={e.id}>
                  <button className="link-linha" onClick={() => setSelecionado(e.id)}>
                    {e.order_id}
                  </button>
                  <span className="lista__texto">
                    {ROTULO_TIPO[e.tipo_excecao]}, {e.descricao_produto}
                  </span>
                  <span className="lista__botoes">
                    <button className="botao botao--secundario botao--pequeno" onClick={() => despachar({ tipo: "foto_recebida", id: e.id })}>
                      Foto recebida
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="passo" aria-labelledby="passo-3">
        <div className="passo__cabeca">
          <span className={`passo__numero${dia.nEnviar === 0 ? " passo__numero--feito" : ""}`}>3</span>
          <h2 id="passo-3">Prontas para enviar</h2>
          <span className="passo__contagem">{plural(dia.nEnviar, "mensagem", "mensagens")}</span>
        </div>
        <p className="passo__texto">
          As informativas saem na hora; as que anunciam dinheiro só aparecem aqui depois da sua aprovação. Copie, envie ao cliente e marque como enviada.
        </p>
        {dia.nEnviar === 0 && <Vazio>Nenhuma mensagem esperando envio.</Vazio>}
        {dia.blocos.map((b) => (
          <BlocoEnvio key={b.chave} b={b} despachar={despachar} abrir={setSelecionado} />
        ))}
        {dia.canceladas.length > 0 && (
          <details className="cartao nao-enviar">
            <summary>
              Não enviar: {plural(dia.canceladas.length, "mensagem anunciava", "mensagens anunciavam")} uma ação que você recusou
            </summary>
            <ul className="lista">
              {dia.canceladas.map((m) => (
                <li key={`${m.id}|${m.indice}`}>
                  <button className="link-linha" onClick={() => setSelecionado(m.id)}>
                    {m.excecao.order_id}
                  </button>
                  <span className="lista__texto">Abra o pedido e peça ao agente uma nova tratativa, ou contate o cliente por fora.</span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      {pronto && <Aviso tom="ok">Tudo feito por hoje.</Aviso>}

      {item && (
        <PainelPedido
          ctx={ctx}
          item={item}
          tratativa={dia.tratativas.get(item.excecao.id)}
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

function CartaoPendencia({ p, despachar, abrir }: { p: Pendencia; despachar: (a: AcaoRegistro) => void; abrir: (id: string) => void }) {
  const n = p.itens.length;
  const itens = p.itens.map(({ id, acao }) => ({ id, acao }));
  const titulo = p.individual
    ? `Pedido ${p.itens[0].excecao.order_id}, investigado pelo agente`
    : `${plural(n, "pedido", "pedidos")}${p.grupo ? ` · ${tituloGrupo(p.grupo)}` : ""}`;

  return (
    <article className="cartao pendencia">
      <div className="pendencia__titulo">
        <Badge tom="atencao">{ROTULO_ACAO[p.acao]}</Badge>
        <h3>{titulo}</h3>
      </div>
      <dl className="pendencia__numeros">
        <div>
          <dt>Custo da ação</dt>
          <dd>{brl(p.custoTotal)}</dd>
        </div>
        <div>
          <dt>Valor em jogo protegido</dt>
          <dd>{brl(p.valorEmJogo)}</dd>
        </div>
        {p.custoDeEsperar > 0 && (
          <div>
            <dt>Perda a mais se esperar</dt>
            <dd>{brl(p.custoDeEsperar)}</dd>
          </div>
        )}
      </dl>
      <div className="pendencia__recomendacao">
        <BadgeFonte fonte={p.fonte} />
        <p>
          <strong>{p.fonte === "agente" ? "Recomenda aprovar." : "A política recomenda aprovar."}</strong> {p.justificativa}
        </p>
        {p.mensagemPrevia && (
          <details>
            <summary>Mensagem que sai depois da aprovação</summary>
            <blockquote className="mensagem" style={{ marginTop: 8 }}>
              {p.mensagemPrevia}
            </blockquote>
          </details>
        )}
      </div>
      <div className="botoes">
        <button className="botao" onClick={() => despachar({ tipo: "decidir_lote", itens, decisao: "aprovada" })}>
          {n === 1 ? "Aprovar" : `Aprovar os ${num(n)}`}
        </button>
        <button
          className="botao-texto botao-texto--perigo"
          onClick={() => (n === 1 || window.confirm(`Recusar as ${n} ações deste grupo?`)) && despachar({ tipo: "decidir_lote", itens, decisao: "recusada" })}
        >
          {n === 1 ? "Recusar" : "Recusar o grupo"}
        </button>
        {n === 1 && (
          <button className="botao-texto botao-texto--mudo" onClick={() => abrir(p.itens[0].id)}>
            Ver o pedido
          </button>
        )}
      </div>
      {n > 1 && (
        <details>
          <summary>Ver os {num(n)} pedidos e decidir um a um</summary>
          <ul className="lista" style={{ marginTop: 8 }}>
            {p.itens.map((i) => (
              <li key={i.id}>
                <button className="link-linha" onClick={() => abrir(i.id)}>
                  {i.excecao.order_id}
                </button>
                <span className="lista__texto">
                  {i.excecao.descricao_produto} · custo {brl2(i.custo)} · {brl2(i.excecao.valorEmJogo)} em jogo
                  {i.excecao.clienteVip ? " · cliente de alto valor" : ""}
                </span>
                <span className="lista__botoes">
                  <button className="botao botao--secundario botao--pequeno" onClick={() => despachar({ tipo: "decidir", id: i.id, acao: i.acao, decisao: "aprovada" })}>
                    Aprovar
                  </button>
                  <button className="botao-texto botao-texto--perigo" onClick={() => despachar({ tipo: "decidir", id: i.id, acao: i.acao, decisao: "recusada" })}>
                    Recusar
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </article>
  );
}

function BlocoEnvio({ b, despachar, abrir }: { b: BlocoMensagens; despachar: (a: AcaoRegistro) => void; abrir: (id: string) => void }) {
  const [copiado, setCopiado] = useState<string | null>(null);
  const n = b.mensagens.length;
  return (
    <details className="cartao bloco-envio">
      <summary>
        <span>{b.titulo}</span>
        <span className="mudo">
          {plural(n, "mensagem", "mensagens")}
          {b.fonte === "agente" ? " escritas pelo agente" : ""}
        </span>
      </summary>
      <div className="botoes" style={{ marginTop: 12 }}>
        <button
          className="botao botao--secundario botao--pequeno"
          onClick={() => despachar({ tipo: "mensagens_enviadas_lote", itens: b.mensagens.map(({ id, indice }) => ({ id, indice })) })}
        >
          Marcar as {num(n)} como enviadas
        </button>
      </div>
      <ol className="mensagens" style={{ marginTop: 12 }}>
        {b.mensagens.map((m) => {
          const chave = `${m.id}|${m.indice}`;
          return (
            <li key={chave}>
              <span className="mensagens__status">
                Para o pedido{" "}
                <button className="link-linha" onClick={() => abrir(m.id)}>
                  {m.excecao.order_id}
                </button>
              </span>
              <blockquote className="mensagem">{m.texto}</blockquote>
              <span className="botoes">
                <button className="botao-texto" onClick={() => navigator.clipboard.writeText(m.texto).then(() => setCopiado(chave))}>
                  {copiado === chave ? "Copiada" : "Copiar"}
                </button>
                <button className="botao botao--secundario botao--pequeno" onClick={() => despachar({ tipo: "mensagem_enviada", id: m.id, indice: m.indice })}>
                  Marcar como enviada
                </button>
              </span>
            </li>
          );
        })}
      </ol>
    </details>
  );
}
