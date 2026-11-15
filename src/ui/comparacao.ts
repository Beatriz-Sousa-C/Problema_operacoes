/**
 * Fechar o ciclo: a lista de um dia comparada com a do dia seguinte.
 *  - o que saiu da lista (resolvido), o que continua e o que é novo;
 *  - previsto × realizado: a fila do dia anterior previa tratar N pedidos;
 *    quantos deles de fato saíram, contra os que ficaram para depois;
 *  - reincidência: novas exceções ligadas a causas já conhecidas;
 *  - causas: lift de ontem contra hoje.
 * Também gera uma "lista de amanhã" simulada a partir da lista atual, para
 * demonstrar a comparação sem esperar um dia real. Módulo puro.
 */
import Papa from "papaparse";
import { Calendario, paraDia, paraIso, type BaseDados, type ExcecaoBruta, type TipoExcecao } from "@/core";
import { filaDoDia, type Contexto } from "@/agente";
import type { Registro } from "./registro";

export interface TendenciaCausa {
  id: string;
  rotulo: string;
  tipo: TipoExcecao;
  observadoAntes: number | null;
  observadoAgora: number | null;
  liftAntes: number | null;
  liftAgora: number | null;
  tendencia: "piorou" | "melhorou" | "estavel" | "sumiu" | "nova";
}

export interface Comparacao {
  dataAnterior: string;
  dataAtual: string;
  totalAnterior: number;
  totalAtual: number;
  resolvidas: { total: number; daFilaDoDia: number; foraDaFila: number; valorEmJogo: number };
  continuam: { total: number; daFilaDoDia: number; atrasoMedioAntes: number; atrasoMedioAgora: number };
  novas: { total: number; porTipo: { tipo: TipoExcecao; n: number }[]; ligadasACausaConhecida: number; valorEmJogo: number };
  previstoRealizado: {
    filaDoDia: number;
    filaResolvidos: number;
    fracaoFila: number;
    foraDaFila: number;
    foraResolvidos: number;
    fracaoFora: number;
    aprovadosOntem: number;
    aprovadosResolvidos: number;
    fracaoAprovados: number;
  };
  causas: TendenciaCausa[];
}

const media = (v: number[]) => (v.length ? v.reduce((s, x) => s + x, 0) / v.length : 0);
const fracao = (a: number, b: number) => (b ? a / b : 0);

export function compararDias(anterior: Contexto, atual: Contexto, registroAnterior: Registro = {}): Comparacao {
  const antes = new Map(anterior.analise.excecoes.map((e) => [e.id, e]));
  const agora = new Map(atual.analise.excecoes.map((e) => [e.id, e]));
  const filaOntem = new Set(filaDoDia(anterior).map((i) => i.excecao.id));
  const aprovadosOntem = new Set(
    Object.entries(registroAnterior)
      .filter(([, r]) => Object.values(r.decisoes ?? {}).includes("aprovada"))
      .map(([id]) => id),
  );

  const resolvidas = [...antes.values()].filter((e) => !agora.has(e.id));
  const continuam = [...antes.values()].filter((e) => agora.has(e.id));
  const novas = [...agora.values()].filter((e) => !antes.has(e.id));

  const filaResolvidos = resolvidas.filter((e) => filaOntem.has(e.id)).length;
  const foraDaFila = antes.size - filaOntem.size;
  const foraResolvidos = resolvidas.length - filaResolvidos;
  const aprovadosResolvidos = resolvidas.filter((e) => aprovadosOntem.has(e.id)).length;

  const porTipo = new Map<TipoExcecao, number>();
  for (const e of novas) porTipo.set(e.tipo_excecao, (porTipo.get(e.tipo_excecao) ?? 0) + 1);
  const causasConhecidas = new Set(anterior.causas.map((c) => c.id));
  const ligadasACausaConhecida = novas.filter((e) => (atual.causasPorPedido.get(e.id) ?? []).some((c) => causasConhecidas.has(c.id))).length;

  const causas: TendenciaCausa[] = [];
  const agoraPorId = new Map(atual.causas.map((c) => [c.id, c]));
  for (const c of anterior.causas) {
    const d = agoraPorId.get(c.id);
    const variacao = d ? d.lift / c.lift - 1 : null;
    causas.push({
      id: c.id,
      rotulo: `${c.dimensao}: ${c.grupo}`,
      tipo: c.tipo,
      observadoAntes: c.observado,
      observadoAgora: d?.observado ?? null,
      liftAntes: c.lift,
      liftAgora: d?.lift ?? null,
      tendencia: !d ? "sumiu" : variacao! > 0.15 ? "piorou" : variacao! < -0.15 ? "melhorou" : "estavel",
    });
  }
  for (const d of atual.causas) {
    if (!causasConhecidas.has(d.id)) {
      causas.push({ id: d.id, rotulo: `${d.dimensao}: ${d.grupo}`, tipo: d.tipo, observadoAntes: null, observadoAgora: d.observado, liftAntes: null, liftAgora: d.lift, tendencia: "nova" });
    }
  }
  const ordem = { piorou: 0, nova: 1, estavel: 2, melhorou: 3, sumiu: 4 };
  causas.sort((a, b) => ordem[a.tendencia] - ordem[b.tendencia] || (b.observadoAgora ?? 0) - (a.observadoAgora ?? 0));

  return {
    dataAnterior: anterior.analise.parametros.dataReferencia,
    dataAtual: atual.analise.parametros.dataReferencia,
    totalAnterior: antes.size,
    totalAtual: agora.size,
    resolvidas: {
      total: resolvidas.length,
      daFilaDoDia: filaResolvidos,
      foraDaFila: foraResolvidos,
      valorEmJogo: resolvidas.reduce((s, e) => s + e.valorEmJogo, 0),
    },
    continuam: {
      total: continuam.length,
      daFilaDoDia: continuam.filter((e) => filaOntem.has(e.id)).length,
      atrasoMedioAntes: media(continuam.map((e) => e.atrasoAtual)),
      atrasoMedioAgora: media(continuam.map((e) => agora.get(e.id)!.atrasoAtual)),
    },
    novas: {
      total: novas.length,
      porTipo: [...porTipo].map(([tipo, n]) => ({ tipo, n })).sort((a, b) => b.n - a.n),
      ligadasACausaConhecida,
      valorEmJogo: novas.reduce((s, e) => s + e.valorEmJogo, 0),
    },
    previstoRealizado: {
      filaDoDia: filaOntem.size,
      filaResolvidos,
      fracaoFila: fracao(filaResolvidos, filaOntem.size),
      foraDaFila,
      foraResolvidos,
      fracaoFora: fracao(foraResolvidos, foraDaFila),
      aprovadosOntem: aprovadosOntem.size,
      aprovadosResolvidos,
      fracaoAprovados: fracao(aprovadosResolvidos, aprovadosOntem.size),
    },
    causas,
  };
}

