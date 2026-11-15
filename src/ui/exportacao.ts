/**
 * Planilhas para quem executa: o que a pessoa aprovou e o que o agente
 * preparou, organizado por destino (uma aba por transportadora, reenvios e
 * produção, financeiro, mensagens, chamados internos, recusas).
 *
 * Módulo puro: monta linhas a partir do dia (tratativas em vigor), do
 * registro (aprovações, fotos, envios) e do plano (chamados do agente).
 * Cada linha carrega a chave do item, o que permite exportar só o que ainda
 * não saiu em lote nenhum, o dia inteiro, ou reproduzir um lote antigo.
 */
import { estadoAcao, estadoMensagem, ROTULO_ACAO, type Acao, type BaseDados, type ExcecaoAnalisada } from "@/core";
import type { Contexto, PlanoDoDia, ResultadoGrupo, TratativaPedido } from "@/agente";
import { dataCompleta, ROTULO_TIPO, tituloGrupo } from "./formato";
import { chaveAcao, chaveChamado, chaveMensagem, chaveRecusa, chaveTransportadora, type ChaveItem, type Lote } from "./lotes";
import type { Registro } from "./registro";
import { decididoIndividualmente, type Dia } from "./tratativas";

export type Celula = string | number | null;
export interface Coluna {
  titulo: string;
  /** Largura em caracteres, para o XLSX */
  largura?: number;
}
export interface Linha {
  /** null para linhas que não são itens (ex.: aba Resumo) */
  chave: ChaveItem | null;
  celulas: Celula[];
}
export interface Aba {
  id: string;
  /** Nome da aba no Excel (até 31 caracteres) */
  nome: string;
  titulo: string;
  /** Linhas de texto antes da tabela (ex.: o chamado do agente) */
  preambulo: string[];
  colunas: Coluna[];
  linhas: Linha[];
}

export type Escopo = "novos" | "dia" | { lote: Lote };

export interface Contagens {
  transportadoras: number;
  pedidosTransportadoras: number;
  reenvios: number;
  financeiro: number;
  mensagens: number;
  chamadosInternos: number;
  recusas: number;
  /** Itens exportáveis no total (sem a aba Resumo) */
  total: number;
}

export interface Exportacao {
  escopo: Escopo;
  /** Número do lote que esta exportação fecha (escopo "novos"), do lote reproduzido, ou null para o dia inteiro */
  numeroLote: number | null;
  geradoEm: string;
  dataReferencia: string;
  abas: Aba[];
  /** Chaves de todos os itens incluídos */
  itens: ChaveItem[];
  contagens: Contagens;
}

export interface OpcoesExportacao {
  escopo: Escopo;
  /** Itens que já saíram em lotes anteriores (para o escopo "novos") */
  exportados?: ReadonlySet<ChaveItem>;
  /** Número que o próximo lote receberá (para o escopo "novos") */
  proximoLote?: number;
  modelo?: string;
  agora?: Date;
}

// ---------- Utilidades ----------

const semAcento = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

/** Nome da transportadora citada num destino de chamado, ou null se for área interna. */
export function transportadoraDoDestino(destino: string, transportadoras: readonly string[]): string | null {
  const d = semAcento(destino);
  return transportadoras.find((t) => d.includes(semAcento(t))) ?? null;
}

const PROIBIDOS_ABA = /[[\]:*?/\\]/g;

/** Nome válido de aba do Excel: até 31 caracteres, sem [ ] : * ? / \ e único na pasta. */
export function nomeDeAba(texto: string, usados: Set<string> = new Set()): string {
  const base = (texto.replace(PROIBIDOS_ABA, " ").replace(/\s+/g, " ").trim() || "Aba").slice(0, 31);
  let nome = base;
  for (let n = 2; usados.has(nome.toLowerCase()); n++) {
    const sufixo = ` (${n})`;
    nome = base.slice(0, 31 - sufixo.length) + sufixo;
  }
  usados.add(nome.toLowerCase());
  return nome;
}

