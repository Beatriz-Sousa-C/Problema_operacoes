import Papa from "papaparse";
import type {
  BaseDados,
  Cliente,
  ExcecaoBruta,
  LinhaDescartada,
  RelatorioQualidade,
  TipoExcecao,
  Transportadora,
} from "./tipos";
import { TIPOS_EXCECAO } from "./tipos";

/**
 * Leitura tolerante dos CSVs. O objetivo é aceitar o que uma planilha real
 * produz (BOM, separador ";", vírgula decimal, data dd/mm/aaaa, espaços) e
 * descartar só a linha com problema, com o motivo, em vez de recusar o
 * arquivo inteiro. O arquivo só é recusado quando falta uma coluna
 * obrigatória, quando nenhuma linha é válida ou quando a maioria é inválida.
 */

export interface Leitura<T> {
  linhas: T[];
  descartadas: LinhaDescartada[];
  /** Linhas aceitas com um campo corrigido (ex.: data de entrega ilegível vira vazia) */
  corrigidas: LinhaDescartada[];
}

/** Acima desta fração de linhas inválidas, o arquivo provavelmente não é o que se espera. */
const MAXIMO_INVALIDAS = 0.5;

interface LinhaCsv {
  campos: Record<string, string>;
  /** Número da linha no arquivo (1 = cabeçalho) */
  linha: number;
}

function lerCsv(texto: string, arquivo: string, obrigatorias: string[]): { linhas: LinhaCsv[]; descartadas: LinhaDescartada[] } {
  const r = Papa.parse<Record<string, string>>(texto.replace(/^﻿/, "").trim(), {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.replace(/^﻿/, "").trim(),
  });
  const presentes = new Set(r.meta.fields ?? []);
  const faltando = obrigatorias.filter((c) => !presentes.has(c));
  if (faltando.length) throw new Error(`${arquivo}: colunas ausentes: ${faltando.join(", ")}`);

  const comErro = new Map<number, string>();
  for (const e of r.errors) {
    if (e.row !== undefined && e.row !== null && !comErro.has(e.row)) comErro.set(e.row, `linha mal formada (${e.message})`);
  }
  const linhas: LinhaCsv[] = [];
  const descartadas: LinhaDescartada[] = [];
  r.data.forEach((campos, i) => {
    const motivo = comErro.get(i);
    if (motivo) descartadas.push({ arquivo, linha: i + 2, motivo });
    else linhas.push({ campos, linha: i + 2 });
  });
  return { linhas, descartadas };
}

// ---------- Conversores tolerantes ----------

const texto = (v: string | undefined) => (v ?? "").trim();

/** Aceita 77.31, 77,31, 1.234,56, 1,234.56 e "R$ 77,31". Devolve NaN se não for número. */
export function numero(v: string | undefined): number {
  let s = texto(v).replace(/^R\$\s*/i, "").replace(/\s/g, "");
  if (!s) return Number.NaN;
  const ultimaVirgula = s.lastIndexOf(",");
  const ultimoPonto = s.lastIndexOf(".");
  if (ultimaVirgula > ultimoPonto) s = s.replace(/\./g, "").replace(",", "."); // vírgula é o decimal
  else if (ultimaVirgula >= 0) s = s.replace(/,/g, ""); // vírgula é separador de milhar
  else if ((s.match(/\./g) ?? []).length > 1) s = s.replace(/\./g, ""); // 1.234.567
  return /^[-+]?\d*\.?\d+$/.test(s) ? Number(s) : Number.NaN;
}