// ---------- Lista de amanhã simulada (demonstração) ----------

/** Gerador determinístico (mulberry32): a mesma lista sempre gera a mesma simulação. */
function aleatorio(semente: number) {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface OpcoesSimulacao {
  semente?: number;
  /** Fração da fila do dia que se resolve até amanhã */
  resolvidosDaFila?: number;
  /** Fração dos pedidos aprovados pela pessoa que se resolvem */
  resolvidosAprovados?: number;
  /** Fração do resto da fila que se resolve por outros caminhos */
  resolvidosForaDaFila?: number;
  /** Novas exceções que entram */
  novas?: number;
  /** Fração das novas que repetem uma causa conhecida */
  novasEmCausas?: number;
}

const COLUNAS_EXCECAO = [
  "order_id", "customer_id", "marca", "data_pedido", "valor", "sku", "descricao_produto", "qtd_itens", "brinde_no_pedido", "tipo_excecao", "status",
  "transportadora", "uf", "cidade", "data_prometida", "data_entrega", "maquina", "turno", "cd", "lote_produto", "data_abertura_excecao",
] as const;

/** CSV das exceções no mesmo formato do arquivo original (abre pelo mesmo leitor). */
export function excecoesParaCsv(excecoes: readonly ExcecaoBruta[]): string {
  const linhas = excecoes.map((e) => ({
    ...e,
    brinde_no_pedido: e.brinde_no_pedido ? "True" : "False",
    data_entrega: e.data_entrega ?? "",
    maquina: e.maquina ?? "",
  }));
  return Papa.unparse({ fields: [...COLUNAS_EXCECAO], data: linhas.map((l) => COLUNAS_EXCECAO.map((c) => l[c])) }, { newline: "\n" });
}

const deslocar = (iso: string, dias: number) => paraIso(paraDia(iso) + dias);

/**
 * Lista de amanhã: parte da lista atual, resolve uma parte (principalmente o
 * que a fila de hoje tratou), mantém o resto envelhecendo um dia útil e
 * acrescenta exceções novas, a maioria repetindo as causas conhecidas.
 */
export function simularAmanha(base: BaseDados, ctx: Contexto, registro: Registro = {}, opcoes: OpcoesSimulacao = {}): { base: BaseDados; dataAmanha: string } {
  const { semente = 2026, resolvidosDaFila = 0.75, resolvidosAprovados = 0.85, resolvidosForaDaFila = 0.06, novas = 36, novasEmCausas = 0.6 } = opcoes;
  const rnd = aleatorio(semente);
  const p = ctx.analise.parametros;
  const cal = new Calendario(p.feriados);
  const amanha = paraIso(cal.somarDiasUteis(paraDia(p.dataReferencia), 1));
  const filaHoje = new Set(filaDoDia(ctx).map((i) => i.excecao.id));
  const aprovados = new Set(Object.entries(registro).filter(([, r]) => Object.values(r.decisoes ?? {}).includes("aprovada")).map(([id]) => id));
  const idDe = (e: ExcecaoBruta) => `${e.order_id}|${e.tipo_excecao}`;

  const continuam = base.excecoes.filter((e) => {
    const id = idDe(e);
    const chance = aprovados.has(id) ? resolvidosAprovados : filaHoje.has(id) ? resolvidosDaFila : resolvidosForaDaFila;
    return rnd() >= chance;
  });

  const emCausa = base.excecoes.filter((e) => ctx.causasPorPedido.has(idDe(e)));
  const todas = base.excecoes;
  const geradas: ExcecaoBruta[] = [];
  for (let i = 0; i < novas; i++) {
    const fonte = rnd() < novasEmCausas && emCausa.length ? emCausa[Math.floor(rnd() * emCausa.length)] : todas[Math.floor(rnd() * todas.length)];
    const delta = paraDia(amanha) - paraDia(fonte.data_abertura_excecao);
    geradas.push({
      ...fonte,
      order_id: `${fonte.order_id.slice(0, 2)}S${String(i + 1).padStart(5, "0")}`,
      status: "aberta",
      data_pedido: deslocar(fonte.data_pedido, delta),
      data_prometida: deslocar(fonte.data_prometida, delta),
      data_entrega: fonte.data_entrega ? deslocar(fonte.data_entrega, delta) : null,
      data_abertura_excecao: amanha,
    });
  }
  return { base: { ...base, excecoes: [...continuam, ...geradas], descartadas: [], corrigidas: [] }, dataAmanha: amanha };
}