const ACOES_MERCADORIA: ReadonlySet<Acao> = new Set(["reenviar", "nova_producao", "oferecer_substituto"]);
const ACOES_FINANCEIRO: ReadonlySet<Acao> = new Set(["reembolsar", "cancelar_pedido"]);
/** Tipos em que uma ação com dinheiro aprovada também gera pedido de indenização ou sinistro à transportadora */
const TIPOS_SINISTRO = new Set(["extravio", "rastreio_parado", "devolvido_transportadora", "avaria_transporte"]);

const simNao = (v: boolean) => (v ? "sim" : "não");
const moeda = (v: number) => Math.round(v * 100) / 100;

function justificativaDe(t: TratativaPedido, grupos: Map<string, ResultadoGrupo>): string {
  if (decididoIndividualmente(t)) return t.investigacao!.decisao.justificativa;
  return grupos.get(t.grupo)?.plano.justificativa ?? "";
}

const autorDe = (t: TratativaPedido, grupos: Map<string, ResultadoGrupo>) =>
  decididoIndividualmente(t) || grupos.get(t.grupo)?.fonte === "agente" ? "agente" : "política padrão";

interface Col {
  titulo: string;
  largura?: number;
}
const col = (titulo: string, largura?: number): Col => ({ titulo, largura });

// ---------- Montagem ----------