/** Aceita aaaa-mm-dd (com ou sem hora) e dd/mm/aaaa. Devolve ISO ou null se a data não existir. */
export function data(v: string | undefined): string | null {
  const s = texto(v);
  let a: number, m: number, d: number;
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/);
  const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (iso) [a, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (br) [a, m, d] = [Number(br[3]), Number(br[2]), Number(br[1])];
  else return null;
  const dt = new Date(Date.UTC(a, m - 1, d));
  if (dt.getUTCFullYear() !== a || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}

export function booleano(v: string | undefined): boolean {
  return ["true", "1", "sim", "s", "yes", "y", "verdadeiro"].includes(texto(v).toLowerCase());
}

const tiposValidos = new Set<string>(TIPOS_EXCECAO);
const normalizarTipo = (v: string | undefined) => texto(v).toLowerCase().replace(/[\s-]+/g, "_");

/**
 * Valida a leitura: recusa o arquivo se nenhuma linha for válida ou se a
 * maioria for inválida (mostrando as primeiras linhas e os motivos).
 */
function conferir<T>(arquivo: string, l: Leitura<T>): Leitura<T> {
  const total = l.linhas.length + l.descartadas.length;
  const exemplos = () =>
    l.descartadas
      .slice(0, 5)
      .map((d) => `linha ${d.linha}: ${d.motivo}`)
      .join("; ");
  if (!l.linhas.length) {
    throw new Error(total ? `${arquivo}: nenhuma linha válida (${exemplos()})` : `${arquivo}: arquivo sem linhas válidas`);
  }
  if (l.descartadas.length / total > MAXIMO_INVALIDAS) {
    throw new Error(`${arquivo}: ${l.descartadas.length} de ${total} linhas inválidas. Exemplos: ${exemplos()}`);
  }
  return l;
}

/** Converte cada linha ou devolve o motivo do descarte. */
function converter<T>(
  arquivo: string,
  csv: string,
  obrigatorias: string[],
  conv: (c: Record<string, string>, corrigir: (motivo: string) => void) => T | string,
): Leitura<T> {
  const { linhas, descartadas } = lerCsv(csv, arquivo, obrigatorias);
  const saida: Leitura<T> = { linhas: [], descartadas, corrigidas: [] };
  for (const { campos, linha } of linhas) {
    const r = conv(campos, (motivo) => saida.corrigidas.push({ arquivo, linha, motivo }));
    if (typeof r === "string") saida.descartadas.push({ arquivo, linha, motivo: r });
    else saida.linhas.push(r);
  }
  saida.descartadas.sort((a, b) => a.linha - b.linha);
  return conferir(arquivo, saida);
}

export function parseExcecoes(csv: string): Leitura<ExcecaoBruta> {
  const arquivo = "pedidos_excecao.csv";
  const obrigatorias = ["order_id", "customer_id", "valor", "tipo_excecao", "transportadora", "uf", "data_pedido", "data_prometida"];
  return converter(arquivo, csv, obrigatorias, (l, corrigir) => {
    const order_id = texto(l.order_id);
    const customer_id = texto(l.customer_id);
    if (!order_id) return "order_id vazio";
    if (!customer_id) return "customer_id vazio";
    const tipo = normalizarTipo(l.tipo_excecao);
    if (!tiposValidos.has(tipo)) return `tipo_excecao desconhecido "${texto(l.tipo_excecao)}"`;
    const valor = numero(l.valor);
    if (!(valor >= 0)) return `valor inválido "${texto(l.valor)}"`;
    const dataPedido = data(l.data_pedido);
    if (!dataPedido) return `data_pedido inválida "${texto(l.data_pedido)}"`;
    const dataPrometida = data(l.data_prometida);
    if (!dataPrometida) return `data_prometida inválida "${texto(l.data_prometida)}"`;

    let dataEntrega: string | null = null;
    if (texto(l.data_entrega)) {
      dataEntrega = data(l.data_entrega);
      if (!dataEntrega) corrigir(`data_entrega ilegível "${texto(l.data_entrega)}": tratada como não entregue`);
    }
    const qtd = numero(l.qtd_itens);
    return {
      order_id,
      customer_id,
      marca: texto(l.marca),
      data_pedido: dataPedido,
      valor,
      sku: texto(l.sku),
      descricao_produto: texto(l.descricao_produto),
      qtd_itens: qtd >= 1 ? Math.round(qtd) : 1,
      brinde_no_pedido: booleano(l.brinde_no_pedido),
      tipo_excecao: tipo as TipoExcecao,
      status: texto(l.status) || "aberta",
      transportadora: texto(l.transportadora),
      uf: texto(l.uf).toUpperCase(),
      cidade: texto(l.cidade),
      data_prometida: dataPrometida,
      data_entrega: dataEntrega,
      maquina: texto(l.maquina) || null,
      turno: texto(l.turno),
      cd: texto(l.cd),
      lote_produto: texto(l.lote_produto),
      data_abertura_excecao: data(l.data_abertura_excecao) ?? dataPedido,
    };
  });
}

export function parseClientes(csv: string): Leitura<Cliente> {
  const obrigatorias = ["customer_id", "n_pedidos", "receita_acumulada", "data_primeiro_pedido"];
  return converter("clientes.csv", csv, obrigatorias, (l) => {
    const customer_id = texto(l.customer_id);
    if (!customer_id) return "customer_id vazio";
    const receita = numero(l.receita_acumulada);
    if (!(receita >= 0)) return `receita_acumulada inválida "${texto(l.receita_acumulada)}"`;
    const primeiro = data(l.data_primeiro_pedido);
    if (!primeiro) return `data_primeiro_pedido inválida "${texto(l.data_primeiro_pedido)}"`;
    const n = numero(l.n_pedidos);
    const contatos = numero(l.n_contatos_atendimento);
    return {
      customer_id,
      n_pedidos: n >= 1 ? n : 1,
      receita_acumulada: receita,
      data_primeiro_pedido: primeiro,
      n_contatos_atendimento: contatos >= 0 ? contatos : 0,
    };
  });
}

export function parseTransportadoras(csv: string): Leitura<Transportadora> {
  const obrigatorias = ["transportadora", "uf_atendida", "sla_contratado_dias_uteis", "custo_medio_frete"];
  return converter("transportadoras.csv", csv, obrigatorias, (l) => {
    const transportadora = texto(l.transportadora);
    const uf = texto(l.uf_atendida).toUpperCase();
    if (!transportadora) return "transportadora vazia";
    if (!uf) return "uf_atendida vazia";
    const sla = numero(l.sla_contratado_dias_uteis);
    if (!(sla >= 0)) return `sla_contratado_dias_uteis inválido "${texto(l.sla_contratado_dias_uteis)}"`;
    const frete = numero(l.custo_medio_frete);
    if (!(frete >= 0)) return `custo_medio_frete inválido "${texto(l.custo_medio_frete)}"`;
    return { transportadora, uf_atendida: uf, sla_contratado_dias_uteis: Math.round(sla), custo_medio_frete: frete };
  });
}

/**
 * Ordem de avanço da tratativa. Quando o mesmo pedido tem o mesmo tipo de
 * exceção aberto duas vezes, mantemos o registro mais avançado: alguém já
 * trabalhou nele, e tratar a cópia "aberta" desperdiçaria capacidade.
 */
const AVANCO_STATUS: Record<string, number> = {
  aberta: 0,
  em_analise: 1,
  aguardando_cliente: 2,
  aguardando_transportadora: 2,
};

export function removerDuplicatas(excecoes: ExcecaoBruta[]): {
  unicas: ExcecaoBruta[];
  duplicatas: RelatorioQualidade["duplicatas"];
} {
  const porChave = new Map<string, ExcecaoBruta>();
  const duplicatas: RelatorioQualidade["duplicatas"] = [];
  for (const e of excecoes) {
    const chave = `${e.order_id}|${e.tipo_excecao}`;
    const atual = porChave.get(chave);
    if (!atual) {
      porChave.set(chave, e);
      continue;
    }
    const [manter, descartar] =
      (AVANCO_STATUS[e.status] ?? 0) > (AVANCO_STATUS[atual.status] ?? 0) ? [e, atual] : [atual, e];
    porChave.set(chave, manter);
    duplicatas.push({
      order_id: e.order_id,
      tipo_excecao: e.tipo_excecao,
      statusMantido: manter.status,
      statusDescartado: descartar.status,
    });
  }
  return { unicas: [...porChave.values()], duplicatas };
}

/**
 * "Hoje" de uma lista: a data mais recente que aparece nela (abertura da
 * exceção, pedido ou entrega). Na lista do desafio dá 2026-09-30; numa lista
 * de outro dia, a fila passa a ser calculada a partir daquele dia.
 */
export function inferirDataReferencia(base: Pick<BaseDados, "excecoes">): string | null {
  let max: string | null = null;
  for (const e of base.excecoes) {
    for (const d of [e.data_abertura_excecao, e.data_pedido, e.data_entrega]) if (d && (!max || d > max)) max = d;
  }
  return max;
}

export function carregarBase(csvs: { excecoes: string; clientes: string; transportadoras: string }): BaseDados {
  const excecoes = parseExcecoes(csvs.excecoes);
  const clientes = parseClientes(csvs.clientes);
  const transportadoras = parseTransportadoras(csvs.transportadoras);
  return {
    excecoes: excecoes.linhas,
    clientes: clientes.linhas,
    transportadoras: transportadoras.linhas,
    descartadas: [...excecoes.descartadas, ...clientes.descartadas, ...transportadoras.descartadas],
    corrigidas: [...excecoes.corrigidas, ...clientes.corrigidas, ...transportadoras.corrigidas],
  };
}
