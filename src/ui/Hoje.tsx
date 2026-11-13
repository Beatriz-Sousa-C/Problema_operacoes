"use client";
/**
 * Central do dia: o que o agente já fez e o que falta a pessoa fazer, em 3 passos.
 *  1. Decidir o que envolve dinheiro (por grupo, com a recomendação do agente)
 *  2. Registrar as fotos que os clientes mandarem
 *  3. Enviar as mensagens prontas
 */
import { useMemo, useState } from "react";
import { ROTULO_ACAO, type TipoExcecao } from "@/core";
import { causasParaCorrecao, type Contexto, type PlanoDoDia, type ResultadoGrupo } from "@/agente";
import { PainelPedido } from "./PainelPedido";
import { gerarPlanoNoServidor } from "./agenteApi";
import { brl, brl2, num, ROTULO_TIPO } from "./formato";
import type { AcaoRegistro, Registro } from "./registro";
import { mensagensProntas, pendenciasPorGrupo, situacoes, useTratativas, type BlocoMensagens, type Pendencia } from "./tratativas";

interface Props {
  ctx: Contexto;
  plano: PlanoDoDia | null;
  fonte: "agente" | "regras";
  aoTrocarPlano: (p: PlanoDoDia) => void;
  registro: Registro;
  despachar: (a: AcaoRegistro) => void;
  /** IA ao vivo só existe para a lista original (o agente roda no servidor) */
  iaAoVivo: boolean;
  irPara: (aba: string) => void;
}

export const tituloGrupo = (g: ResultadoGrupo) => `${ROTULO_TIPO[g.tipo as TipoExcecao]}${g.causa ? `, ligado a ${g.causa}` : ""}`;
const plural = (n: number, um: string, varios: string) => `${num(n)} ${n === 1 ? um : varios}`;