export function montarExportacao(ctx: Contexto, dia: Dia, registro: Registro, plano: PlanoDoDia | null, base: BaseDados, opcoes: OpcoesExportacao): Exportacao {
  const { escopo, exportados = new Set<ChaveItem>(), proximoLote = 1, modelo, agora = new Date() } = opcoes;
  const grupos = new Map(plano?.grupos.map((g) => [g.chave, g]) ?? []);
  const nomesTransportadoras = [...new Set(base.transportadoras.map((t) => t.transportadora))];
  const pedidosDoGrupo = new Map<string, string[]>();
  for (const t of dia.tratativas.values()) {
    const e = ctx.porId.get(t.id)?.excecao;
    if (e) pedidosDoGrupo.set(t.grupo, [...(pedidosDoGrupo.get(t.grupo) ?? []), e.order_id]);
  }

  const incluir = (chave: ChaveItem) => {
    if (escopo === "dia") return true;
    if (escopo === "novos") return !exportados.has(chave);
    return escopo.lote.itens.includes(chave);
  };

  const porTransportadora = new Map<string, { preambulo: string[]; chavesPreambulo: ChaveItem[]; linhas: Linha[] }>();
  const reenvios: Linha[] = [];
  const financeiro: Linha[] = [];
  const mensagens: Linha[] = [];
  const chamadosInternos: Linha[] = [];
  const recusas: Linha[] = [];
  let custoAprovado = 0;

  const abaTransportadora = (nome: string) => {
    let a = porTransportadora.get(nome);
    if (!a) {
      a = { preambulo: [], chavesPreambulo: [], linhas: [] };
      porTransportadora.set(nome, a);
    }
    return a;
  };

  for (const [id, t] of dia.tratativas) {
    const e: ExcecaoAnalisada | undefined = ctx.porId.get(id)?.excecao;
    if (!e) continue;
    const r = registro[id];
    const justificativa = justificativaDe(t, grupos);
    const causa = (ctx.causasPorPedido.get(id) ?? []).map((c) => `${c.dimensao}: ${c.grupo}`).join("; ");
    const acoesTransportadora: string[] = [];

    for (const a of t.acoes) {
      const estado = estadoAcao(a, r);
      if (a.acao === "acionar_transportadora" && estado === "liberada") acoesTransportadora.push(ROTULO_ACAO[a.acao]);
      if (estado === "aprovada") {
        if (ACOES_MERCADORIA.has(a.acao)) {
          const chave = chaveAcao(id, a.acao);
          if (incluir(chave)) {
            custoAprovado += a.custoEstimado;
            reenvios.push({
              chave,
              celulas: [
                e.order_id,
                e.customer_id,
                e.marca,
                ROTULO_ACAO[a.acao],
                e.sku,
                e.descricao_produto,
                e.qtd_itens,
                e.cd,
                e.turno,
                e.lote_produto,
                e.maquina ?? "",
                moeda(a.custoEstimado),
                simNao(!!r?.fotoRecebida),
                ROTULO_TIPO[e.tipo_excecao],
                justificativa,
              ],
            });
          }
          if (TIPOS_SINISTRO.has(e.tipo_excecao)) acoesTransportadora.push(`${ROTULO_ACAO[a.acao]} aprovado: solicitar indenização ou sinistro`);
        }
        if (ACOES_FINANCEIRO.has(a.acao)) {
          const chave = chaveAcao(id, a.acao);
          if (incluir(chave)) {
            const valor = a.acao === "reembolsar" ? a.custoEstimado : e.valor;
            custoAprovado += a.acao === "reembolsar" ? valor : 0;
            financeiro.push({ chave, celulas: [e.order_id, e.customer_id, e.marca, ROTULO_ACAO[a.acao], moeda(valor), ROTULO_TIPO[e.tipo_excecao], justificativa] });
          }
        }
      }
      if (estado === "recusada") {
        const chave = chaveRecusa(id, a.acao);
        if (incluir(chave)) recusas.push({ chave, celulas: [e.order_id, e.customer_id, ROTULO_ACAO[a.acao], moeda(a.custoEstimado), ROTULO_TIPO[e.tipo_excecao], justificativa] });
      }
    }

    if (acoesTransportadora.length) {
      const chave = chaveTransportadora(id);
      if (incluir(chave)) {
        abaTransportadora(e.transportadora).linhas.push({
          chave,
          celulas: [
            e.order_id,
            e.customer_id,
            `${e.cidade}/${e.uf}`,
            ROTULO_TIPO[e.tipo_excecao],
            dataCompleta(e.data_pedido),
            dataCompleta(e.data_prometida),
            dataCompleta(e.prazoContratado),
            e.atrasoAtual,
            dataCompleta(e.data_entrega),
            acoesTransportadora.join("; "),
            causa,
          ],
        });
      }
    }

    t.mensagens.forEach((m, i) => {
      if (estadoMensagem(m, t.acoes, r) !== "enviar_agora") return;
      const chave = chaveMensagem(id, i);
      if (!incluir(chave)) return;
      const enviada = (r?.enviadas ?? []).includes(i);
      mensagens.push({ chave, celulas: [e.order_id, e.customer_id, e.marca, ROTULO_TIPO[e.tipo_excecao], enviada ? "enviada" : "a enviar", m.texto, autorDe(t, grupos)] });
    });

    // Chamado da investigação individual
    const chamado = t.investigacao?.fonte === "agente" ? t.investigacao.decisao.chamado : null;
    if (chamado) {
      const chave = chaveChamado(id);
      if (incluir(chave)) {
        const transp = transportadoraDoDestino(chamado.destino, nomesTransportadoras);
        if (transp) {
          const aba = abaTransportadora(transp);
          aba.preambulo.push(`Chamado do agente para o pedido ${e.order_id}: ${chamado.texto}`);
          aba.chavesPreambulo.push(chave);
        } else chamadosInternos.push({ chave, celulas: [chamado.destino, 1, e.order_id, chamado.texto] });
      }
    }
  }

  // Chamados em lote dos grupos
  for (const g of plano?.grupos ?? []) {
    if (!g.plano.chamado_lote) continue;
    const chave = chaveChamado(g.chave);
    if (!incluir(chave)) continue;
    const pedidos = pedidosDoGrupo.get(g.chave) ?? [];
    const transp = transportadoraDoDestino(g.plano.chamado_lote.destino, nomesTransportadoras);
    if (transp) {
      const aba = abaTransportadora(transp);
      aba.preambulo.push(`Chamado em lote do agente (${tituloGrupo(g)}, ${pedidos.length} pedidos): ${g.plano.chamado_lote.texto}`);
      aba.chavesPreambulo.push(chave);
    } else chamadosInternos.push({ chave, celulas: [g.plano.chamado_lote.destino, pedidos.length, pedidos.join(", "), g.plano.chamado_lote.texto] });
  }

  // ---------- Abas ----------
  const usados = new Set<string>(["resumo"]);
  const abas: Aba[] = [];
  const transportadorasComConteudo = [...porTransportadora]
    .filter(([, a]) => a.linhas.length || a.preambulo.length)
    .sort((x, y) => y[1].linhas.length - x[1].linhas.length || x[0].localeCompare(y[0]));
  for (const [nome, a] of transportadorasComConteudo) {
    abas.push({
      id: `transportadora:${nome}`,
      nome: nomeDeAba(nome, usados),
      titulo: `Transportadora ${nome}`,
      preambulo: a.preambulo,
      colunas: [
        col("Pedido", 12),
        col("Cliente", 11),
        col("Destino", 22),
        col("Exceção", 24),
        col("Data do pedido", 14),
        col("Prometido ao cliente", 18),
        col("Prazo contratado", 16),
        col("Atraso (dias úteis)", 16),
        col("Entregue em", 12),
        col("Ação solicitada", 48),
        col("Observação", 40),
      ],
      linhas: a.linhas,
    });
  }
  abas.push(
    {
      id: "reenvios",
      nome: nomeDeAba("Reenvios e produção", usados),
      titulo: "Reenvios, nova produção e substitutos aprovados",
      preambulo: [],
      colunas: [
        col("Pedido", 12),
        col("Cliente", 11),
        col("Marca", 10),
        col("Ação", 18),
        col("SKU", 10),
        col("Produto", 36),
        col("Qtd", 5),
        col("CD", 6),
        col("Turno", 8),
        col("Lote", 10),
        col("Impressora", 10),
        col("Custo estimado (R$)", 16),
        col("Foto recebida", 12),
        col("Exceção", 24),
        col("Justificativa", 60),
      ],
      linhas: reenvios,
    },
    {
      id: "financeiro",
      nome: nomeDeAba("Reembolsos e cancelamentos", usados),
      titulo: "Reembolsos e cancelamentos aprovados",
      preambulo: [],
      colunas: [col("Pedido", 12), col("Cliente", 11), col("Marca", 10), col("Ação", 18), col("Valor (R$)", 12), col("Exceção", 24), col("Justificativa", 60)],
      linhas: financeiro,
    },
    {
      id: "mensagens",
      nome: nomeDeAba("Mensagens", usados),
      titulo: "Mensagens liberadas para os clientes",
      preambulo: [],
      colunas: [col("Pedido", 12), col("Cliente", 11), col("Marca", 10), col("Exceção", 24), col("Status", 10), col("Texto", 90), col("Escrita por", 14)],
      linhas: mensagens,
    },
    {
      id: "chamados",
      nome: nomeDeAba("Chamados internos", usados),
      titulo: "Chamados para áreas internas",
      preambulo: [],
      colunas: [col("Destino", 28), col("Pedidos", 8), col("Lista de pedidos", 40), col("Texto", 90)],
      linhas: chamadosInternos,
    },
    {
      id: "recusas",
      nome: nomeDeAba("Recusas", usados),
      titulo: "Ações recusadas (auditoria)",
      preambulo: [],
      colunas: [col("Pedido", 12), col("Cliente", 11), col("Ação", 18), col("Custo que teria (R$)", 16), col("Exceção", 24), col("Justificativa do agente", 60)],
      linhas: recusas,
    },
  );

  const itensLinhas = abas.flatMap((a) => a.linhas.map((l) => l.chave)).filter((c): c is ChaveItem => c !== null);
  const itensPreambulo = transportadorasComConteudo.flatMap(([, a]) => a.chavesPreambulo);
  const itens = [...new Set([...itensLinhas, ...itensPreambulo])];
  const contagens: Contagens = {
    transportadoras: transportadorasComConteudo.length,
    pedidosTransportadoras: transportadorasComConteudo.reduce((s, [, a]) => s + a.linhas.length, 0),
    reenvios: reenvios.length,
    financeiro: financeiro.length,
    mensagens: mensagens.length,
    chamadosInternos: chamadosInternos.length,
    recusas: recusas.length,
    total: itens.length,
  };

  const numeroLote = escopo === "dia" ? null : escopo === "novos" ? proximoLote : escopo.lote.numero;
  const resumo: Aba = {
    id: "resumo",
    nome: "Resumo",
    titulo: "Resumo da exportação",
    preambulo: [],
    colunas: [col("Campo", 40), col("Valor", 60)],
    linhas: (
      [
        ["Data de referência da fila", dataCompleta(ctx.analise.parametros.dataReferencia)],
        ["Escopo", numeroLote === null ? "dia inteiro" : `lote ${numeroLote}`],
        ["Gerado em", agora.toLocaleString("pt-BR")],
        ["Decisões do agente (modelo)", modelo ?? "política padrão (agente desligado)"],
        ["Transportadoras com chamados ou pedidos", contagens.transportadoras],
        ["Pedidos encaminhados a transportadoras", contagens.pedidosTransportadoras],
        ["Reenvios, produções e substitutos aprovados", contagens.reenvios],
        ["Reembolsos e cancelamentos aprovados", contagens.financeiro],
        ["Mensagens liberadas", contagens.mensagens],
        ["Chamados internos", contagens.chamadosInternos],
        ["Ações recusadas", contagens.recusas],
        ["Custo total aprovado (R$)", moeda(custoAprovado)],
      ] as Celula[][]
    ).map((celulas) => ({ chave: null, celulas })),
  };

  return { escopo, numeroLote, geradoEm: agora.toISOString(), dataReferencia: ctx.analise.parametros.dataReferencia, abas: [resumo, ...abas], itens, contagens };
}

