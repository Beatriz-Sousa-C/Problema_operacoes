import type { ExcecaoAnalisada } from "./tipos";

export type Estrategia = "ordem_de_chegada" | "exposicao" | "custo_de_esperar";

export const NOMES_ESTRATEGIA: Record<Estrategia, string> = {
  ordem_de_chegada: "Ordem de chegada (processo atual)",
  exposicao: "Maior perda esperada hoje",
  custo_de_esperar: "Custo de esperar (solução)",
};

type Comparador = (a: ExcecaoAnalisada, b: ExcecaoAnalisada) => number;

/** Desempate final determinístico: o resultado nunca depende da ordem do arquivo. */
const porId: Comparador = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

const COMPARADORES: Record<Estrategia, Comparador> = {
  ordem_de_chegada: (a, b) =>
    a.data_abertura_excecao.localeCompare(b.data_abertura_excecao) || porId(a, b),
  exposicao: (a, b) => b.exposicao - a.exposicao || b.custoDeEsperar - a.custoDeEsperar || porId(a, b),
  // Decisão Z + X: primeiro o quanto a perda cresce se o pedido esperar;
  // empates (ex.: pedidos já na faixa máxima) são resolvidos pela perda atual.
  custo_de_esperar: (a, b) =>
    b.custoDeEsperar - a.custoDeEsperar || b.exposicao - a.exposicao || porId(a, b),
};

export function ordenar(excecoes: readonly ExcecaoAnalisada[], estrategia: Estrategia): ExcecaoAnalisada[] {
  return [...excecoes].sort(COMPARADORES[estrategia]);
}

export interface ItemFila {
  posicao: number;
  /** Índice do dia útil em que o pedido será tratado (0 = hoje) */
  dia: number;
  excecao: ExcecaoAnalisada;
}

export function montarFila(
  excecoes: readonly ExcecaoAnalisada[],
  capacidadeDiaria: number,
  estrategia: Estrategia = "custo_de_esperar",
): ItemFila[] {
  return ordenar(excecoes, estrategia).map((excecao, i) => ({
    posicao: i + 1,
    dia: Math.floor(i / capacidadeDiaria),
    excecao,
  }));
}