export function Hoje({ ctx, plano, fonte, aoTrocarPlano, registro, despachar, iaAoVivo, irPara }: Props) {
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [gerando, setGerando] = useState(false);
  const [progresso, setProgresso] = useState<string | null>(null);

  const tratativas = useTratativas(ctx, plano, registro);
  const sit = useMemo(() => situacoes(tratativas, registro), [tratativas, registro]);
  const pendencias = useMemo(() => pendenciasPorGrupo(ctx, tratativas, registro, plano), [ctx, tratativas, registro, plano]);
  const { blocos, canceladas } = useMemo(() => mensagensProntas(ctx, tratativas, registro, plano, tituloGrupo), [ctx, tratativas, registro, plano]);
  const esperandoCliente = [...sit].filter(([, s]) => s === "esperando_cliente").map(([id]) => ctx.porId.get(id)!.excecao);
  const concluidos = [...sit.values()].filter((s) => s === "concluido").length;
  const total = tratativas.size;
  const nDecidir = pendencias.reduce((s, p) => s + p.itens.length, 0);
  const nEnviar = blocos.reduce((s, b) => s + b.mensagens.length, 0);

  if (!plano) return <p className="carregando">Preparando o plano do dia…</p>;

  const agenteLigado = fonte === "agente" || plano.grupos.some((g) => g.fonte === "agente");
  const chamados = plano.grupos.filter((g) => g.plano.chamado_lote);
  const investigados = [...tratativas.values()].filter((t) => t.investigacao?.fonte === "agente").length;
  const transportadoras = [...tratativas.values()].filter((t) => t.acoes.some((a) => a.acao === "acionar_transportadora")).length;
  const mensagensEscritas = [...tratativas.values()].reduce((s, t) => s + t.mensagens.length, 0);
  const item = selecionado ? ctx.porId.get(selecionado) : undefined;

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
    <div className="hoje">
      <h1 className="titulo-largo titulo-largo--menor">Trabalho de hoje</h1>

      {agenteLigado ? (
        <p className="faixa-agente faixa-agente--ligado">
          Plano decidido pelo agente de IA{plano.modelo ? ` (${plano.modelo})` : ""}. Ele analisou a fila, escolheu as ações e escreveu as mensagens;
          você só aprova o que envolve dinheiro e envia.
        </p>
      ) : (
        <p className="faixa-agente faixa-agente--desligado" role="status">
          <strong>O agente de IA está desligado.</strong> Falta configurar a chave da Groq (GROQ_API_KEY). O que aparece abaixo são as regras padrão
          da política, sem a análise do agente.{" "}
          <button className="botao-texto" onClick={() => irPara("metodo")}>
            O que o agente faz quando está ligado
          </button>
        </p>
      )}

      <ol className="como-usar" aria-label="Como usar">
        <li><strong>Decida</strong> o que envolve dinheiro</li>
        <li><strong>Registre</strong> as fotos que os clientes mandarem</li>
        <li><strong>Envie</strong> as mensagens prontas</li>
      </ol>

      <div className="progresso" role="group" aria-label="Progresso do dia">
        <div className="progresso__texto">
          <strong>{num(concluidos)} de {num(total)}</strong> pedidos concluídos hoje
        </div>
        <div className="progresso__barra" aria-hidden="true">
          <span style={{ width: `${total ? (concluidos / total) * 100 : 0}%` }} />
        </div>
      </div>

      <section className="agente-feito">
        <h2>O que o {agenteLigado ? "agente" : "sistema"} já fez</h2>
        <dl>
          <div><dt>Grupos decididos</dt><dd>{num(plano.grupos.length)}</dd></div>
          <div><dt>Chamados em lote abertos</dt><dd>{num(chamados.length)}</dd></div>
          <div><dt>Transportadoras acionadas</dt><dd>{num(transportadoras)}</dd></div>
          <div><dt>Casos investigados um a um</dt><dd>{num(investigados)}</dd></div>
          <div><dt>Mensagens escritas</dt><dd>{num(mensagensEscritas)}</dd></div>
          <div>
            <dt>Planos de correção</dt>
            <dd>
              <button className="botao-texto" onClick={() => irPara("causas")}>{num(causasParaCorrecao(ctx).length)}</button>
            </dd>
          </div>
        </dl>
        {chamados.length > 0 && (
          <details>
            <summary>Ver os {num(chamados.length)} chamados em lote</summary>
            <ul className="chamados">
              {chamados.map((g) => (
                <li key={g.chave}>
                  <strong>Para {g.plano.chamado_lote!.destino}</strong> ({plural(g.pedidos, "pedido", "pedidos")}): {g.plano.chamado_lote!.texto}
                </li>
              ))}
            </ul>
          </details>
        )}
        <div className="agente-feito__acoes">
          {iaAoVivo ? (
            <button className="botao botao--secundario" onClick={gerarAoVivo} disabled={gerando}>
              {gerando ? "O agente está trabalhando…" : "Pedir ao agente um plano novo"}
            </button>
          ) : (
            <span className="secao__intro">A IA ao vivo só funciona com a lista original.</span>
          )}
          {Object.keys(registro).length > 0 && (
            <button
              className="botao-texto"
              onClick={() => window.confirm("Apagar fotos, aprovações, recusas e envios registrados nesta lista?") && despachar({ tipo: "limpar" })}
            >
              Recomeçar o dia
            </button>
          )}
        </div>
        {progresso && <p className="plano__progresso" role="status">{progresso}</p>}
      </section>

      <section className="passo">
        <h2>
          <span className="passo__numero">1</span> Para você decidir <span className="contagem">{plural(nDecidir, "ação", "ações")}</span>
        </h2>
        <p className="secao__intro">
          Tudo o que envolve dinheiro passa por você. O {agenteLigado ? "agente" : "sistema"} já agrupou os casos parecidos e diz por que recomenda cada
          ação: aprove o grupo de uma vez ou abra a lista para decidir caso a caso.
        </p>
        {pendencias.length === 0 && <p className="passo__vazio">Nada esperando a sua decisão.</p>}
        {pendencias.map((p) => (
          <CartaoPendencia key={p.chave} p={p} despachar={despachar} abrir={setSelecionado} />
        ))}
      </section>

      <section className="passo">
        <h2>
          <span className="passo__numero">2</span> Esperando o cliente <span className="contagem">{plural(esperandoCliente.length, "pedido", "pedidos")}</span>
        </h2>
        <p className="secao__intro">
          Em avaria, vazamento e erro de personalização, o pedido de foto já saiu. Quando a foto chegar, registre aqui: o caso vai para o passo 1.
        </p>
        {esperandoCliente.length === 0 && <p className="passo__vazio">Nenhum pedido esperando foto.</p>}
        <ul className="lista-simples">
          {esperandoCliente.map((e) => (
            <li key={e.id}>
              <button className="link-linha" onClick={() => setSelecionado(e.id)}>{e.order_id}</button>
              <span>{ROTULO_TIPO[e.tipo_excecao]}, {e.descricao_produto}</span>
              <button className="botao botao--pequeno" onClick={() => despachar({ tipo: "foto_recebida", id: e.id })}>
                Foto recebida
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="passo">
        <h2>
          <span className="passo__numero">3</span> Prontas para enviar <span className="contagem">{plural(nEnviar, "mensagem", "mensagens")}</span>
        </h2>
        <p className="secao__intro">
          Mensagens liberadas: as informativas saem na hora; as que anunciam dinheiro só aparecem aqui depois da sua aprovação. Copie, envie ao
          cliente e marque como enviada.
        </p>
        {nEnviar === 0 && <p className="passo__vazio">Nenhuma mensagem esperando envio.</p>}
        {blocos.map((b) => (
          <BlocoEnvio key={b.chave} b={b} despachar={despachar} abrir={setSelecionado} />
        ))}
        {canceladas.length > 0 && (
          <details className="nao-enviar">
            <summary>Não enviar: {plural(canceladas.length, "mensagem anunciava", "mensagens anunciavam")} uma ação que você recusou</summary>
            <ul className="lista-simples">
              {canceladas.map((m) => (
                <li key={`${m.id}|${m.indice}`}>
                  <button className="link-linha" onClick={() => setSelecionado(m.id)}>{m.excecao.order_id}</button>
                  <span>Abra o pedido e peça ao agente uma nova tratativa, ou contate o cliente por fora.</span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      {total > 0 && concluidos === total && <p className="tudo-feito">Tudo feito por hoje.</p>}

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

function CartaoPendencia({ p, despachar, abrir }: { p: Pendencia; despachar: (a: AcaoRegistro) => void; abrir: (id: string) => void }) {
  const n = p.itens.length;
  const itens = p.itens.map(({ id, acao }) => ({ id, acao }));
  const titulo = p.individual
    ? `pedido ${p.itens[0].excecao.order_id}, investigado pelo agente`
    : `${plural(n, "pedido", "pedidos")}${p.grupo ? ` · ${tituloGrupo(p.grupo)}` : ""}`;

  return (
    <article className="cartao-grupo">
      <h3>
        {ROTULO_ACAO[p.acao]} · {titulo}
      </h3>
      <p className="cartao-grupo__numeros">
        Custo de {brl(p.custoTotal)} para proteger {brl(p.valorEmJogo)} em jogo
        {p.custoDeEsperar > 0 ? `; deixar para depois aumenta a perda esperada em ${brl(p.custoDeEsperar)}` : ""}.
      </p>
      <p className="cartao-grupo__recomendacao">
        <strong>{p.fonte === "agente" ? "O agente recomenda aprovar:" : "A política recomenda aprovar (agente desligado):"}</strong> {p.justificativa}
      </p>
      {p.mensagemPrevia && (
        <details>
          <summary>Mensagem que sai depois da aprovação</summary>
          <blockquote className="mensagem">{p.mensagemPrevia}</blockquote>
        </details>
      )}
      <div className="cartao-grupo__botoes">
        <button className="botao" onClick={() => despachar({ tipo: "decidir_lote", itens, decisao: "aprovada" })}>
          {n === 1 ? "Aprovar" : `Aprovar os ${num(n)}`}
        </button>
        <button
          className="botao-texto"
          onClick={() => (n === 1 || window.confirm(`Recusar as ${n} ações deste grupo?`)) && despachar({ tipo: "decidir_lote", itens, decisao: "recusada" })}
        >
          {n === 1 ? "Recusar" : "Recusar o grupo"}
        </button>
      </div>
      {n > 1 && (
        <details className="cartao-grupo__lista">
          <summary>Ver os {num(n)} pedidos e decidir um a um</summary>
          <ul className="lista-simples">
            {p.itens.map((i) => (
              <li key={i.id}>
                <button className="link-linha" onClick={() => abrir(i.id)}>{i.excecao.order_id}</button>
                <span>
                  {i.excecao.descricao_produto}, custo {brl2(i.custo)}, {brl2(i.excecao.valorEmJogo)} em jogo{i.excecao.clienteVip ? ", cliente de alto valor" : ""}
                </span>
                <span className="lista-simples__botoes">
                  <button className="botao botao--pequeno" onClick={() => despachar({ tipo: "decidir", id: i.id, acao: i.acao, decisao: "aprovada" })}>
                    Aprovar
                  </button>
                  <button className="botao-texto" onClick={() => despachar({ tipo: "decidir", id: i.id, acao: i.acao, decisao: "recusada" })}>
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
    <details className="bloco-envio">
      <summary>
        <span>{b.titulo}</span>
        <span className="contagem">{plural(n, "mensagem", "mensagens")}{b.fonte === "agente" ? ", escritas pelo agente" : ""}</span>
      </summary>
      <button
        className="botao botao--secundario botao--pequeno"
        onClick={() => despachar({ tipo: "mensagens_enviadas_lote", itens: b.mensagens.map(({ id, indice }) => ({ id, indice })) })}
      >
        Marcar as {num(n)} como enviadas
      </button>
      <ol className="mensagens">
        {b.mensagens.map((m) => {
          const chave = `${m.id}|${m.indice}`;
          return (
            <li key={chave}>
              <span className="mensagens__status">
                Para o pedido <button className="link-linha" onClick={() => abrir(m.id)}>{m.excecao.order_id}</button>
              </span>
              <blockquote className="mensagem">{m.texto}</blockquote>
              <span className="lista-simples__botoes">
                <button className="botao-texto" onClick={() => navigator.clipboard.writeText(m.texto).then(() => setCopiado(chave))}>
                  {copiado === chave ? "Copiada" : "Copiar"}
                </button>
                <button className="botao botao--pequeno" onClick={() => despachar({ tipo: "mensagem_enviada", id: m.id, indice: m.indice })}>
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
