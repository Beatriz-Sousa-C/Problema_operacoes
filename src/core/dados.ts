import Papa from "papaparse";
import type {
  BaseDados,
  Cliente,
  ExcecaoBruta,
  RelatorioQualidade,
  TipoExcecao,
  Transportadora,
} from "./tipos";
import { TIPOS_EXCECAO } from "./tipos";

/** Faz o parse de um CSV com cabeçalho. Funciona no servidor e no navegador. */
function lerCsv(texto: string): Record<string, string>[] {
  const r = Papa.parse<Record<string, string>>(texto.trim(), {
    header: true,
    skipEmptyLines: true,
  });
  if (r.errors.length) {
    const e = r.errors[0];
    throw new Error(`CSV inválido (linha ${e.row}): ${e.message}`);
  }
  return r.data;
}

function exigirColunas(linhas: Record<string, string>[], colunas: string[], arquivo: string) {
  const presentes = new Set(Object.keys(linhas[0] ?? {}));
  const faltando = colunas.filter((c) => !presentes.has(c));
  if (faltando.length) throw new Error(`${arquivo}: colunas ausentes: ${faltando.join(", ")}`);
}

const vazioParaNulo = (v: string | undefined) => (v && v.trim() !== "" ? v.trim() : null);

export function parseExcecoes(csv: string): ExcecaoBruta[] {
  const linhas = lerCsv(csv);
  exigirColunas(
    linhas,
    ["order_id", "customer_id", "valor", "tipo_excecao", "transportadora", "uf", "data_pedido", "data_prometida"],
    "pedidos_excecao.csv",
  );
  const tiposValidos = new Set<string>(TIPOS_EXCECAO);
  return linhas.map((l, i) => {
    if (!tiposValidos.has(l.tipo_excecao)) {
      throw new Error(`pedidos_excecao.csv linha ${i + 2}: tipo_excecao desconhecido "${l.tipo_excecao}"`);
    }
    return {
      order_id: l.order_id,
      customer_id: l.customer_id,
      marca: l.marca,
      data_pedido: l.data_pedido,
      valor: Number(l.valor),
      sku: l.sku,
      descricao_produto: l.descricao_produto,
      qtd_itens: Number(l.qtd_itens),
      brinde_no_pedido: l.brinde_no_pedido === "True" || l.brinde_no_pedido === "true",
      tipo_excecao: l.tipo_excecao as TipoExcecao,
      status: l.status,
      transportadora: l.transportadora,
      uf: l.uf,
      cidade: l.cidade,
      data_prometida: l.data_prometida,
      data_entrega: vazioParaNulo(l.data_entrega),
      maquina: vazioParaNulo(l.maquina),
      turno: l.turno,
      cd: l.cd,
      lote_produto: l.lote_produto,
      data_abertura_excecao: l.data_abertura_excecao,
    };
  });
}

export function parseClientes(csv: string): Cliente[] {
  return lerCsv(csv).map((l) => ({
    customer_id: l.customer_id,
    n_pedidos: Number(l.n_pedidos),
    receita_acumulada: Number(l.receita_acumulada),
    data_primeiro_pedido: l.data_primeiro_pedido,
    n_contatos_atendimento: Number(l.n_contatos_atendimento),
  }));
}

export function parseTransportadoras(csv: string): Transportadora[] {
  return lerCsv(csv).map((l) => ({
    transportadora: l.transportadora,
    uf_atendida: l.uf_atendida,
    sla_contratado_dias_uteis: Number(l.sla_contratado_dias_uteis),
    custo_medio_frete: Number(l.custo_medio_frete),
  }));
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

export function carregarBase(csvs: { excecoes: string; clientes: string; transportadoras: string }): BaseDados {
  return {
    excecoes: parseExcecoes(csvs.excecoes),
    clientes: parseClientes(csvs.clientes),
    transportadoras: parseTransportadoras(csvs.transportadoras),
  };
}
