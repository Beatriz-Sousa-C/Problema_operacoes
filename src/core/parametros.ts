import { feriadosNacionais } from "./calendario";

/**
 * Parâmetros de negócio (fonte: parametros.md do desafio).
 * Centralizados num único objeto tipado para que nenhuma regra de negócio
 * fique "escondida" como número mágico no meio do código.
 */
export interface FaixaCancelamento {
  /** Atraso mínimo (dias úteis, inclusivo) */
  min: number;
  /** Atraso máximo (dias úteis, inclusivo) */
  max: number;
  probabilidade: number;
}

export interface Parametros {
  /** Data de referência ("hoje") dos dados, ISO yyyy-mm-dd */
  dataReferencia: string;
  feriados: string[];
  /** Dias que a lista cobre (o enunciado diz "abertos nos últimos 60 dias"): base das projeções mensais */
  janelaDias: number;
  capacidadeDiaria: number;
  minutosPorTratativa: number;
  /** Custo da mercadoria como fração do valor do pedido */
  cmv: number;
  custoContato: number;
  faixasCancelamento: FaixaCancelamento[];
  recompra: {
    limiarReceitaVip: number;
    probabilidadeVip: number;
    probabilidadeDemais: number;
    /** Fator aplicado à recompra quando a exceção é mal resolvida */
    fatorMalResolvida: number;
    /** Histórico mínimo (meses) usado no cálculo de frequência: evita a ilusão de cliente novo */
    mesesMinimosHistorico: number;
    /** Teto de compras por ano: protege contra revendedores e erros de cadastro */
    compraMaximaPorAno: number;
  };
}

export const PARAMETROS: Parametros = {
  dataReferencia: "2026-09-30",
  // Feriados nacionais de 2025 a 2027: listas de outros períodos também contam dias úteis certo.
  feriados: [2025, 2026, 2027].flatMap(feriadosNacionais),
  janelaDias: 60,
  capacidadeDiaria: 150,
  minutosPorTratativa: 12,
  cmv: 0.24,
  custoContato: 9,
  faixasCancelamento: [
    { min: 1, max: 2, probabilidade: 0.04 },
    { min: 3, max: 5, probabilidade: 0.1 },
    { min: 6, max: 10, probabilidade: 0.22 },
    { min: 11, max: Number.POSITIVE_INFINITY, probabilidade: 0.4 },
  ],
  recompra: {
    limiarReceitaVip: 1500,
    probabilidadeVip: 0.7,
    probabilidadeDemais: 0.28,
    fatorMalResolvida: 0.5,
    mesesMinimosHistorico: 6,
    compraMaximaPorAno: 24,
  },
};

/** UFs por região, usadas para agrupar transportadora × região na busca de causas. */
export const REGIAO_POR_UF: Record<string, string> = {
  AC: "Norte", AM: "Norte", AP: "Norte", PA: "Norte", RO: "Norte", RR: "Norte", TO: "Norte",
  AL: "Nordeste", BA: "Nordeste", CE: "Nordeste", MA: "Nordeste", PB: "Nordeste",
  PE: "Nordeste", PI: "Nordeste", RN: "Nordeste", SE: "Nordeste",
  DF: "Centro-Oeste", GO: "Centro-Oeste", MS: "Centro-Oeste", MT: "Centro-Oeste",
  ES: "Sudeste", MG: "Sudeste", RJ: "Sudeste", SP: "Sudeste",
  PR: "Sul", RS: "Sul", SC: "Sul",
};