/** Contagens num formato achatado, para guardar no lote e mostrar no histórico. */
export const contagensPlanas = (c: Contagens): Record<string, number> => ({ ...c });

/** Frase curta com o conteúdo ("4 transportadoras · 12 reenvios · 58 mensagens"). */
export function descreverContagens(c: Record<string, number>): string {
  const partes: string[] = [];
  const p = (n: number, um: string, varios: string) => n > 0 && partes.push(`${n} ${n === 1 ? um : varios}`);
  p(c.pedidosTransportadoras ?? 0, "pedido para transportadora", "pedidos para transportadoras");
  p(c.reenvios ?? 0, "reenvio ou produção", "reenvios e produções");
  p(c.financeiro ?? 0, "reembolso ou cancelamento", "reembolsos e cancelamentos");
  p(c.mensagens ?? 0, "mensagem", "mensagens");
  p(c.chamadosInternos ?? 0, "chamado interno", "chamados internos");
  p(c.recusas ?? 0, "recusa", "recusas");
  return partes.length ? partes.join(" · ") : "nada novo";
}

// ---------- CSV ----------

const celulaCsv = (v: Celula) => {
  if (v === null || v === undefined) return "";
  const s = typeof v === "number" ? String(v).replace(".", ",") : String(v);
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV amigável ao Excel em português: BOM UTF-8, separador ";", decimal com vírgula. */
export function paraCsv(aba: Aba): string {
  const linhas: string[] = [];
  for (const p of aba.preambulo) linhas.push(celulaCsv(p));
  linhas.push(aba.colunas.map((c) => celulaCsv(c.titulo)).join(";"));
  for (const l of aba.linhas) linhas.push(l.celulas.map(celulaCsv).join(";"));
  return `﻿${linhas.join("\r\n")}\r\n`;
}

const limparNome = (s: string) => semAcento(s).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function nomeDoArquivo(dataReferencia: string, numeroLote: number | null, extensao: "xlsx" | "csv", aba?: Aba): string {
  const escopo = numeroLote === null ? "dia-inteiro" : `lote-${String(numeroLote).padStart(2, "0")}`;
  const sufixo = aba ? `_${limparNome(aba.nome)}` : "";
  return `excecoes_${dataReferencia}_${escopo}${sufixo}.${extensao}`;
}
